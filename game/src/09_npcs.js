// Human society (spec Part D): NPC archetypes & emergent crowd, seeded from
// each dossier's own flavor ("a schoolchild in a navy uniform", koli fishers,
// dabbawalas at lunch, commuters at 8am rush...).
"use strict";
(function () {
  const G = window.G;

  const ARCH = G.ARCHETYPES = {
    commuter:   { col: "#d8d8e8", spd: 1.5, label: "office commuter" },
    koli:       { col: "#e8a060", spd: 1.0, label: "Koli fisher" },
    vendor:     { col: "#60c080", spd: 0.8, label: "street vendor" },
    dabbawala:  { col: "#f0f0f0", spd: 1.9, label: "dabbawala (Gandhi topi)" },
    student:    { col: "#88a8e8", spd: 1.3, label: "schoolchild in navy" },
    tourist:    { col: "#f0d080", spd: 1.0, label: "tourist" },
    portworker: { col: "#e88030", spd: 1.2, label: "JNPT port worker" },
    pilgrim:    { col: "#ffc060", spd: 0.9, label: "pilgrim" },
    jogger:     { col: "#60e0e0", spd: 2.6, label: "morning jogger" },
    resident:   { col: "#c0a8e0", spd: 1.1, label: "local resident" },
    watchman:   { col: "#8090a0", spd: 0.7, label: "night watchman" }
  };

  const N = G.NPC = { list: [], cap: 130 };

  function hour() { return G.ENV.hourFrac(); }
  function rush() { const h = hour(); return (h >= 8 && h <= 11.5) || (h >= 17 && h <= 20.5); }

  // spawn table: POI category -> [archetype, weight, timeWindow?]
  const TABLE = {
    rail: [["commuter", rush() ? 10 : 2], ["vendor", 2], ["dabbawala", hour() >= 11 && hour() <= 14 ? 4 : 0.3], ["student", hour() > 7 && hour() < 17 ? 2 : 0], ["resident", 1]],
    beach: [["koli", hour() < 9 ? 6 : 2], ["tourist", hour() > 16 ? 4 : 1], ["jogger", hour() < 9 ? 4 : 0.5], ["vendor", 1.5]],
    port: [["portworker", 6], ["truck", 0], ["resident", 1]],
    market: [["vendor", 6], ["resident", 4], ["commuter", 2]],
    temple: [["pilgrim", 6], ["vendor", 2], ["resident", 1]],
    locality: [["resident", 5], ["student", hour() > 7 && hour() < 17 ? 2.5 : 0], ["vendor", 1.5], ["commuter", rush() ? 2 : 0.5]],
    fort: [["tourist", 5], ["vendor", 1], ["watchman", 1]],
    island: [["koli", 4], ["tourist", 2]],
    nature: [["resident", 2], ["jogger", 1], ["student", 1]],
    dam: [["watchman", 2], ["resident", 1]],
    lake: [["jogger", 2], ["tourist", 2], ["resident", 2]],
    stadium: [["resident", 3], ["vendor", 2]],
    campus: [["student", 6], ["vendor", 1.5]],
    industry: [["portworker", 4], ["resident", 1]],
    airport: [["commuter", 3], ["watchman", 1]],
    water: [["koli", 3], ["resident", 1]]
  };

  N.update = function (dt, cam) {
    // spawn near POIs in view
    if (N.list.length < N.cap) {
      const near = G.POI.nearby(cam.x, cam.y, 1600);
      for (const p of near.slice(0, 6)) {
        const table = TABLE[p.cat] || TABLE.locality;
        let tw = 0; for (const t of table) tw += t[2];
        if (Math.random() < 0.5 && table.length) {
          let r = Math.random() * tw, pick = table[0][0];
          for (const t of table) { r -= t[2]; if (r <= 0) { pick = t[0]; break; } }
          const arch = ARCH[pick];
          if (!arch || N.list.length >= N.cap) continue;
          const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 260;
          const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          if (G.TERRAIN.waterAt(x, y, G.ENV.tide())) continue;
          N.list.push({ arch: pick, x, y, tx: x, ty: y, wait: Math.random() * 3, home: p, z: Math.random() });
        }
      }
    }
    // behavior
    const rain = G.ENV.rain;
    for (let i = N.list.length - 1; i >= 0; i--) {
      const n = N.list[i];
      if (G.dist(n.x, n.y, cam.x, cam.y) > 2400) { N.list.splice(i, 1); continue; }
      n.wait -= dt;
      if (n.wait <= 0) {
        // pick a new waypoint near home POI
        const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 180;
        n.tx = n.home.x + Math.cos(a) * d; n.ty = n.home.y + Math.sin(a) * d;
        n.wait = 2 + Math.random() * 6;
      }
      const dd = G.dist(n.x, n.y, n.tx, n.ty);
      const spd = ARCH[n.arch].spd * (rain > 0.5 ? 1.35 : 1); // run for shelter
      if (dd > 2) {
        const vx = (n.tx - n.x) / dd * spd, vy = (n.ty - n.y) / dd * spd;
        const nx = n.x + vx * dt, ny = n.y + vy * dt;
        if (!G.TERRAIN.waterAt(nx, ny, G.ENV.tide())) { n.x = nx; n.y = ny; }
        else n.wait = 0;
        n.moving = true;
      } else n.moving = false;
      // keep apart (personal-space bubbles)
      if (N._sepT !== Math.floor(G.ENV.t * 2)) {
        N._sepT = Math.floor(G.ENV.t * 2);
        for (const o of N.list) {
          if (o === n) continue;
          const d2 = (o.x - n.x) * (o.x - n.x) + (o.y - n.y) * (n.y - o.y) * -1;
        }
      }
    }
  };

  // street chatter pools (built from spec flavor: figures, traffic, sounds)
  const CHATTER = {
    commuter: ["Which fast local goes to Dadar?", "Signal pe ruk ja bhai", "Meeting at 10, chai first"],
    koli: ["Aaj laal machhli mili!", "Net theek karna padega", "Bandra pe muchli?", " Tide high hai re"],
    vendor: ["Garam garam vada pav!", "Do rupee ka le lo", "Chai-kappa, fresh fresh"],
    dabbawala: ["Ek hundred code, Vile Parle", "Dabba saaf hai, likh le"],
    student: ["Exams ka kya hoga...", "Ground pe chalte hain"],
    tourist: ["Is this the Gateway?", "One photo, please", "Exchange kahan milega?"],
    portworker: ["Shift khatam hone do", "Crane number three band hai"],
    pilgrim: ["Darshan kab hogi?", "Prasad le lo"],
    jogger: ["One more round", "Sea face is best at dawn"],
    resident: ["Pani nahi aa raha 11 baje se", "Lift phir se kharab!", "Monsoon mein yeh lane doob jaati hai"],
    watchman: ["ID dikhao", "Sab theek hai sahab"]
  };

  N.draw = function (ctx, z) {
    if (z < 1.1) return;
    const rain = G.ENV.rain, night = G.ENV.sun().day < 0.25;
    const cam = G.CAM;
    const slot = Math.floor(G.ENV.t / 5); // chatter rotates every ~5 game-min
    let said = 0;
    for (const n of N.list) {
      const [sx, sy] = cam.w2s(n.x, n.y);
      if (sx < -20 || sy < -30 || sx > cam.w + 20 || sy > cam.h + 20) continue;
      const r = Math.max(1.6, 0.45 * z);
      ctx.fillStyle = ARCH[n.arch].col;
      ctx.beginPath(); ctx.arc(sx, sy - r, r * 0.9, 0, 7); ctx.fill();          // head
      ctx.fillRect(sx - r * 0.6, sy - r * 0.4, r * 1.2, r * 1.6);               // body
      if (rain > 0.3) { // umbrellas in the monsoon
        ctx.fillStyle = ["#c03030", "#2860c0", "#e0c020", "#40a060"][Math.floor(G.hash2(n.x | 0, n.y | 0) * 4)];
        ctx.beginPath(); ctx.arc(sx, sy - r * 1.9, r * 1.5, Math.PI, 0); ctx.fill();
      } else if (night && n.arch === "vendor") {
        ctx.fillStyle = "rgba(255,220,120,0.8)"; ctx.beginPath(); ctx.arc(sx + r * 2, sy - r, r * 0.5, 0, 7); ctx.fill();
      }
      // street chatter: closest few NPCs speak, one line at a time
      if (z > 2.2 && said < 3 && n.home) {
        const d = G.dist(n.x, n.y, cam.x, cam.y);
        if (d < 90 && G.hash2(n.x | 0, (n.y | 0) + slot) < 0.22) {
          const pool = CHATTER[n.arch] || CHATTER.resident;
          const line = pool[Math.floor(G.hash2((n.x | 0) + slot, n.y | 0) * pool.length)];
          if (line) {
            ctx.font = `${Math.min(11, 4 + z)}px system-ui`;
            ctx.textAlign = "center";
            const w = ctx.measureText(line).width + 10;
            ctx.fillStyle = "rgba(10,18,28,0.82)";
            ctx.fillRect(sx - w / 2, sy - r * 3 - 16, w, 15);
            ctx.fillStyle = "#eef4f8";
            ctx.fillText(line, sx, sy - r * 3 - 5);
            said++;
          }
        }
      }
    }
  };

  // what the crowd is doing right now (for HUD ambience line)
  N.crowdLine = function (x, y) {
    const p = G.POI.nearest(x, y, 1200);
    if (!p) return "";
    const h = hour();
    if (p.cat === "rail") return rush() ? "peak-hour crush at the station" : "quiet platform, a few stragglers";
    if (p.cat === "beach") return h < 9 ? "fishermen hauling nets at dawn" : h > 16 ? "evening crowd on the sands" : "midday lull";
    if (p.cat === "port") return "port shift in progress, cranes swinging";
    if (p.cat === "market") return "bazaar noise, haggling in three languages";
    if (p.moment) return p.moment;
    return "";
  };
})();
