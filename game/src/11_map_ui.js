// Minimap, full map & layered cartography + teleport planning (Parts A & B)
"use strict";
(function () {
  const G = window.G, P = G.PROJ, B = G.GEO.BOUNDS;
  const M = G.MAPS = { fm: { x: 0, y: 0, zoom: 0.06, drag: null, layers: {} } };

  const LAYER_DEFS = [
    ["terrain", "Terrain & forests", true],
    ["water", "Water & tides", true],
    ["roads", "Road network", true],
    ["rails", "Railways", true],
    ["stations", "Stations", true],
    ["pois", "Locations (780)", true],
    ["traffic", "Traffic & ferries", true],
    ["npcs", "Crowds", false],
    ["grid", "Graticule + scale", false],
    ["weather", "Weather overlay", true]
  ];
  LAYER_DEFS.forEach(([id, label, on]) => M.fm.layers[id] = on);
  M.LAYER_DEFS = LAYER_DEFS;

  // ---------- shared simplified world painter (used by minimap & fullmap) ----------
  function paintWorld(ctx, cam, W_, H_, opts) {
    const z = cam.zoom, L = opts.layers;
    const wx2s = (wx, wy) => [(wx - cam.x) * z + W_ / 2, (wy - cam.y) * z + H_ / 2];
    const tide = G.ENV.tide();
    // sea
    ctx.fillStyle = "#2e6b8a"; ctx.fillRect(0, 0, W_, H_);
    const tint = G.ENV.seasonTint();
    // land
    ctx.fillStyle = tint.land;
    for (const l of G.W.land) polyPath(ctx, l.pts, wx2s, true);
    ctx.fillStyle = "#c8b880";
    for (const l of G.W.islands) polyPath(ctx, l.pts, wx2s, true);
    if (L.terrain) {
      ctx.fillStyle = tint.for;
      for (const f of G.W.forest) polyPath(ctx, f.pts, wx2s, true);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (const h of G.W.hills) polyPath(ctx, h.pts, wx2s, true);
    }
    if (L.water) {
      ctx.strokeStyle = "#7fb8c8"; ctx.lineCap = "round";
      for (const wl of G.W.water) {
        const wpx = Math.max(1, wl.w * 2 * z * (1 + wl.tidal * 0.35 * tide / 4));
        ctx.lineWidth = wpx;
        linePath(ctx, wl.pts, wx2s);
      }
      ctx.fillStyle = "#8fd0e0";
      for (const lk of G.W.lakes) polyPath(ctx, lk.pts, wx2s, true);
    }
    if (L.roads) {
      const cls = z > 0.12 ? [0, 1, 2] : z > 0.05 ? [0, 1] : [0];
      const cols = ["#f0e0a0", "#d8cfb8", "#b8b0a0"], ws = [3.2, 2, 1.2];
      cls.forEach((c, i) => {
        ctx.strokeStyle = cols[c]; ctx.lineWidth = Math.max(ws[c] * (z > 0.1 ? 1 : 0.7), 0.6);
        for (const r of G.W.roads) if (r.cls === c) linePath(ctx, r.pts, wx2s);
      });
    }
    if (L.rails) {
      ctx.strokeStyle = "#9a8a70"; ctx.lineWidth = Math.max(1.6 * (z > 0.1 ? 1 : 0.6), 0.7);
      for (const r of G.W.rails) linePath(ctx, r.pts, wx2s);
    }
    // airports
    ctx.strokeStyle = "#d8e0e8"; ctx.lineWidth = 2;
    for (const a of G.W.airports) linePath(ctx, a.pts, wx2s);
    // traffic & ferries
    if (L.traffic) {
      if (z > 0.04) {
        ctx.fillStyle = "#ffffff";
        for (const b of G.TRAFFIC.boats) { const [sx, sy] = wx2s(b.x, b.y); ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3); }
        for (const t of G.TRAFFIC.trains) { const [sx, sy] = wx2s(t.x, t.y); ctx.fillStyle = "#e05050"; ctx.fillRect(sx - 2, sy - 1.2, 4, 2.4); }
        if (z > 0.08) { ctx.fillStyle = "rgba(255,255,255,0.85)"; for (const c of G.TRAFFIC.cars) { const [sx, sy] = wx2s(c.x, c.y); ctx.fillRect(sx - 1, sy - 1, 2, 2); } }
      }
    }
    // POI dots
    if (L.pois) {
      for (const p of G.POI.all) {
        const [sx, sy] = wx2s(p.x, p.y);
        if (sx < 0 || sy < 0 || sx > W_ || sy > H_) continue;
        const meta = G.CATMETA[p.cat] || G.CATMETA.locality;
        ctx.beginPath(); ctx.arc(sx, sy, p.cat === "locality" ? 1.3 : 2.1, 0, 7);
        ctx.fillStyle = p.visited ? "#ffffff" : meta.col; ctx.fill();
        if (p === opts.sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, 7); ctx.stroke(); }
        if (z > 0.09 && (p.cat !== "locality" || opts.names)) {
          ctx.font = "9px system-ui"; ctx.textAlign = "center";
          ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(p.name, sx + 0.7, sy - 3.3);
          ctx.fillStyle = "#eee"; ctx.fillText(p.name, sx, sy - 4);
        }
      }
    }
    // graticule + scale
    if (L.grid) {
      ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 1;
      for (let la = Math.ceil(B.la0 * 4) / 4; la <= B.la1; la += 0.25) { const [, sy] = wx2s(0, P.latToY(la)); ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W_, sy); ctx.stroke(); }
      for (let lo = Math.ceil(B.lo0 * 4) / 4; lo <= B.lo1; lo += 0.25) { const [sx] = wx2s(P.lonToX(lo), 0); ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H_); ctx.stroke(); }
      const mpp = 1 / z;
      const bar = mpp > 2000 ? 10000 : mpp > 400 ? 5000 : mpp > 80 ? 1000 : 100;
      const px = bar * z;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(12, H_ - 14); ctx.lineTo(12 + px, H_ - 14); ctx.stroke();
      ctx.font = "10px system-ui"; ctx.fillStyle = "#fff"; ctx.textAlign = "left";
      ctx.fillText(G.fmt.m(bar), 14, H_ - 18);
    }
    // player + waypoint
    if (opts.player) {
      const [sx, sy] = wx2s(G.PL.x, G.PL.y);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(G.PL.heading);
      ctx.fillStyle = "#40e0ff"; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#043040"; ctx.stroke(); ctx.restore();
      if (G.WAYPOINT.on) {
        const [wx, wy] = wx2s(G.WAYPOINT.x, G.WAYPOINT.y);
        ctx.strokeStyle = "#ffd040"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(wx, wy, 5, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(wx, wy); ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }
  function polyPath(ctx, pts, f, close) {
    ctx.beginPath();
    pts.forEach((p, i) => { const [sx, sy] = f(p[0], p[1]); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    if (close) ctx.closePath();
    ctx.fill();
  }
  function linePath(ctx, pts, f) {
    ctx.beginPath();
    pts.forEach((p, i) => { const [sx, sy] = f(p[0], p[1]); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.stroke();
  }

  // ---------- minimap ----------
  const MM = M.minimap = {
    cvs: null, ctx: null, size: 0,
    init(cvs) { MM.cvs = cvs; MM.ctx = cvs.getContext("2d"); MM.size = cvs.width; },
    draw() {
      if (!MM.cvs) return;
      const ctx = MM.ctx, S = MM.size;
      const cam = G.CAM;
      const view = Math.max(9000, 16000 / Math.max(0.2, cam.zoom * 4)); // meters shown
      const mz = S / view;
      const mcam = { x: cam.x, y: cam.y, zoom: mz };
      paintWorld(ctx, mcam, S, S, { layers: { terrain: 1, water: 1, roads: 1, rails: 1, stations: 0, pois: 1, traffic: 1, npcs: 0, grid: 0, weather: 1 }, player: true });
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, S - 2, S - 2);
      ctx.font = "9px system-ui"; ctx.fillStyle = "#fff"; ctx.textAlign = "left";
      ctx.fillText("N ↑", 6, 12);
    }
  };

  // ---------- full map ----------
  const FM = M.fullmap = {
    open: false, cvs: null, ctx: null, sel: null,
    init(cvs) {
      FM.cvs = cvs; FM.ctx = cvs.getContext("2d");
      const fm = M.fm;
      fm.x = P.lonToX(72.95); fm.y = P.latToY(19.10);
      fit();
      cvs.addEventListener("pointerdown", e => { fm.drag = [e.clientX, e.clientY]; cvs.setPointerCapture(e.pointerId); });
      cvs.addEventListener("pointermove", e => {
        if (!fm.drag) return;
        const dx = e.clientX - fm.drag[0], dy = e.clientY - fm.drag[1];
        fm.drag = [e.clientX, e.clientY];
        fm.x -= dx / fm.zoom; fm.y -= dy / fm.zoom;
        FM.draw();
      });
      cvs.addEventListener("pointerup", e => {
        fm.drag = null;
        const r = cvs.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        const wx = fm.x + (sx - r.width / 2) / fm.zoom, wy = fm.y + (sy - r.height / 2) / fm.zoom;
        const near = G.POI.nearby(wx, wy, 24 / fm.zoom + 400);
        FM.select(near.length ? near[0] : null);
      });
      cvs.addEventListener("wheel", e => {
        e.preventDefault();
        const r = cvs.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        const w1 = [fm.x + (sx - r.width / 2) / fm.zoom, fm.y + (sy - r.height / 2) / fm.zoom];
        fm.zoom = G.clamp(fm.zoom * Math.exp(-e.deltaY * 0.0012), 0.02, 0.5);
        const w2 = [fm.x + (sx - r.width / 2) / fm.zoom, fm.y + (sy - r.height / 2) / fm.zoom];
        fm.x += w1[0] - w2[0]; fm.y += w1[1] - w2[1];
        FM.draw();
      }, { passive: false });
    },
    select(p) { FM.sel = p; G.emit("fmsel", p); FM.draw(); },
    show() { FM.open = true; document.getElementById("fullmap").style.display = "flex"; fit(); FM.draw(); },
    hide() { FM.open = false; document.getElementById("fullmap").style.display = "none"; },
    draw() {
      const cvs = FM.cvs, ctx = FM.ctx;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = cvs.parentElement.getBoundingClientRect();
      cvs.width = r.width * dpr; cvs.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fm = M.fm;
      paintWorld(ctx, fm, r.width, r.height, { layers: M.fm.layers, player: true, sel: FM.sel, names: fm.zoom > 0.16 });
      if (M.fm.layers.weather) weatherOverlay(ctx, r.width, r.height);
      ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "10px system-ui"; ctx.textAlign = "right";
      ctx.fillText("Map data: game geometry in WGS84 · inspired by OpenStreetMap contributors", r.width - 8, r.height - 8);
    }
  };
  function fit() {
    const fm = M.fm;
    const el = document.getElementById("fullmapCanvas");
    if (!el) return;
    const w = el.parentElement.clientWidth, h = el.parentElement.clientHeight;
    fm.zoom = Math.min(w / ((B.lo1 - B.lo0) * P.MLAT), h / ((B.la1 - B.la0) * P.MLON)) * 0.98;
    fm.x = P.lonToX((B.lo0 + B.lo1) / 2); fm.y = P.latToY((B.la0 + B.la1) / 2);
  }
  function weatherOverlay(ctx, w, h) {
    const env = G.ENV;
    if (env.rain > 0.03) {
      ctx.fillStyle = `rgba(60,90,140,${env.rain * 0.22})`;
      ctx.fillRect(0, 0, w, h);
      ctx.font = "12px system-ui"; ctx.fillStyle = "#cfe4ff"; ctx.textAlign = "left";
      ctx.fillText("🌧 monsoon shower", 10, 18);
    }
    const s = env.season();
    ctx.font = "11px system-ui"; ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.textAlign = "left";
    ctx.fillText(`${s} · ${env.tempC()}°C · tide ${env.tide().toFixed(1)} m · wind ${Math.round(env.windSpd * 3.6)} km/h`, 10, h - 10);
  }

  M.paintWorld = paintWorld;
})();
