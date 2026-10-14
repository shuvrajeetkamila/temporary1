// Vehicles & physics (spec Part C): foot, car, taxi, auto, bike, truck, boat,
// speedboat, plane, helicopter — each with its own believable model.
"use strict";
(function () {
  const G = window.G;

  const TYPES = G.VEHTYPES = {
    foot:     { n: "On Foot", icon: "🚶", vmax: 1.7, acc: 3, col: "#ffd9a0", water: false },
    run:      null, // foot override speed via shift
    car:      { n: "Car", icon: "🚗", vmax: 33, acc: 3.6, brake: 12, steer: 2.1, col: "#d8e8f0", road: 1 },
    taxi:     { n: "Kaali-Peeli Taxi", icon: "🚕", vmax: 27, acc: 3.2, brake: 11, steer: 2.3, col: "#f0c020", road: 1 },
    auto:     { n: "Auto Rickshaw", icon: "🛺", vmax: 24, acc: 3.4, brake: 11, steer: 2.6, col: "#202020", road: 1 },
    bike:     { n: "Motorbike", icon: "🏍️", vmax: 29, acc: 5, brake: 13, steer: 3.0, col: "#c03030", road: 1 },
    truck:    { n: "JNPT Container Truck", icon: "🚛", vmax: 21, acc: 1.4, brake: 7, steer: 1.2, col: "#7080c0", road: 1 },
    boat:     { n: "Ferry Boat", icon: "⛴️", vmax: 11, acc: 1.2, brake: 3, steer: 0.9, col: "#e8e8e8", water: true },
    speed:    { n: "Speedboat", icon: "🚤", vmax: 24, acc: 3.5, brake: 6, steer: 1.6, col: "#f0f0f0", water: true },
    plane:    { n: "Cessna (Juhu/CSMIA)", icon: "✈️", vmax: 92, acc: 4.2, brake: 8, steer: 1.4, col: "#f4f4f4", air: true },
    heli:     { n: "Helicopter", icon: "🚁", vmax: 62, acc: 9, brake: 6, steer: 1.8, col: "#283048", air: true, hover: true },
    train:    { n: "Local Train", icon: "🚆", vmax: 22, acc: 0.8, brake: 3, steer: 0, col: "#c84040", rail: true }
  };

  // Player state
  const PL = G.PL = {
    x: 0, y: 0, v: 0, heading: 0, mode: "foot", alt: 0, vspeed: 0,
    throttle: 0, lift: 0, bank: 0, grounded: true, vehicle: null, // vehicle = obj when riding spawn
    integrity: 1, lastTerrain: "land",
    msg: "", msgT: 0,
    say(s, t) { this.msg = s; this.msgT = t || 3.2; G.emit("toast", s); }
  };

  // nearest water / runway helpers
  function nearestWater(x, y, maxR) {
    let best = null, bd = maxR * maxR;
    for (const wl of G.W.water) {
      for (let i = 0; i < wl.pts.length - 1; i++) {
        const a = wl.pts[i], b = wl.pts[i + 1];
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        let t = L2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / L2 : 0; t = G.clamp(t, 0, 1);
        const cx = a[0] + t * dx, cy = a[1] + t * dy, d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 < bd) { bd = d2; best = [cx, cy]; }
      }
    }
    // open sea fallback: nearest land edge — walk west
    if (!best) { let px = x; for (let i = 0; i < 400; i++) { px -= 60; if (!G.TERRAIN.landAt(px, y)) return [px - 80, y]; } return null; }
    return best;
  }
  G.nearestWater = nearestWater;

  function nearestRunway(x, y) {
    let best = null, bd = Infinity;
    for (const a of G.W.airports) {
      const p = a.pts[0], d = G.dist(x, y, p[0], p[1]);
      if (d < bd) { bd = d; best = { a, p, hdg: G.angTo(a.pts[0][0], a.pts[0][1], a.pts[1][0], a.pts[1][1]) }; }
    }
    return best;
  }

  // spawn a vehicle for the player (spec fairness: never spawn into broken state)
  G.spawnVehicle = function (type) {
    const t = TYPES[type]; if (!t) return;
    const tide = G.ENV.tide();
    if (t.water) {
      const w = G.TERRAIN.waterAt(PL.x, PL.y, tide) ? [PL.x, PL.y] : nearestWater(PL.x, PL.y, 2500);
      if (!w) { PL.say("No water nearby for a boat — teleport to a jetty or the harbour."); return; }
      PL.x = w[0]; PL.y = w[1]; PL.alt = 0;
    } else if (type === "plane") {
      const r = nearestRunway(PL.x, PL.y);
      if (!r) return;
      if (G.dist(PL.x, PL.y, r.p[0], r.p[1]) > 400) PL.say("Parked at " + r.a.n + " runway threshold.");
      PL.x = r.p[0]; PL.y = r.p[1]; PL.heading = r.hdg; PL.alt = 0;
    } else if (type === "heli") {
      PL.alt = 0; // lifts off from wherever it is (rooftop hops are a Mumbai tradition)
    } else {
      // land vehicle: nudge out of deep water
      if (G.TERRAIN.waterAt(PL.x, PL.y, tide)) {
        const p = G.POI.nearest(PL.x, PL.y, 4000);
        if (p) { PL.x = p.x; PL.y = p.y; PL.say("Moved to " + p.name + " (can't drive on water)."); }
      }
    }
    PL.mode = type; PL.v = 0; PL.alt = t.air ? 0 : 0; PL.grounded = true; PL.throttle = 0; PL.lift = 0;
    G.CAM.follow = true;
    PL.say(t.icon + " " + t.n + " ready.");
    G.emit("vehicle", type);
  };

  G.exitVehicle = function () {
    if (PL.mode === "foot") return;
    const tide = G.ENV.tide();
    if (G.VEHTYPES[PL.mode].air && PL.alt > 3) { PL.say("Land first! (reduce throttle & descend)"); return; }
    if (G.VEHTYPES[PL.mode].water) {
      // step onto the nearest shore
      const w = G.TERRAIN.waterAt(PL.x, PL.y, tide);
      if (w) { let wx = PL.x; for (let i = 0; i < 200; i++) { wx += 30 * Math.cos(PL.heading); if (!G.TERRAIN.waterAt(wx, PL.y, tide)) { PL.x = wx; break; } } }
    }
    if (PL.mode === "train") { G.TRAIN.riding = null; }
    PL.say("You step out at " + locName(PL.x, PL.y) + ".");
    PL.mode = "foot"; PL.v = 0;
    G.emit("vehicle", "foot");
  };

  function locName(x, y) {
    const p = G.POI.nearest(x, y, 1500);
    if (p) return p.name;
    const k = G.TERRAIN.kindAt(x, y, G.ENV.tide());
    return k.name || "the streets";
  }

  // road speed factor
  function roadFactor(x, y) {
    for (const r of G.W.roads) {
      const b = r.bb;
      if (x < b[0] - 30 || x > b[2] + 30 || y < b[1] - 30 || y > b[3] + 30) continue;
      if (G.polyDist(x, y, r.pts) < (r.cls === 0 ? 14 : r.cls === 1 ? 10 : 7)) return r.cls === 0 ? 1.0 : r.cls === 1 ? 0.85 : 0.7;
    }
    return 0;
  }

  // main physics tick
  G.updatePlayer = function (dt) {
    const IN = G.IN, T = TYPES[PL.mode], tide = G.ENV.tide();
    const k = IN.keys;
    let thr = 0, steer = 0, lift = 0;
    // keyboard
    if (k.KeyW || k.ArrowUp) thr += 1;
    if (k.KeyS || k.ArrowDown) thr -= 1;
    if (k.KeyA || k.ArrowLeft) steer -= 1;
    if (k.KeyD || k.ArrowRight) steer += 1;
    if (k.KeyR) lift += 1;
    if (k.KeyF) lift -= 1;
    // joystick (touch): push = throttle+steer combined
    if (IN.joy.active) {
      thr = -IN.joy.y; steer = IN.joy.x;
    }
    if (IN.btn.thrUp) thr = 1;
    if (IN.btn.thrDn) thr = -1;
    if (PL.msgT > 0) PL.msgT -= dt;

    const kind = G.TERRAIN.kindAt(PL.x, PL.y, tide);
    PL.lastTerrain = kind.water ? kind.kind : (kind.kind === "forest" ? "forest" : roadFactor(PL.x, PL.y) > 0 ? "road" : "land");

    // riding a ferry as a passenger
    if (G.TRAFFIC.ridingBoat) {
      const b = G.TRAFFIC.ridingBoat;
      PL.x = b.x; PL.y = b.y; PL.heading = b.hd; PL.v = b.v; PL.alt = 0;
      return;
    }

    if (PL.mode === "foot") {
      const run = k.ShiftLeft || k.ShiftRight || IN.btn.run;
      const vmax = run ? 4.4 : 1.7;
      const mag = Math.min(1, Math.hypot(thr, steer));
      if (mag > 0.05) {
        PL.heading = G.normAng(Math.atan2(thr, steer) - Math.PI / 2);
        const wx = Math.sin(PL.heading) * mag * vmax, wy = -Math.cos(PL.heading) * mag * vmax;
        const nx = PL.x + wx * dt, ny = PL.y + wy * dt;
        if (!G.TERRAIN.waterAt(nx, ny, tide) || G.TERRAIN.depth(nx, ny, tide) < 0.35) { PL.x = nx; PL.y = ny; }
        PL.v = mag * vmax;
      } else PL.v = 0;
      PL.alt = 0;
      return;
    }

    // ------- shared ground/water/air -------
    let vmax = T.vmax, acc = T.acc;
    if (!T.air && !T.water && !T.rail) {
      const rf = roadFactor(PL.x, PL.y);
      const terr = PL.lastTerrain;
      const f = terr === "road" ? rf : terr === "forest" ? 0.25 : 0.4;
      vmax *= (0.45 + 0.55 * f);
    }
    if (G.ENV.rain > 0.4 && !T.air) vmax *= 0.82;

    if (PL.mode === "train") {
      const tr = G.TRAIN.riding;
      if (!tr) { PL.mode = "foot"; return; }
      PL.x = tr.x; PL.y = tr.y;
      return;
    }

    if (T.hover) { // -------- helicopter --------
      PL.lift = lift !== 0 ? lift : (IN.btn.liftUp ? 1 : IN.btn.liftDn ? -1 : 0);
      PL.alt = G.clamp(PL.alt + PL.lift * 9 * dt, 0, 900);
      PL.vspeed = PL.lift * 9;
      const tiltAcc = T.acc;
      const tx = steer, tz = -thr;
      const ax = tx * tiltAcc, ay = tz * tiltAcc;
      PL.v = Math.min(T.vmax, Math.hypot(PL.vx = (PL.vx || 0) + ax * dt, PL.vy = (PL.vy || 0) + ay * dt));
      PL.vx *= (1 - dt * (PL.alt > 0.5 ? 0.5 : 3)); PL.vy *= (1 - dt * (PL.alt > 0.5 ? 0.5 : 3));
      const nx = PL.x + PL.vx * dt, ny = PL.y + PL.vy * dt;
      tryMove(nx, ny, tide, dt);
      if (Math.hypot(PL.vx, PL.vy) > 0.5) PL.heading = G.normAng(Math.atan2(PL.vx, -PL.vy));
      if (PL.alt <= 0.01 && Math.hypot(PL.vx, PL.vy) < 1) { PL.vx = PL.vy = 0; }
      return;
    }

    if (T.air) { // -------- plane --------
      PL.throttle = G.clamp(PL.throttle + (thr > 0 ? dt * 0.7 : thr < 0 ? -dt * 0.9 : 0), 0, 1);
      PL.lift = lift !== 0 ? lift : (IN.btn.liftUp ? 1 : IN.btn.liftDn ? -1 : 0);
      if (PL.grounded) {
        PL.v += (PL.throttle * T.acc - (thr < 0 ? T.brake : 0.4)) * dt;
        PL.v = Math.max(0, Math.min(vmax, PL.v));
        PL.heading += steer * dt * 0.9 * Math.min(1, PL.v / 8);
        if (PL.lift > 0 && PL.v > 33) { PL.grounded = false; PL.alt = 0.5; PL.say("Wheels up! Vy — climb ahead."); }
      } else {
        const stall = 27;
        const climb = PL.lift * G.clamp((PL.v - 34) * 0.18, -3, 9) - (PL.v < stall ? (stall - PL.v) * 0.6 : 0);
        PL.vspeed = climb;
        PL.alt = Math.max(0, PL.alt + climb * dt);
        PL.v += (PL.throttle * T.acc - 0.35 - Math.abs(climb) * 0.10) * dt;
        PL.v = Math.max(8, Math.min(vmax, PL.v));
        PL.bank = G.smooth(PL.bank, steer * 0.5, dt, 3);
        PL.heading += steer * dt * (0.35 + PL.v * 0.004) * (1.2 - Math.abs(PL.bank) * 0.4);
        if (PL.alt <= 0) {
          const sink = -climb;
          const terr = G.TERRAIN.kindAt(PL.x, PL.y, tide);
          if (sink < 4.5 && PL.v < 55 && (terr.water ? G.TERRAIN.depth(PL.x, PL.y, tide) < 0.5 : true)) {
            PL.grounded = true; PL.alt = 0; PL.bank = 0; PL.throttle = 0; PL.say("Touched down" + (terr.water ? " — on the beach!" : " safely."));
          } else {
            PL.say("Hard landing! Recovered at the nearest airstrip.");
            const r = nearestRunway(PL.x, PL.y);
            PL.x = r.p[0]; PL.y = r.p[1]; PL.heading = r.hdg; PL.alt = 0; PL.v = 0; PL.grounded = true;
          }
        }
      }
      if (PL.v > 0.3 && (PL.grounded ? PL.v > 1 : true)) {
        PL.x += Math.sin(PL.heading) * PL.v * dt;
        PL.y -= Math.cos(PL.heading) * PL.v * dt;
      }
      return;
    }

    if (T.water) { // -------- boats --------
      const depth = G.TERRAIN.depth(PL.x, PL.y, tide);
      if (depth < 0.45) {
        PL.v *= Math.max(0, 1 - dt * 3);
        PL.sayOnce && 0;
        if (PL.v < 0.5) PL.say("Run aground! Reverse (S) back to the channel.");
        PL.x += Math.sin(PL.heading) * PL.v * dt; PL.y -= Math.cos(PL.heading) * PL.v * dt;
        return;
      }
      PL.v += (thr > 0 ? acc * thr : thr < 0 ? -acc * 0.7 : -0.3) * dt;
      PL.v = G.clamp(PL.v, -3, vmax * (0.85 + 0.15 * (1 - G.ENV.rain * 0.5)));
      PL.heading += steer * dt * T.steer * Math.min(1, Math.abs(PL.v) / 4 + 0.35);
      PL.x += Math.sin(PL.heading) * PL.v * dt;
      PL.y -= Math.cos(PL.heading) * PL.v * dt;
      return;
    }

    // -------- wheeled --------
    if (thr > 0) PL.v += acc * thr * dt;
    else if (thr < 0) PL.v += (PL.v > 0 ? -T.brake : acc * 0.5 * thr) * dt;
    else PL.v *= Math.max(0, 1 - dt * 0.6);
    PL.v = G.clamp(PL.v, -6, vmax);
    PL.heading += steer * dt * T.steer * Math.min(1, Math.abs(PL.v) / 6) * (PL.v < 0 ? -1 : 1);
    const nx = PL.x + Math.sin(PL.heading) * PL.v * dt;
    const ny = PL.y - Math.cos(PL.heading) * PL.v * dt;
    const nk = G.TERRAIN.kindAt(nx, ny, tide);
    if (nk.water && G.TERRAIN.depth(nx, ny, tide) > 0.25) {
      PL.v = 0; PL.say("The road ends at the " + nk.name + " — water ahead.");
    } else tryMove(nx, ny, tide, dt);
  };

  function tryMove(nx, ny, tide, dt) {
    PL.x = nx; PL.y = ny;
  }
})();
