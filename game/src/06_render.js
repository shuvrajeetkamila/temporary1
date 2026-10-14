// World renderer: terrain, water, roads, rails, buildings, landmarks, labels
"use strict";
(function () {
  const G = window.G, W = G.W, P = G.PROJ;
  let R = G.R = { cvs: null, ctx: null, dpr: 1 };

  R.init = (cvs) => { R.cvs = cvs; R.ctx = cvs.getContext("2d"); R.resize(); };
  R.resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    R.dpr = dpr;
    R.cvs.width = Math.round(window.innerWidth * dpr);
    R.cvs.height = Math.round(window.innerHeight * dpr);
    R.cvs.style.width = window.innerWidth + "px";
    R.cvs.style.height = window.innerHeight + "px";
    G.CAM.w = window.innerWidth; G.CAM.h = window.innerHeight;
  };

  // pre-built Path2D in world meters
  const pathCache = {};
  function P2(pts, close) {
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    if (close) p.closePath();
    return p;
  }
  R.prep = () => {
    const PC = pathCache;
    PC.land = W.land.map(l => P2(l.pts, 1));
    PC.islands = W.islands.map(l => P2(l.pts, 1));
    PC.water = W.water.map(w => P2(w.pts));
    PC.lakes = W.lakes.map(l => P2(l.pts, 1));
    PC.hills = W.hills.map(h => P2(h.pts, 1));
    PC.forest = W.forest.map(f => P2(f.pts, 1));
    PC.roads = W.roads.map(r => P2(r.pts));
    PC.rails = W.rails.map(r => P2(r.pts));
    PC.runways = W.airports.map(a => P2(a.pts));
    PC.ferries = W.ferries.map(f => P2(f.pts.map(q => P.lonLatToXY(q[0], q[1]))));
  };

  const inViewBB = (bb, pad) => {
    const c = G.CAM, hw = c.w / 2 / c.zoom + pad, hh = c.h / 2 / c.zoom + pad;
    return !(bb[2] < c.x - hw || bb[0] > c.x + hw || bb[3] < c.y - hh || bb[1] > c.y + hh);
  };

  // ---------------- procedural buildings ----------------
  const PALETTE_COLORS = [
    [/glass|aluminium/i, ["#8fb2c8", "#a8c4d4", "#7ca0b8"]],
    [/laterite|khakan|basalt/i, ["#b06a42", "#a05c38", "#c07a50"]],
    [/lime plaster|mosaic|terrazzo|red oxide/i, ["#e2d6c0", "#d8c8b0", "#eadfca"]],
    [/MS lattice|corrugated|epoxy/i, ["#9aa4a8", "#8a9498", "#aab4b8"]],
    [/concrete|cement/i, ["#c4bcb0", "#b8b0a4", "#ccc6ba"]],
    [/tar macadam/i, ["#b0a89c", "#a8a090", "#c0b8ac"]]
  ];
  function palColor(pal, rnd) {
    for (const [re, cols] of PALETTE_COLORS) if (re.test(pal || "")) return cols[Math.floor(rnd() * cols.length)];
    return ["#cfc5b4", "#c2b8a6", "#d8cec0"][Math.floor(rnd() * 3)];
  }
  const blockCache = new Map();
  function blocksFor(poi) {
    let b = blockCache.get(poi.name);
    if (b) return b;
    const rnd = G.rng((poi.x * 13 + poi.y * 7) | 0);
    const n = 10 + Math.floor(rnd() * 22);
    const rad = 220 + rnd() * 520;
    const pal = poi.palette || "";
    b = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad;
      const bx = poi.x + Math.cos(a) * d, by = poi.y + Math.sin(a) * d;
      if (G.TERRAIN.waterAt(bx, by, 1.5)) continue;
      const w = 12 + rnd() * 34, h = 10 + rnd() * 26;
      const rot = poi.region === "navi mumbai core" || poi.region === "kharghar panvel" ? 0.12 : rnd() * Math.PI; // CIDCO sector grid is planned/regular
      b.push({ x: bx, y: by, w, h, rot, c: palColor(pal, rnd), tall: rnd() < (poi.region === "south mumbai" ? 0.22 : 0.08) });
    }
    blockCache.set(poi.name, b);
    return b;
  }

  // ---------------- landmark doodles ----------------
  function drawLandmark(ctx, l, z) {
    const s = Math.max(1.2, 14 / z); // size in world m
    ctx.save();
    ctx.translate(l.x, l.y);
    ctx.lineJoin = "round";
    const ink = G.ENV.sun().day > 0.25 ? "#3a3a40" : "#f0e0a0";
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = s * 0.14;
    switch (l.a) {
      case "gateway": { // arch
        ctx.beginPath(); ctx.moveTo(-s, s * 0.5); ctx.lineTo(-s, -s * 0.5); ctx.arc(0, -s * 0.5, s, Math.PI, 0); ctx.lineTo(s, s * 0.5);
        ctx.moveTo(-s * 0.45, s * 0.5); ctx.lineTo(-s * 0.45, -s * 0.35); ctx.lineTo(s * 0.45, -s * 0.35); ctx.lineTo(s * 0.45, s * 0.5);
        ctx.stroke(); break;
      }
      case "dome": case "dargah": {
        ctx.beginPath(); ctx.moveTo(-s * 0.8, s * 0.4); ctx.lineTo(-s * 0.8, -s * 0.1); ctx.arc(0, -s * 0.1, s * 0.8, Math.PI, 0); ctx.lineTo(s * 0.8, s * 0.4); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -s * 0.9); ctx.lineTo(0, -s * 1.25); ctx.stroke(); break;
      }
      case "cst": {
        ctx.beginPath(); ctx.moveTo(-s * 1.4, s * 0.5); ctx.lineTo(-s * 1.4, -s * 0.2); ctx.lineTo(-s * 0.5, -s * 0.2); ctx.lineTo(-s * 0.5, -s * 0.6); ctx.arc(0, -s * 0.6, s * 0.5, Math.PI, 0); ctx.lineTo(s * 0.5, -s * 0.2); ctx.lineTo(s * 1.4, -s * 0.2); ctx.lineTo(s * 1.4, s * 0.5); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -s * 1.1); ctx.lineTo(0, -s * 1.6); ctx.stroke(); break;
      }
      case "fort": case "fortwall": {
        ctx.strokeRect(-s, -s * 0.8, s * 2, s * 1.6);
        ctx.beginPath(); ctx.arc(-s, -s * 0.8, s * 0.28, 0, 7); ctx.arc(s, -s * 0.8, s * 0.28, 0, 7); ctx.stroke(); break;
      }
      case "lighthouse": {
        ctx.beginPath(); ctx.moveTo(-s * 0.25, s * 0.6); ctx.lineTo(-s * 0.12, -s); ctx.lineTo(s * 0.12, -s); ctx.lineTo(s * 0.25, s * 0.6); ctx.closePath(); ctx.stroke();
        if (G.ENV.sun().day < 0.3) { ctx.strokeStyle = "#ffe27a"; ctx.beginPath(); ctx.arc(0, -s, s * 0.3, 0, 7); ctx.stroke(); }
        break;
      }
      case "cranes": {
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(i * s * 1.6 - s * 0.3, s * 0.7); ctx.lineTo(i * s * 1.6 - s * 0.3, -s * 0.9); ctx.lineTo(i * s * 1.6 + s * 1.1, -s * 0.9); ctx.stroke();
        } break;
      }
      case "wheel": {
        ctx.beginPath(); ctx.arc(0, 0, s * 0.9, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.9); } ctx.stroke(); break;
      }
      case "tower": { ctx.strokeRect(-s * 0.4, -s * 1.6, s * 0.8, s * 2.4); ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.lineTo(0, -s * 2.1); ctx.stroke(); break; }
      case "temple": {
        ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.5); ctx.lineTo(-s * 0.35, -s * 0.3); ctx.lineTo(0, -s); ctx.lineTo(s * 0.35, -s * 0.3); ctx.lineTo(s * 0.7, s * 0.5); ctx.closePath(); ctx.stroke(); break;
      }
      case "church": {
        ctx.strokeRect(-s * 0.5, -s * 0.3, s, s * 0.9);
        ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.lineTo(0, -s); ctx.moveTo(-s * 0.2, -s * 0.75); ctx.lineTo(s * 0.2, -s * 0.75); ctx.stroke(); break;
      }
      case "pagoda": {
        for (let i = 0; i < 3; i++) { const w = s * (1.3 - i * 0.35); ctx.beginPath(); ctx.moveTo(-w, s * 0.5 - i * s * 0.55); ctx.lineTo(w, s * 0.5 - i * s * 0.55); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(0, -s * 1.8); ctx.stroke(); break;
      }
      case "dam": {
        ctx.beginPath(); ctx.moveTo(-s * 1.4, s * 0.4); ctx.lineTo(-s * 1.2, -s * 0.3); ctx.lineTo(s * 1.2, -s * 0.3); ctx.lineTo(s * 1.4, s * 0.4); ctx.stroke(); break;
      }
      case "caves": {
        ctx.beginPath(); ctx.arc(0, s * 0.2, s * 0.9, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, s * 0.5, s * 0.4, Math.PI, 0); ctx.stroke(); break;
      }
      case "sealink": {
        ctx.beginPath(); ctx.moveTo(0, s * 0.8); ctx.lineTo(0, -s * 1.6); ctx.moveTo(-s * 0.8, -s * 0.6); ctx.lineTo(s * 0.8, -s * 0.6); ctx.stroke(); break;
      }
    }
    ctx.restore();
  }

  // ---------------- main draw ----------------
  R.draw = (dt) => {
    const ctx = R.ctx, cam = G.CAM, env = G.ENV, dpr = R.dpr;
    const z = cam.zoom, day = env.sun().day, tint = env.seasonTint();
    const w = cam.w, h = cam.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // sky/sea base — tint by time of day
    const seaDay = "#2e6b8a", seaNight = "#0c2434";
    const sea = day > 0.02 ? mixHex(seaNight, seaDay, day) : seaNight;
    ctx.fillStyle = env.rain > 0.3 ? mixHex(sea, "#556070", 0.35) : sea;
    ctx.fillRect(0, 0, w, h);
    // world transform
    const tx = dpr * (w / 2 - cam.x * z), ty = dpr * (h / 2 - cam.y * z);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, tx, ty);
    const tide = env.tide();

    // land
    const landCol = day > 0.02 ? mixHex("#1a2418", tint.land, Math.min(1, day * 1.1)) : "#141d14";
    ctx.fillStyle = landCol;
    ctx.strokeStyle = mixHex(sea, "#c8b880", 0.5); ctx.lineWidth = 1.2 / z * Math.min(3, z * 6 + 0.5);
    W.land.forEach((l, i) => { if (inViewBB(l.bb, 3000)) { ctx.fill(pathCache.land[i]); if (z > 0.05) ctx.stroke(pathCache.land[i]); } });
    W.islands.forEach((l, i) => { if (inViewBB(l.bb, 2000)) { ctx.fill(pathCache.islands[i]); if (z > 0.05) ctx.stroke(pathCache.islands[i]); } });

    // hills (subtle shade) & forests
    if (z > 0.08) {
      ctx.fillStyle = "rgba(0,0,0,0.10)";
      W.hills.forEach((hl, i) => { if (inViewBB(hl.bb, 500)) ctx.fill(pathCache.hills[i]); });
      ctx.fillStyle = day > 0.02 ? tint.for : "#16201a";
      W.forest.forEach((f, i) => { if (inViewBB(f.bb, 500)) ctx.fill(pathCache.forest[i]); });
    }

    // tidal water overlays
    ctx.lineCap = "round";
    W.water.forEach((wl, i) => {
      if (!inViewBB(wl.bb, 2500)) return;
      const wpx = (wl.w * (1 + wl.tidal * 0.35 * (tide / 4))) * 2;
      ctx.strokeStyle = mixHex(sea, "#7fb8c8", 0.12);
      ctx.lineWidth = Math.max(wpx, 1.5 / z);
      ctx.stroke(pathCache.water[i]);
    });
    // lakes
    ctx.fillStyle = mixHex(sea, "#8fd0e0", 0.25);
    W.lakes.forEach((l, i) => { if (inViewBB(l.bb, 500)) ctx.fill(pathCache.lakes[i]); });

    // roads
    const roadCls = z > 3 ? [0, 1, 2] : z > 0.55 ? [0, 1] : [0];
    const rw = [Math.max(26 / 1, 0), 14, 8];
    for (const cls of roadCls) {
      ctx.lineWidth = Math.max(rw[cls] * Math.min(1, z * 0.8), 1.4 / z);
      ctx.strokeStyle = cls === 0 ? "#e8d898" : cls === 1 ? "#d8cfb8" : "#b8b0a0";
      ctx.globalAlpha = Math.min(1, 0.5 + z * 2);
      W.roads.forEach((r, i) => { if (r.cls === cls && inViewBB(r.bb, 400)) ctx.stroke(pathCache.roads[i]); });
      ctx.globalAlpha = 1;
    }
    // wet sheen in rain
    if (env.rain > 0.35 && z > 0.5) {
      ctx.strokeStyle = "rgba(180,220,255,0.16)"; ctx.lineWidth = Math.max(30 * Math.min(1, z), 2 / z);
      W.roads.forEach((r, i) => { if (r.cls <= 1 && inViewBB(r.bb, 400)) ctx.stroke(pathCache.roads[i]); });
    }

    // rails
    if (z > 0.18) {
      ctx.lineWidth = Math.max(7 * Math.min(1, z * 0.7), 1.6 / z);
      ctx.strokeStyle = "#887860";
      W.rails.forEach((r, i) => { if (inViewBB(r.bb, 300)) ctx.stroke(pathCache.rails[i]); });
      if (z > 1.2) { // sleepers
        ctx.lineWidth = 1 / z * 2; ctx.strokeStyle = "rgba(60,50,40,0.5)";
        W.rails.forEach(r => {
          if (!inViewBB(r.bb, 100)) return;
          for (let i = 0; i < r.pts.length - 1; i++) {
            const a = r.pts[i], b = r.pts[i + 1];
            const d = G.dist(a[0], a[1], b[0], b[1]), n = Math.floor(d / 14);
            const dx = (b[0] - a[0]) / d, dy = (b[1] - a[1]) / d, px = -dy, py = dx;
            for (let j = 0; j < n; j++) {
              const t = j / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
              if (x < cam.x - 400 || x > cam.x + 400 || y < cam.y - 400 || y > cam.y + 400) continue;
              ctx.beginPath(); ctx.moveTo(x + px * 4, y + py * 4); ctx.lineTo(x - px * 4, y - py * 4); ctx.stroke();
            }
          }
        });
      }
    }
    // runways + helipads
    ctx.fillStyle = "#5a5f66"; ctx.strokeStyle = "#c8d8e8"; ctx.lineWidth = 1 / z;
    W.airports.forEach((a, i) => { if (inViewBB(a.bb, 300)) { ctx.lineWidth = Math.max(45 * Math.min(1, z * 0.5), 2 / z); ctx.strokeStyle = "#6a6f76"; ctx.stroke(pathCache.runways[i]); } });
    W.helipads.forEach(hp => { if (Math.abs(hp.x - cam.x) < 600 / z + 200 && Math.abs(hp.y - cam.y) < 600 / z + 200) { ctx.beginPath(); ctx.arc(hp.x, hp.y, 12, 0, 7); ctx.fillStyle = "#6a6f76"; ctx.fill(); ctx.strokeStyle = "#e8e8e8"; ctx.lineWidth = 1.5 / z; ctx.stroke(); } });

    // ferry routes
    if (z > 0.15) {
      ctx.setLineDash([8 / z, 8 / z]); ctx.strokeStyle = "rgba(220,240,255,0.25)"; ctx.lineWidth = 1.2 / z;
      pathCache.ferries.forEach((f, i) => { if (inViewBB(G.bbox(W.ferries[i].pts.map(p => P.lonLatToXY(p[0], p[1]))), 500)) ctx.stroke(f); });
      ctx.setLineDash([]);
    }

    // buildings
    if (z > 5.5) {
      const near = G.POI.nearby(cam.x, cam.y, Math.max(900, w / z));
      for (const poi of near) {
        for (const b of blocksFor(poi)) {
          if (Math.abs(b.x - cam.x) > w / z + 80 || Math.abs(b.y - cam.y) > h / z + 80) continue;
          ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
          const shade = 0.75 + 0.25 * Math.min(1, day + 0.3);
          ctx.fillStyle = shadeHex(b.c, shade);
          const bh = b.tall ? 2.2 : 1;
          ctx.fillRect(-b.w / 2, -b.h / 2 - bh * 2 / z * z, b.w, b.h);
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
          ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 0.8 / z;
          ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
          ctx.restore();
        }
      }
    }

    // landmark doodles
    if (z > 0.6) for (const l of W.landmarks) {
      if (Math.abs(l.x - cam.x) < w / z + 150 && Math.abs(l.y - cam.y) < h / z + 150) drawLandmark(ctx, l, z);
    }

    // trees at street zoom in forests
    if (z > 8) {
      ctx.fillStyle = "rgba(20,60,20,0.5)";
      for (const f of W.forest) {
        if (!inViewBB(f.bb, 100)) continue;
        const [x0, y0, x1, y1] = f.bb;
        const step = 60;
        for (let x = Math.floor((cam.x - w / z) / step) * step; x < cam.x + w / z; x += step)
          for (let y = Math.floor((cam.y - h / z) / step) * step; y < cam.y + h / z; y += step) {
            if (!G.inPoly(x, y, f.pts)) continue;
            const jx = x + (G.hash2(x, y) - 0.5) * 30, jy = y + (G.hash2(y, x) - 0.5) * 30;
            ctx.beginPath(); ctx.arc(jx, jy, 4 + G.hash2(x + 1, y) * 3, 0, 7); ctx.fill();
          }
      }
    }

    // ENTITY LAYERS (traffic, npc, player drawn by their modules)
    G.emit("drawworld", { ctx, z, day, tint });

    // night city glow
    if (day < 0.45 && z < 6) {
      ctx.globalCompositeOperation = "lighter";
      for (const p of G.POI.all) {
        if (p._d > 20000 && Math.abs(p.x - cam.x) > w / z + 3000) continue;
        if (Math.abs(p.x - cam.x) > w / z + 2000 || Math.abs(p.y - cam.y) > h / z + 2000) continue;
        const r = (60 + (p.cat === "rail" ? 60 : 20)) / Math.max(0.25, z) / 8;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        const a = (0.10 * (1 - day)) * (p.cat === "rail" ? 1.6 : 1);
        g.addColorStop(0, `rgba(255,220,140,${a})`); g.addColorStop(1, "rgba(255,220,140,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    // ---------------- labels (screen space) ----------------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // region labels at far zoom
    if (z < 0.9) {
      ctx.textAlign = "center";
      for (const rl of W.regionLabels) {
        const [sx, sy] = cam.w2s(rl.x, rl.y);
        if (sx < -100 || sy < -50 || sx > w + 100 || sy > h + 50) continue;
        const fs = Math.max(10, Math.min(26, 14 * rl.s * (0.6 + 0.5 / (z + 0.4))));
        ctx.font = `${fs}px Georgia, serif`;
        ctx.fillStyle = `rgba(240,245,250,${0.30 + 0.25 * (1 - Math.min(1, z))})`;
        ctx.fillText(rl.n, sx, sy);
      }
    }
    // POI dots + names
    drawPOILabels(ctx, z, day, w, h);
    // rain overlay (screen space)
    if (env.rain > 0.02) drawRain(ctx, env, w, h, dt);
    if (env.lightning > 0) { ctx.fillStyle = `rgba(255,255,255,${env.lightning * 0.35})`; ctx.fillRect(0, 0, w, h); }
    // night vignette
    if (day < 0.5) { ctx.fillStyle = `rgba(8,12,28,${(1 - day) * 0.28})`; ctx.fillRect(0, 0, w, h); }
  };

  function drawPOILabels(ctx, z, day, w, h) {
    const cam = G.CAM;
    const maxD = z > 8 ? 1200 : z > 2 ? 2600 : z > 0.6 ? 6000 : z > 0.2 ? 20000 : 60000;
    const list = G.POI.nearby(cam.x, cam.y, maxD);
    ctx.textAlign = "center";
    let lastSy = -999, font = 11;
    for (const p of list) {
      const [sx, sy] = cam.w2s(p.x, p.y);
      if (sx < -60 || sy < -30 || sx > w + 60 || sy > h + 30) continue;
      const meta = G.CATMETA[p.cat] || G.CATMETA.locality;
      const imp = (p.cat !== "locality" ? 2 : 1) * (p.visited ? 1.3 : 1);
      const minZ = p.cat === "locality" ? 0.45 : 0.12;
      if (z < minZ && imp < 1.5) continue;
      // dot
      ctx.beginPath(); ctx.arc(sx, sy, p === G.UI.hoverPoi ? 5 : 3.2, 0, 7);
      ctx.fillStyle = p.visited ? "#fff" : meta.col; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1; ctx.stroke();
      if (p.visited) { ctx.strokeStyle = "#9fdd8a"; ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, 7); ctx.stroke(); }
      // name
      if (sy - lastSy > 14) {
        ctx.font = `${font}px system-ui,sans-serif`;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillText(p.name, sx + 1, sy - 7.5);
        ctx.fillStyle = "#f2f6fa";
        ctx.fillText(p.name, sx, sy - 8.5);
        lastSy = sy;
      }
    }
  }

  function drawRain(ctx, env, w, h, dt) {
    const n = Math.floor(env.rain * 260);
    const rnd = G.rng(99);
    ctx.strokeStyle = "rgba(200,220,255,0.35)"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const seed = (i * 97 + Math.floor(G.ENV.t * 22)) % 10000;
      const x = G.hash2(seed, 7) * w, y = (G.hash2(seed, 13) * h + (G.ENV.t * 480 * env.rain)) % h;
      ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 13);
    }
    ctx.stroke();
  }

  // color helpers
  function mixHex(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(G.lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
    const g = Math.round(G.lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
    const bl = Math.round(G.lerp(pa & 255, pb & 255, t));
    return `rgb(${r},${g},${bl})`;
  }
  function shadeHex(hex, f) {
    const p = parseInt(hex.slice(1), 16);
    const r = Math.round(Math.min(255, ((p >> 16) & 255) * f)), g = Math.round(Math.min(255, ((p >> 8) & 255) * f)), b = Math.round(Math.min(255, (p & 255) * f));
    return `rgb(${r},${g},${b})`;
  }
  G.mixHex = mixHex;
})();
