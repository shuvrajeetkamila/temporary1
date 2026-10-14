// Main: boot, game loop, player & waypoint drawing, save/load
"use strict";
(function () {
  const G = window.G;

  G.WAYPOINT = {
    on: false, x: 0, y: 0, name: "",
    set(x, y, name) { this.on = true; this.x = x; this.y = y; this.name = name || ""; },
    clear() { this.on = false; }
  };

  window.addEventListener("resize", () => { G.R.resize(); });

  function boot() {
    G.POI.build();
    G.R.init(document.getElementById("game"));
    G.R.prep();
    G.initCamera(G.R.cvs);
    G.MAPS.minimap.init(document.getElementById("minimap"));
    G.MAPS.fullmap.init(document.getElementById("fullmapCanvas"));
    G.UI.buildSide();
    G.UI.disc.markAll();
    G.ECON.refresh();
    G.ENV.startRealClock();

    // start at the Gateway of India
    const gw = G.POI.all.find(p => p.name === "Gateway of India");
    const start = gw || G.POI.all[0];
    G.PL.x = start.x; G.PL.y = start.y;
    G.CAM.jumpTo(start.x, start.y, 1.6);
    // restore save
    const sv = G.store.get("save", null);
    if (sv) {
      G.PL.x = sv.x; G.PL.y = sv.y; G.ENV.t = sv.t;
      if (sv.mode) G.PL.mode = sv.mode;
      G.CAM.jumpTo(sv.x, sv.y, sv.z || 1.6);
    }
    G.emit("toast", "Loaded at " + (G.POI.nearest(G.PL.x, G.PL.y, 1500) || { name: "the realm" }).name);
    loop.last = performance.now();
    requestAnimationFrame(loop);
  }

  // entity layers registered into the world render
  G.on("drawworld", ({ ctx, z }) => {
    G.TRAFFIC_DRAW.draw(ctx, z);
    G.NPC.draw(ctx, z);
    drawWaypoint(ctx, z);
    drawPlayer(ctx, z);
  });

  function drawWaypoint(ctx, z) {
    const wp = G.WAYPOINT;
    if (!wp.on) return;
    const [sx, sy] = G.CAM.w2s(wp.x, wp.y);
    if (sx < -30 || sy < -30 || sx > G.CAM.w + 30 || sy > G.CAM.h + 30) return;
    ctx.strokeStyle = "#ffd040"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 8 + Math.sin(G.ENV.t) * 2, 0, 7); ctx.stroke();
    ctx.font = "11px system-ui"; ctx.textAlign = "center"; ctx.fillStyle = "#ffd040";
    ctx.fillText("📍 " + wp.name, sx, sy - 14);
  }

  function drawPlayer(ctx, z) {
    const pl = G.PL;
    const [sx, sy] = G.CAM.w2s(pl.x, pl.y);
    const t = G.VEHTYPES[pl.mode];
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(pl.heading + (pl.bank || 0));
    if (pl.mode === "foot") {
      ctx.fillStyle = "#ffd9a0"; ctx.beginPath(); ctx.arc(0, 0, Math.max(2.5, 0.4 * z), 0, 7); ctx.fill();
      ctx.strokeStyle = "#043040"; ctx.lineWidth = 1; ctx.stroke();
    } else {
      const L = Math.max(6, (pl.mode === "truck" || pl.mode === "bus" ? 14 : 8) * Math.min(3, Math.max(0.35, z * 0.35)));
      const Wd = L * 0.5;
      ctx.fillStyle = t.col;
      ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1; ctx.strokeRect(-L / 2, -Wd / 2, L, Wd);
      ctx.fillStyle = "#203040"; ctx.fillRect(L * 0.08, -Wd * 0.3, L * 0.3, Wd * 0.6);
      if (pl.mode === "plane" && !pl.grounded) { // wing
        ctx.fillStyle = t.col; ctx.fillRect(-L * 0.15, -Wd * 2.2, L * 0.5, Wd * 4.4);
      }
      if (pl.mode === "heli" && pl.alt > 0.5) { // rotor
        ctx.strokeStyle = "rgba(220,220,220,0.8)"; ctx.lineWidth = 1.5;
        const r = L * (1.6 + Math.sin(performance.now() / 40) * 0.3);
        ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
      }
    }
    ctx.restore();
    // altitude shadow for air vehicles
    if ((pl.mode === "plane" || pl.mode === "heli") && pl.alt > 2) {
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy + Math.min(30, pl.alt * 0.05), 3, 0, 7); ctx.stroke();
    }
  }

  const loop = { last: 0, hudT: 0, discT: 0, saveT: 0 };
  function frame(now) {
    const dt = Math.min(0.05, (now - loop.last) / 1000 || 0.016);
    loop.last = now;
    const paused = !G.UI.started;
    if (!paused) {
      G.ENV.update(dt);
      G.updatePlayer(dt);
      G.TRAFFIC.update(dt, G.CAM);
      G.NPC.update(dt, G.CAM);
      G.CAM.update(G.PL.x, G.PL.y, dt);
      G.UI.tp.update(dt);
      G.ECON.update(dt);
      G.AUDIO.update(dt);
      loop.discT += dt;
      if (loop.discT > 1) { loop.discT = 0; G.UI.disc.check(); }
      loop.saveT += dt;
      if (loop.saveT > 12) { loop.saveT = 0; G.store.set("save", { x: G.PL.x, y: G.PL.y, t: G.ENV.t, mode: G.PL.mode, z: G.CAM.zoom }); }
    }
    G.R.draw(dt);
    G.MAPS.minimap.draw();
    loop.hudT += dt;
    if (loop.hudT > 0.25) { loop.hudT = 0; G.UI.refreshHud(); }
    if (G.MAPS.fullmap.open) G.MAPS.fullmap.draw();
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
