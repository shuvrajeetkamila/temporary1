// Traffic & life simulation: road vehicles, local trains (boardable!), ferries,
// birds & flamingos, fishing boats. Congestion emerges from density (Part D/E).
"use strict";
(function () {
  const G = window.G, W = G.W;

  const TF = G.TRAFFIC = { cars: [], trains: [], boats: [], birds: [], fishers: [], riding: null };
  G.TRAIN = TF; // boarding API alias

  // polyline param helpers
  function lineLen(pts) { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += G.dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); return L; }
  function posAlong(pts, d, lane) {
    for (let i = 0; i < pts.length - 1; i++) {
      const dd = G.dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (d <= dd) {
        const t = dd ? d / dd : 0, x = G.lerp(pts[i][0], pts[i + 1][0], t), y = G.lerp(pts[i][1], pts[i + 1][1], t);
        const hd = G.angTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        const px = Math.sin(hd) * lane, py = -Math.cos(hd) * lane;
        return { x: x + px, y: y + py, hd };
      }
      d -= dd;
    }
    const last = pts[pts.length - 1]; return { x: last[0], y: last[1], hd: 0 };
  }

  const CAR_COLORS = ["#d8e8f0", "#c03030", "#f0c020", "#2860c0", "#e8e8e8", "#303840", "#70c080"];
  const CARTYPES = [
    { t: "car", w: 4.4, l: 8, col: null },
    { t: "taxi", w: 4.4, l: 8, col: "#f0c020" },
    { t: "auto", w: 2.6, l: 4.4, col: "#202020" },
    { t: "bus", w: 5, l: 20, col: "#c03030" },
    { t: "truck", w: 5, l: 18, col: "#6070b0" },
    { t: "bike", w: 1.6, l: 3.4, col: "#c03030" }
  ];
  function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

  TF.spawnCar = function (camx, camy) {
    const rnd = Math.random;
    const r = W.roads[Math.floor(rnd() * W.roads.length)];
    const L = lineLen(r.pts);
    if (L < 500) return;
    const d = rnd() * L;
    const p = posAlong(r.pts, d, 3);
    if (G.dist(p.x, p.y, camx, camy) > 2600 || G.dist(p.x, p.y, camx, camy) < 350) return;
    const ct = pick(CARTYPES, rnd);
    // JNPT corridors get container trucks
    if ((r.n.includes("Uran") || r.n.includes("JNPT") || r.n.includes("Sion–Panvel")) && rnd() < 0.4) ct.t = "truck";
    TF.cars.push({
      road: r, d, dir: rnd() < 0.5 ? 1 : -1, v: 0,
      vmax: { car: 20, taxi: 18, auto: 14, bus: 14, truck: 12, bike: 17 }[ct.t] * (r.cls === 0 ? 1.5 : r.cls === 1 ? 1.1 : 0.8) * (0.8 + rnd() * 0.4),
      x: p.x, y: p.y, hd: p.hd, ct, lane: 3, honk: 0, brakelight: 0
    });
  };

  TF.spawnBoat = function (camx, camy) {
    const f = W.ferries[Math.floor(Math.random() * W.ferries.length)];
    const pts = f.pts.map(q => G.PROJ.lonLatToXY(q[0], q[1]));
    const L = lineLen(pts);
    const d = Math.random() * L;
    const p = posAlong(pts, d, 0);
    if (G.dist(p.x, p.y, camx, camy) > 3000) return;
    const fisher = f.n === "JNPT Barge Channel" ? false : Math.random() < 0.5;
    TF.boats.push({ route: pts, d, dir: 1, v: fisher ? 2 : f.v, vmax: fisher ? 3 : f.v, x: p.x, y: p.y, hd: p.hd, fisher, wake: 0 });
  };

  TF.spawnBirds = function (camx, camy, tide) {
    // flamingos on the Thane creek flats at low tide — spec wildlife list
    const flatsX = G.PROJ.lonToX(72.96), flatsY = G.PROJ.latToY(19.11);
    const d = G.dist(camx, camy, flatsX, flatsY);
    if (d < 5000 && tide < 2.0 && TF.birds.length < 3) {
      const n = 8 + Math.floor(Math.random() * 20);
      const b = { kind: "flamingo", x: flatsX + (Math.random() - 0.5) * 900, y: flatsY + (Math.random() - 0.5) * 900, n, phase: Math.random() * 7 };
      TF.birds.push(b);
    } else if (TF.birds.length < 4 && Math.random() < 0.02) {
      const b = { kind: "kite", x: camx + (Math.random() - 0.5) * 2200, y: camy + (Math.random() - 0.5) * 1600, n: 3 + Math.floor(Math.random() * 5), phase: Math.random() * 7 };
      TF.birds.push(b);
    }
  };

  // trains
  function spawnTrains() {
    const rush = (() => { const h = G.ENV.hourFrac(); return (h >= 8 && h <= 11.5) || (h >= 17 && h <= 20.5); })();
    W.rails.forEach((rail, ri) => {
      if (rail.kind === "metro" && Math.random() < 0.5) return;
      const n = rail.kind === "metro" ? 2 : rush ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const L = lineLen(rail.pts);
        TF.trains.push({ rail, d: (L / n) * i + Math.random() * 400, dir: 1, v: 0, dwell: 0, x: 0, y: 0, hd: 0, idx: ri + "_" + i, stops: 0 });
      }
    });
  }

  TF.update = function (dt, cam) {
    const tide = G.ENV.tide();
    // ---- cars ----
    const wantCars = G.ENV.rain > 0.6 ? 42 : 56;
    if (TF.cars.length < wantCars && Math.random() < 0.5) TF.spawnCar(cam.x, cam.y);
    for (let i = TF.cars.length - 1; i >= 0; i--) {
      const c = TF.cars[i];
      if (G.dist(c.x, c.y, cam.x, cam.y) > 3200) { TF.cars.splice(i, 1); continue; }
      // simple car-following: brake if another car ahead on same road within 22m in same dir
      let block = false;
      for (const o of TF.cars) {
        if (o === c || o.road !== c.road || o.dir !== c.dir) continue;
        const gap = (o.d - c.d) * c.dir;
        if (gap > 0 && gap < 24) { block = true; break; }
      }
      const target = block ? 0 : c.vmax;
      c.v = G.smooth(c.v, target, dt, block ? 4 : 0.9);
      if (block && Math.random() < dt * 0.25) c.honk = 0.4;
      c.honk = Math.max(0, c.honk - dt);
      c.d += c.v * c.dir;
      const L = lineLen(c.road.pts);
      if (c.d > L) { c.dir = -1; c.d = L; }
      if (c.d < 0) { c.dir = 1; c.d = 0; }
      const p = posAlong(c.road.pts, c.d, 3 * c.dir);
      c.x = p.x; c.y = p.y; c.hd = c.dir > 0 ? p.hd : p.hd + Math.PI;
    }
    // ---- boats ----
    if (TF.boats.length < 7 && Math.random() < 0.1) TF.spawnBoat(cam.x, cam.y);
    for (let i = TF.boats.length - 1; i >= 0; i--) {
      const b = TF.boats[i];
      if (G.dist(b.x, b.y, cam.x, cam.y) > 4200) { if (TF.ridingBoat === b) TF.ridingBoat = null; TF.boats.splice(i, 1); continue; }
      b.d += b.v * b.dir;
      const L = lineLen(b.route);
      if (b.d > L - 20) { b.dir = -1; }
      if (b.d < 20) { b.dir = 1; }
      const p = posAlong(b.route, b.d, 0);
      b.x = p.x; b.y = p.y; b.hd = b.dir > 0 ? p.hd : p.hd + Math.PI;
      b.wake = b.v > 1 ? Math.min(1, b.wake + dt) : 0;
    }
    // ---- birds ----
    for (let i = TF.birds.length - 1; i >= 0; i--) {
      const b = TF.birds[i];
      b.phase += dt * 0.3;
      b.x += Math.cos(b.phase) * dt * 8; b.y += Math.sin(b.phase * 0.7) * dt * 8;
      if (b.kind === "flamingo" && G.ENV.tide() > 2.4) TF.birds.splice(i, 1);
      if (G.dist(b.x, b.y, cam.x, cam.y) > 5200) TF.birds.splice(i, 1);
    }
    if (Math.random() < dt * 0.4) TF.spawnBirds(cam.x, cam.y, tide);
    // ---- trains ----
    if (!TF.trains.length) spawnTrains();
    const hour = G.ENV.hourFrac();
    for (const t of TF.trains) {
      const rail = t.rail;
      const L = lineLen(rail.pts);
      if (t.dwell > 0) {
        t.dwell -= dt * (G.ENV.scale > 60 ? 1 : 1);
        if (t.dwell <= 0) t.v = rail.vmax || 22;
      } else {
        // station detection: stations at even fractions — approximate: stop every L/nStations
        const n = rail.st.length;
        const seg = L / (n - 1) * 2; // stations at fractions (i+0.5)/n per stPos
        const stGap = L / n;
        const nextStop = Math.ceil((t.d + 10) / stGap) * stGap - 10;
        if (t.d >= nextStop - 8 && t.v > 0.5) { t.v = 0; t.dwell = 18; t.atStation = Math.round(t.d / stGap); G.emit("trainstop", t); }
        t.v = G.smooth(t.v, rail.vmax || 22, dt, 0.5);
      }
      t.d += t.v * t.dir;
      if (t.d > L) { t.dir = -1; t.d = L; }
      if (t.d < 0) { t.dir = 1; t.d = 0; }
      const p = posAlong(rail.pts, t.d, 0);
      t.x = p.x; t.y = p.y; t.hd = t.dir > 0 ? p.hd : p.hd + Math.PI;
      // player riding?
      if (G.TRAIN.riding === t) { G.PL.x = t.x; G.PL.y = t.y; }
    }
  };

  // board a stopped train
  G.boardTrain = function () {
    if (G.PL.mode !== "foot") return false;
    for (const t of TF.trains) {
      if (t.dwell > 0 && G.dist(t.x, t.y, G.PL.x, G.PL.y) < 45) {
        G.TRAIN.riding = t; G.PL.mode = "train";
        G.PL.say("🚆 Boarded the " + t.rail.n + " local. Press E to alight at the next station.");
        G.emit("vehicle", "train");
        return true;
      }
    }
    return false;
  };
  G.alightTrain = function () {
    const t = G.TRAIN.riding;
    if (!t) return false;
    if (t.dwell > 0 || t.v < 1) {
      G.TRAIN.riding = null; G.PL.mode = "foot";
      const st = t.rail.st[Math.min(t.rail.st.length - 1, Math.max(0, Math.round(t.d / (lineLen(t.rail.pts) / t.rail.st.length))))];
      G.PL.say("Alighted at " + (st ? st.n : "the station") + ".");
      return true;
    }
    G.PL.say("Train is moving — wait for the next station.");
    return true;
  };

  // board a passing ferry / fishing boat (spec: "ferries connect koliwadas")
  G.boardFerry = function () {
    if (G.TRAFFIC.ridingBoat) return false;
    const tide = G.ENV.tide();
    if (!G.TERRAIN.waterAt(G.PL.x, G.PL.y, tide) && G.TERRAIN.depth(G.PL.x, G.PL.y, tide) < 0.2) {
      // allow boarding from jetties: water within 25 m
      let nearWater = false;
      for (const wl of G.W.water) { if (G.polyDist(G.PL.x, G.PL.y, wl.pts) < 40) { nearWater = true; break; } }
      if (!nearWater) return false;
    }
    for (const b of TF.boats) {
      if (!b.fisher && G.dist(b.x, b.y, G.PL.x, G.PL.y) < 40) {
        TF.ridingBoat = b;
        G.PL.say("⛴️ Boarded the " + (b.route === W.ferries ? "" : "crossing ") + "ferry. Press E to step off.");
        G.emit("toast", "⛴️ Aboard — the boatman nods towards the horizon.");
        return true;
      }
    }
    return false;
  };
  G.alightFerry = function () {
    if (!TF.ridingBoat) return false;
    const b = TF.ridingBoat;
    TF.ridingBoat = null;
    // step onto nearest land within 120 m of the boat, else stay aboard-side in shallow water
    let px = b.x, py = b.y, found = false;
    for (let r = 10; r <= 130; r += 12) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const tx = b.x + Math.cos(a) * r, ty = b.y + Math.sin(a) * r;
        if (!G.TERRAIN.waterAt(tx, ty, G.ENV.tide())) { px = tx; py = ty; found = true; break; }
      }
      if (found) break;
    }
    G.PL.x = px; G.PL.y = py;
    G.PL.say("You step ashore at " + (G.POI.nearest(px, py, 1600) || { name: "the jetty" }).name + ".");
    return true;
  };

  // ---------- entity rendering ----------
  TF.draw = function (ctx, z) {
    if (z < 0.08) return;
    const day = G.ENV.sun().day;
    // boats
    for (const b of TF.boats) {
      const [sx, sy] = G.CAM.w2s(b.x, b.y);
      if (offScreen(sx, sy)) continue;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(b.hd);
      const s = Math.max(3, 6 * z);
      if (b.wake > 0 && z > 0.4) { ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * 1.4, 0); ctx.lineTo(-s * 3.4, 0); ctx.stroke(); }
      ctx.fillStyle = b.fisher ? "#c8b090" : "#e8e8e8";
      ctx.fillRect(-s, -s * 0.35, s * 2, s * 0.7);
      ctx.fillStyle = b.fisher ? "#8a6a4a" : "#4a5a8a";
      ctx.fillRect(-s * 0.2, -s * 0.3, s * 0.8, s * 0.6);
      ctx.restore();
    }
    // birds
    if (z > 0.3) for (const b of TF.birds) {
      const [sx, sy] = G.CAM.w2s(b.x, b.y);
      if (offScreen(sx, sy)) continue;
      for (let i = 0; i < b.n; i++) {
        const bx = sx + Math.cos(b.phase + i * 2.4) * (b.n * 3), by = sy + Math.sin(b.phase * 1.3 + i * 2.4) * (b.n * 3);
        ctx.strokeStyle = b.kind === "flamingo" ? "#f0a0b0" : "#606060";
        ctx.lineWidth = 1.4;
        const f = Math.sin(G.ENV.t * 9 + i) * 2;
        ctx.beginPath(); ctx.moveTo(bx - 3, by - f); ctx.lineTo(bx, by); ctx.lineTo(bx + 3, by - f); ctx.stroke();
      }
    }
    // trains
    if (z > 0.15) for (const t of TF.trains) {
      const [sx, sy] = G.CAM.w2s(t.x, t.y);
      if (offScreen(sx, sy, 300)) continue;
      const coaches = 12, cl = 24, cw = 4;
      for (let i = 0; i < coaches; i++) {
        const back = t.d - t.dir * i * cl;
        const p = posAlong(t.rail.pts, G.clamp(back, 0, lineLen(t.rail.pts)), 0);
        const [px, py] = G.CAM.w2s(p.x, p.y);
        ctx.save(); ctx.translate(px, py); ctx.rotate(t.dir > 0 ? p.hd : p.hd + Math.PI);
        const w = Math.max(2.5, cl * z * 0.35), h = Math.max(1.5, cw * z * 0.55);
        ctx.fillStyle = i === 0 ? "#a03030" : "#b84848";
        ctx.fillRect(-w / 2, -h / 2, w, h);
        if (z > 0.8) { ctx.fillStyle = "rgba(220,240,255,0.7)"; for (let wi = -1; wi <= 1; wi++) ctx.fillRect(wi * w * 0.25 - 1, -h / 2 + h * 0.25, 2, h * 0.5); }
        ctx.restore();
      }
    }
    // cars
    if (z > 0.5) for (const c of TF.cars) {
      const [sx, sy] = G.CAM.w2s(c.x, c.y);
      if (offScreen(sx, sy, 40)) continue;
      const L = Math.max(3, c.ct.l * z * 0.5), Wd = Math.max(1.6, c.ct.w * z * 0.5);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(c.hd);
      ctx.fillStyle = c.ct.col || CAR_COLORS[Math.floor(G.hash2(c.x | 0, c.y | 0) * CAR_COLORS.length)];
      ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
      if (z > 1.2) { ctx.fillStyle = "rgba(30,40,60,0.8)"; ctx.fillRect(-L * 0.1, -Wd / 2 + Wd * 0.2, L * 0.35, Wd * 0.6); }
      if (c.honk > 0 || G.ENV.sun().day < 0.2) { ctx.fillStyle = "#fff8c0"; ctx.beginPath(); ctx.arc(L / 2, -Wd * 0.25, 1.2, 0, 7); ctx.arc(L / 2, Wd * 0.25, 1.2, 0, 7); ctx.fill(); }
      ctx.restore();
    }
  };
  function offScreen(x, y, pad) {
    return x < -(pad || 20) || y < -(pad || 20) || x > G.CAM.w + (pad || 20) || y > G.CAM.h + (pad || 20);
  }
  G.TRAFFIC_DRAW = TF;
})();
