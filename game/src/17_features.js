// ===== PHASES 1–5 feature module (v4.0) =====
// P1 feel-alive: tutorial, settings, stars/moon/city lights, gulls, crash reporter
// P2 city: district labels + enter toasts, metro stops on real lines
// P3 game: mission board, vehicle garage+ownership, fuel, speeding challans, achievements
// P4 transit: metro hop rides, scenic flight from CSMIA
// P5 your city: save slots, postcard book export
"use strict";
(function () {
  const IV = (typeof setInterval === "function") ? setInterval : function () { return 0; };
  const STO = (typeof setTimeout === "function") ? setTimeout : function (f) { return 0; };
  const G = window.G;
  if (!G || !G.POI) return;
  const S = G.SET = Object.assign({ quality: 1, sound: 1, labels: 1, own: 1, slot: "A" }, G.store.get("settings", {}));
  const saveS = () => G.store.set("settings", S);
  if (S.lang === undefined) S.lang = "en";
  const L10N = {
    en: { district: "🏙️ @d", accept: "📋 Accepted — @n", done: "✅ @n — earned ₹@p (total ₹@t)", bye: "📋 Mission abandoned",
      fuel: "⛽ Filled at @n — ₹@c", challan: "🚨 Traffic challan: ₹200 (speeding in city limits)", board: "🚏 Riding. Tap ✋ to alight.", off: "🚏 You stepped off.", crash: "💥 Crash! Get repairs (🚗 Garage)" },
    hi: { district: "🏙️ @d", accept: "📋 स्वीकार — @n", done: "✅ @n — ₹@p मिले (कुल ₹@t)", bye: "📋 मिशन छोड़ा",
      fuel: "⛽ टंकी भरी @n — ₹@c", challan: "🚨 ट्रैफ़िक जुर्माना: ₹200 (ओवरस्पीड)", board: "🚏 सवारी चालू। ✋ से उतरें।", off: "🚏 आप उतर गए।", crash: "💥 टक्कर! मरम्मत कराएं (🚗 गैराज)" },
    mr: { district: "🏙️ @d", accept: "📋 स्वीकार — @n", done: "✅ @n — ₹@p मिळाले (एकूण ₹@t)", bye: "📋 मिशन सोडलं",
      fuel: "⛽ टाकी भरली @n — ₹@c", challan: "🚨 ट्रॅफिक दंड: ₹200 (वेगाची मर्यादा ओलांडली)", board: "🚏 स्वारी सुरू. ✋ ने उतरा.", off: "🚏 तुम्ही उतरलात.", crash: "💥 धडक! दुरुस्ती करा (🚗 गॅरेज)" }
  };
  G.T = (key, vars) => {
    let t = (L10N[S.lang] && L10N[S.lang][key]) || L10N.en[key] || key;
    if (vars) for (const k of Object.keys(vars)) t = t.replace("@" + k, vars[k]);
    return t;
  };
  const DOM = (typeof document !== "undefined") && !!document.body && !!document.createElement && !!document.head && !!document.getElementById("toasts");
  const HEADLESS = !DOM;

  // ---------------- P5: save slots (apply before boot reads "save") ----------------
  if (!HEADLESS) {
    if (S.slot !== "A") {
      const sv = G.store.get("save_" + S.slot, null);
      if (sv) G.store.set("save", sv);
    }
    IV(() => { // mirror autosave into the active slot
      const cur = G.store.get("save", null);
      if (cur) G.store.set("save_" + S.slot, cur);
    }, 13000);
  }

  // ---------------- P1: crash reporter ----------------
  const CR = G.CRASH = { last: null };
  function recordCrash(tag) {
    return (e) => {
      try {
        const msg = (e && (e.message || e.reason && e.reason.message)) || String(e);
        const src = (e && e.filename && (e.filename + ":" + e.lineno)) || (e && e.reason && e.reason.stack && String(e.reason.stack).split("\n")[1]) || "";
        CR.last = tag + " " + msg + (src ? " @ " + src : "");
        G.store.set("lastError", CR.last);
        const b = document.getElementById("bBug");
        if (b) { b.textContent = "🐞!"; b.style.color = "#ff8080"; }
      } catch (_) { /* never crash the crash reporter */ }
    };
  }
  if (DOM) { window.addEventListener("error", recordCrash("ERR")); window.addEventListener("unhandledrejection", recordCrash("REJ")); }

  // ---------------- P3: economy extensions (missions, garage, fuel, challans) ----------
  const M = G.MISSIONS = { act: null, done: G.store.get("missionsDone", 0), offers: [] };
  const OWN = G.GARAGE = { owned: G.store.get("owned", ["foot"]), fuel: G.store.get("fuel", 1) };
  const PRICES = {
    auto: 40000, bike: 30000, taxi: 60000, car: 80000, truck: 120000, bus: 60000,
    boat: 90000, speed: 150000, plane: 800000, heli: 1200000
  };
  G.fuelPrice = () => 1.5 + ((Math.floor(Date.now() / 86400e3) * 7) % 11) / 11 * 1.6;
  G.FUELSTATIONS = [
    { n: "Colaba Pump", x: -12800, y: -19100 }, { n: "Fort Pump", x: -12300, y: -17000 },
    { n: "Worli Pump", x: -13700, y: -9900 }, { n: "Dadar Pump", x: -11050, y: -8950 },
    { n: "Bandra Pump", x: -12200, y: -4500 }, { n: "Andheri Pump", x: -10630, y: 2300 },
    { n: "Borivali Pump", x: -9900, y: 12060 }, { n: "Powai Pump", x: -4530, y: 1980 },
    { n: "Vashi Pump", x: 950, y: -4900 }, { n: "Thane Pump", x: -110, y: 9850 }
  ];
  const SEALINK_GATES = [
    { x: -13600, y: -7930, open: 0, last: 0, side: "Bandra" },
    { x: -13860, y: -11320, open: 0, last: 0, side: "Worli" }
  ];
  const MD_FIREWORKS = [[-14930, -17360], [-14500, -17800], [-14100, -17000]];
  const GANPATI_ROUTE = [[-11400, -12500], [-11700, -9800], [-11900, -7300]];
  function realDate() { const d = new Date(); return { mo: d.getMonth() + 1, d: d.getDate() }; }
  function isGanpati() { const r = realDate(); return (r.mo === 8 && r.d >= 20) || (r.mo === 9 && r.d <= 10); }
  function isFireworks() { const r = realDate(); return (r.mo === 1 && r.d === 1) || (r.mo === 10 && r.d >= 18 && r.d <= 24) || (r.mo === 11 && r.d <= 5); }
  function rnd(a, b) { return Math.round(a + Math.random() * (b - a)); }
  function pickPOI(nearX, nearY, minD, maxD) {
    const cands = G.POI.all.filter(p => { const d = Math.hypot(p.x - nearX, p.y - nearY); return d > minD && d < maxD; });
    return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
  }
  function genOffer() {
    const here = G.PL;
    const kind = ["delivery", "fare", "photo", "tour"][Math.floor(Math.random() * 4)];
    if (kind === "tour") {
      const a = pickPOI(here.x, here.y, 300, 2500), b = pickPOI(here.x, here.y, 2600, 6000), c = pickPOI(here.x, here.y, 2600, 6000);
      if (!a || !b || !c) return null;
      return { kind, name: "City tour: " + a.name + " → " + b.name + " → " + c.name, pay: rnd(700, 1400), stops: [a, b, c], prog: 0 };
    }
    const a = pickPOI(here.x, here.y, 200, 2200), b = pickPOI(a ? a.x : here.x, a ? a.y : here.y, 1500, 7000);
    if (!a || !b) return null;
    if (kind === "delivery") return { kind, name: "Parcel: " + a.name + " → " + b.name, pay: rnd(350, 950), from: a, to: b, stage: 0 };
    if (kind === "fare") return { kind, name: "🛺 Fare: " + a.name + " → " + b.name, pay: rnd(120, 420), from: a, to: b, stage: 0, need: ["auto", "taxi", "car", "bike"] };
    return { kind: "photo", name: "📷 Photograph " + b.name, pay: rnd(400, 800), to: b };
  }
  M.refresh = () => { M.offers = []; for (let i = 0; i < 4; i++) { const o = genOffer(); if (o) M.offers.push(o); } };
  const poiByName = (n) => G.POI.all.find(p => p.n === n || p.name === n);
  G.STORIES = [
    { name: "1911 — The Gateway Rises", pay: 3000, steps: [
      ["Colaba", "1911: King George V lands on this shore. A basalt arch will rise here."],
      ["Fort", "The troops march past the Fort; the city gathers in its Sunday best."],
      ["Churchgate", "By 1924 the Gateway is done — the harbour door of the Empire."]] },
    { name: "The Dabbawalas of Girangaon", pay: 2600, steps: [
      ["Parel", "Mill country. Lunchboxes move by train, bicycle and head-load."],
      ["Dadar", "A coded tile on the lid — suburb to Fort without a wrong drop in a century."],
      ["Churchgate", "120,000 tiffins a day. Six Sigma, Mumbai style."]] },
    { name: "Salt, Mills and Seven Islands", pay: 3400, steps: [
      ["Mahim", "The seven islands were woven together by causeways and faith."],
      ["Worli", "Bandra still watches from across the water — one day a bridge will jump it."],
      ["Cotton Green", "Raw cotton by the wagon-load; the mills breathe and the city grows."]] }
  ];
  M.startStory = (si) => {
    const st = G.STORIES[si];
    const stops = [];
    for (const [nm, blurb] of st.steps) {
      const p = poiByName(nm);
      if (p) stops.push({ x: p.x, y: p.y, name: nm, blurb });
    }
    if (stops.length < 2) { G.emit("toast", "Story unavailable in this save"); return; }
    M.act = { kind: "tour", story: st.name, name: "⭐ " + st.name, pay: st.pay, stops, prog: 0 };
    G.emit("toast", "⭐ " + st.name + " — go to " + stops[0].name);
  };
  M.accept = (i) => { if (!M.act && M.offers[i]) { M.act = M.offers[i]; G.emit("toast", G.T("accept", { n: M.act.name })); } };
  M.complete = () => {
    const E = G.ECON; E.money += M.act.pay; G.store.set("money", E.money);
    M.done++; G.store.set("missionsDone", M.done);
    G.emit("toast", G.T("done", { n: M.act.name, p: M.act.pay, t: E.money }));
    if (G.DAILY) G.DAILY.progress("earn", M.act.pay);
    if (G.DAILY) G.DAILY.progress("missions", 1);
    const story = M.act.story; M.act = null;
    ach("worker1", "Working for the city", "Complete 5 missions", 5, M.done);
    ach("worker2", "Backbone of the economy", "Complete 15 missions", 15, M.done);
    ach("worker3", "Mumbai's own", "Complete 40 missions", 40, M.done);
  };
  M.abandon = () => { if (M.act) { G.emit("toast", G.T("bye")); M.act = null; } };
  M.update = (dt) => {
    const P = G.PL;
    if (M.act) {
      const d2 = (p) => (P.x - p.x) * (P.x - p.x) + (P.y - p.y) * (P.y - p.y);
      if (M.act.kind === "tour") {
        const t = M.act.stops[M.act.prog];
        if (t && d2(t) < 120 * 120) {
          M.act.prog++;
          if (t.blurb) G.emit("toast", "📖 " + t.blurb);
          else G.emit("toast", "📍 Stop " + M.act.prog + "/" + M.act.stops.length + " done");
          if (M.act.prog >= M.act.stops.length) M.complete();
        }
      } else if (M.act.kind === "photo") {
        if (d2(M.act.to) < 150 * 150) {
          const ph = (G.store.get("photos", []) || []).length;
          if (M._ph0 === undefined) M._ph0 = ph;
          if (ph > M._ph0) { M._ph0 = undefined; M.complete(); }
          else if (!M._photoReady) G.emit("toast", "📷 You're there — take a postcard to finish the job");
          M._photoReady = true;
        }
      } else {
        const tgt = M.act.stage === 0 ? M.act.from : M.act.to;
        if (d2(tgt) < 120 * 120) {
          if (M.act.stage === 0) { M.act.stage = 1; G.emit("toast", "📦 Picked up — deliver to " + M.act.to.name); }
          else M.complete();
        }
      }
    }
    // fuel drain (motorised, road/air/water)
    const T = G.VEHTYPES[P.mode];
    // real petrol pumps: drive within 55 m -> full serve
    if (T && !T.rail && P.mode !== "foot" && OWN.fuel < 0.995) {
      for (const fp of G.FUELSTATIONS) {
        if (Math.hypot(P.x - fp.x, P.y - fp.y) < 55) {
          const pr = G.fuelPrice();
          const cost = Math.ceil((1 - OWN.fuel) * 100 * pr);
          if (G.ECON.money >= cost) {
            G.ECON.money -= cost; G.store.set("money", G.ECON.money);
            OWN.fuel = 1; G.store.set("fuel", 1);
            G.emit("toast", G.T("fuel", { n: fp.n, c: cost }));
          } else if (!M._fuelWarn || performance.now() - M._fuelWarn > 30000) {
            M._fuelWarn = performance.now();
            G.emit("toast", "⛽ Petrol pump here but you need ₹" + cost + " — missions pay! 🎯");
          }
          break;
        }
      }
    }
    if (T && !T.rail && P.mode !== "foot") {
      if (OWN.fuel > 0) OWN.fuel = Math.max(0, OWN.fuel - dt * (0.00022 + 0.00002 * T.vmax) * Math.min(1, (P.v || 0) / 6));
      if (OWN.fuel <= 0 && (P.v || 0) > 2) { P.v *= (1 - Math.min(0.9, dt * 1.6)); if (Math.random() < dt * 0.2) G.emit("toast", "⛽ Out of fuel! Open 🚗 Garage → Refuel"); }
    }
    // speeding challans — motor traffic only
    if (!HEADLESS && T && T.road) {
      const lim = 26;
      if ((P.v || 0) > lim * 1.45) {
        M._sp = (M._sp || 0) + dt;
        if (M._sp > 6) {
          M._sp = 0;
          if (G.ECON.money >= 200) { G.ECON.money -= 200; G.store.set("money", G.ECON.money); G.emit("toast", G.T("challan")); }
          else G.emit("toast", "🚨 Slow down! (no money for the challan — they took your photo)");
        }
      } else M._sp = 0;
    }
  };
  IV(() => { if (!HEADLESS) M.update(0.5); }, 500);

  // enforce garage ownership in the vehicle menu
  if (!HEADLESS && typeof G.spawnVehicle === "function") {
    const rawSpawn = G.spawnVehicle;
    G.spawnVehicle = function (type) {
      if (S.own && type !== "foot" && !OWN.owned.includes(type)) {
        G.emit("toast", "🔒 You don't own the " + ((G.VEHTYPES[type] || {}).n || type) + " — buy it in the Garage 🚗 (missions pay!)");
        return;
      }
      return rawSpawn(type);
    };
  }

  // ---------------- daily challenges (real device date) ----------------
  const nowD = new Date();
  const dayKey = nowD.getFullYear() + "-" + (nowD.getMonth() + 1) + "-" + nowD.getDate();
  const DAILY = G.DAILY = { key: dayKey, prog: G.store.get("daily_" + dayKey, { earn: 0, disc: 0, rides: 0, paid: {} }) };
  const DDEF = [
    ["earn", "Earn ₹1,500 from missions", 1500, 700],
    ["disc", "Discover 3 new places", 3, 500],
    ["rides", "Take 2 rides (train/metro/ferry/flight)", 2, 600]
  ];
  DAILY.goal = (id) => DDEF.find(d => d[0] === id)[2];
  DAILY.progress = (id, amt) => {
    DAILY.prog[id] = (DAILY.prog[id] || 0) + amt;
    G.store.set("daily_" + dayKey, DAILY.prog);
    const def = DDEF.find(d => d[0] === id);
    if (def && DAILY.prog[id] >= def[2] && !DAILY.prog.paid[id]) {
      DAILY.prog.paid[id] = 1; G.store.set("daily_" + dayKey, DAILY.prog);
      G.ECON.money += def[3]; G.store.set("money", G.ECON.money);
      G.emit("toast", "📅 Daily done: " + def[1] + " — ₹" + def[3] + " bonus!");
    }
  };
  if (typeof G.on === "function") G.on("discovered", () => DAILY.progress("disc", 1));

  // ---------------- P3: achievements ----------------
  const ACH = G.ACH = { got: G.store.get("ach", {}) };
  function ach(id, name, desc, need, have) {
    if (!ACH.got[id] && have >= need) {
      ACH.got[id] = true; G.store.set("ach", ACH.got);
      G.emit("toast", "🏆 Achievement: " + name);
    }
  }
  ACH.update = () => {
    const disc = ((G.store.get("visited", []) || [])).length;
    const ph = (G.store.get("photos", []) || []).length;
    ach("explorer1", "Wanderer", "Discover 10 places", 10, disc);
    ach("explorer2", "City Explorer", "Discover 30 places", 30, disc);
    ach("explorer3", "The 780", "Discover 70 places", 70, disc);
    ach("chron1", "Postcard home", "Own 3 postcards", 3, ph);
    ach("chron2", "Chronicle of Mumbai", "Own 6 postcards", 6, ph);
    ach("rich1", "First lakh", "Hold ₹1,00,000", 100000, G.ECON.money);
    ach("rich2", "Serious money", "Hold ₹5,00,000", 500000, G.ECON.money);
    const dists = Object.keys(G.store.get("districts", {})).length;
    ach("boro1", "Neighbourhood hopping", "Visit 5 districts", 5, dists);
    ach("boro2", "Knows the Boroughs", "Visit 9 districts", 9, dists);
    ach("boro3", "The whole city", "Visit 14 districts", 14, dists);
  };
  IV(() => { if (!HEADLESS) ACH.update(); }, 4000);
  IV(() => { // rides keep moving even when the 3D view is closed
    if (HEADLESS || !RIDE.on) return;
    if (!(G.TW && G.TW.active && G.TW.ready)) RIDE.update(0.25);
    const hand = document.getElementById("bHand");
    if (hand) hand.style.display = RIDE.on ? "block" : "none";
  }, 250);

  // ---------------- P2: districts ----------------
  const DISTRICTS = G.DISTRICTS = [
    ["Colaba", -12900, -19800], ["Fort & Kala Ghoda", -12400, -17200], ["Tardeo & Byculla", -12300, -13800],
    ["Worli & Sea Link", -13900, -10100], ["Dadar & Matunga", -10750, -8850], ["Mahim & Dharavi", -10400, -6300],
    ["Bandra & Khar", -12300, -4400], ["Andheri & Versova", -10730, 2200], ["Borivali & Malad", -10000, 12160],
    ["Powai & Vikhroli", -4630, 1880], ["Ghatkopar & Chembur", -5790, -4420], ["Vashi & Navi Mumbai", 900, -5000],
    ["Thane", -210, 9950], ["Juhu Beach", -13100, -1300], ["Gateway Harbour", -12550, -18900]
  ];
  const distOf = (x, y) => {
    let best = null, bd = 1e18;
    for (const d of DISTRICTS) { const q = (x - d[1]) * (x - d[1]) + (y - d[2]) * (y - d[2]); if (q < bd) { bd = q; best = d; } }
    return bd < 2600 * 2600 ? best : null;
  };
  let lastDist = null;
  IV(() => {
    if (HEADLESS) return;
    const d = distOf(G.PL.x, G.PL.y);
    if (d && d !== lastDist) {
      G.emit("toast", "🏙️ " + d[0]);
      const seen = G.store.get("districts", {}); seen[d[0]] = 1; G.store.set("districts", seen);
    }
    lastDist = d;
  }, 3000);

  // ---------------- P4: metro hop rides + scenic flight ----------------
  const RIDE = G.RIDE = { on: null };
  function metroLines() { return (G.W.rails || []).filter(r => r.kind === "metro"); }
  function allRideableLines() { return (G.W.rails || []).filter(r => r.pts && r.pts.length > 2); }
  function nearestStop(lines, maxD) {
    let best = null, bd = maxD * maxD;
    for (const r of lines) for (const st of (r.st || [])) {
      const d = (G.PL.x - st.x) * (G.PL.x - st.x) + (G.PL.y - st.y) * (G.PL.y - st.y);
      if (d < bd) { bd = d; best = { st, r, d }; }
    }
    return best;
  }
  function nearestMetroStop() { return nearestStop(metroLines(), 400); }
  function nearestRailStop() { return nearestStop(allRideableLines(), 400); }
  function boardLine(r, hopM, label) {
    const pts = r.pts;
    let bi = 0, bd = 1e18;
    for (let i = 0; i < pts.length; i++) { const d = (G.PL.x - pts[i][0]) ** 2 + (G.PL.y - pts[i][1]) ** 2; if (d < bd) { bd = d; bi = i; } }
    let dist = 0, ei = bi;
    while (ei < pts.length - 1 && dist < hopM) { dist += Math.hypot(pts[ei + 1][0] - pts[ei][0], pts[ei + 1][1] - pts[ei][1]); ei++; }
    if (dist < 100) {
      ei = bi; dist = 0;
      while (ei > 0 && dist < hopM) { dist += Math.hypot(pts[ei - 1][0] - pts[ei][0], pts[ei - 1][1] - pts[ei][1]); ei--; }
      RIDE.on = { kind: "metro", pts, i: bi, end: ei, t: 0, name: label, back: true };
      G.emit("toast", label + " — riding " + Math.round(dist) + " m. Tap ✋ to alight.");
      return;
    }
    RIDE.on = { kind: "metro", pts, i: bi, end: ei, t: 0, name: label, line: r, ann: {} };
    G.emit("toast", G.T("board") + " (" + Math.round(dist) + " m)");
  }
  RIDE.metro = () => {
    const near = nearestMetroStop();
    if (!near) { G.emit("toast", "🚇 No metro station within 400 m"); return; }
    boardLine(near.r, 1400, "🚇 " + (near.r.name || "Metro"));
  };
  RIDE.train = () => {
    const near = nearestRailStop();
    if (!near) { G.emit("toast", "🚆 No railway station within 400 m"); return; }
    boardLine(near.r, 2600, "🚆 " + (near.r.name || "Local"));
  };
  RIDE.trainFull = () => {
    const near = nearestRailStop();
    if (!near) { G.emit("toast", "🚆 No railway station within 400 m"); return; }
    boardLine(near.r, 1e9, "🚆 " + (near.r.name || "Local") + " (full line)");
    RIDE.on.line = near.r; RIDE.on.ann = {};
  };
  RIDE.metroFull = () => {
    const near = nearestMetroStop();
    if (!near) { G.emit("toast", "🚇 No metro station within 400 m"); return; }
    boardLine(near.r, 1e9, "🚇 " + (near.r.name || "Metro") + " (full line)");
    RIDE.on.line = near.r; RIDE.on.ann = {};
  };
  const FLIGHT_WPS = [[-3620, -9180], [-9500, -13200], [-12300, -17000], [-13100, -1300], [-9835, -5971], [-5900, 1200]];
  const FERRY_PTS = [[-12550, -18900], [-14300, -19700], [-16100, -20600], [-17500, -21500]];
  RIDE.ferry = () => {
    const dGw = Math.hypot(G.PL.x - FERRY_PTS[0][0], G.PL.y - FERRY_PTS[0][1]);
    if (dGw > 900 && !G.TERRAIN.waterAt(G.PL.x, G.PL.y, 1.5)) { G.emit("toast", "⛴️ The ferry sails from Gateway Harbour (or jump in anywhere on water)"); return; }
    const pts = FERRY_PTS;
    let bi = 0, bd = 1e18;
    for (let i = 0; i < pts.length; i++) { const d = (G.PL.x - pts[i][0]) ** 2 + (G.PL.y - pts[i][1]) ** 2; if (d < bd) { bd = d; bi = i; } }
    RIDE.on = { kind: "ferry", pts, i: bi, end: pts.length - 1, t: 0, name: "⛴️ Harbour ferry", back: bi === pts.length - 1 };
    if (!G.PL._rideMode) G.PL._rideMode = G.PL.mode;
    G.PL.mode = "boat"; G.PL.alt = 0;
    const d = G.ENV.date();
    G.emit("toast", "⛴️ M2 Harbour ferry (Gateway ⇄ Butcher Island) — sailed " + d.h + ":" + (d.mi < 10 ? "0" : "") + d.mi + ". Tap ✋ to disembark.");
  };
  RIDE.flight = () => {
    RIDE.on = { kind: "flight", wps: FLIGHT_WPS, i: 0, alt: 260, name: "Coastal flight" };
    if (!G.PL._rideMode) G.PL._rideMode = G.PL.mode;
    G.PL.mode = "heli"; G.PL.v = 0;
    G.emit("toast", "✈️ Scenic coastal flight — CSMIA → Marine Drive → Gateway → Juhu. Tap ✋ to skip.");
  };
  RIDE.alight = () => {
    if (!RIDE.on) return;
    RIDE.on = null;
    if (G.PL._rideMode) { G.PL.mode = G.PL._rideMode; G.PL._rideMode = null; }
    if (G.DAILY) G.DAILY.progress("rides", 1);
    G.PL.alt = 0; G.PL.v = 0; G.PL.grounded = true;
    G.emit("toast", "🚏 You stepped off.");
  };
  RIDE.update = (dt) => {
    if (!RIDE.on) return;
    const P = G.PL, sp = RIDE.on.kind === "flight" ? 46 : 15;
    if (RIDE.on.kind === "metro" || RIDE.on.kind === "ferry") {
      const pts = RIDE.on.pts, back = RIDE.on.back;
      const step = () => back ? (RIDE.on.i > 0 ? (RIDE.on.i--, true) : false) : (RIDE.on.i < pts.length - 2 ? (RIDE.on.i++, true) : false);
      let seg = Math.hypot(pts[RIDE.on.i + 1][0] - pts[RIDE.on.i][0], pts[RIDE.on.i + 1][1] - pts[RIDE.on.i][1]) || 1;
      RIDE.on.t += sp * dt / seg;
      let guard = 0;
      while (RIDE.on.t >= 1 && RIDE.on.i !== RIDE.on.end && guard++ < 100) { RIDE.on.t -= 1; step(); seg = Math.hypot(pts[RIDE.on.i + 1][0] - pts[RIDE.on.i][0], pts[RIDE.on.i + 1][1] - pts[RIDE.on.i][1]) || 1; }
      const i = Math.min(RIDE.on.i, pts.length - 2);
      P.x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * RIDE.on.t;
      P.y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * RIDE.on.t;
      P.heading = Math.atan2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (RIDE.on.line && RIDE.on.line.st) {
        for (const st of RIDE.on.line.st) {
          const dd = Math.hypot(P.x - st.x, P.y - st.y);
          if (dd < 130 && !RIDE.on.ann[st.x + "," + st.y]) {
            RIDE.on.ann[st.x + "," + st.y] = 1;
            const poi = G.POI.nearest(st.x, st.y, 420);
            G.emit("toast", "🚏 Now approaching: " + (poi ? poi.name : "next station"));
          }
        }
      }
      if (RIDE.on.i === RIDE.on.end) {
        const nm = RIDE.on.name; RIDE.alight();
        G.emit("toast", nm + " — arrived. Mind the gap.");
      }
    } else {
      const wp = RIDE.on.wps[RIDE.on.i];
      const d = Math.hypot(wp[0] - P.x, wp[1] - P.y);
      if (d < 300) { RIDE.on.i++; if (RIDE.on.i >= RIDE.on.wps.length) { P.alt = 0; RIDE.alight(); G.emit("toast", "✈️ Landed at Juhu. नमस्ते!"); return; } }
      P.heading = Math.atan2(wp[0] - P.x, wp[1] - P.y);
      P.x += Math.sin(P.heading) * sp * dt; P.y += Math.cos(P.heading) * sp * dt;
      P.alt = Math.min(RIDE.on.alt, (P.alt || 0) + dt * 22);
    }
  };

  // ---------------- DOM layer (skipped headless) ----------------
  if (DOM) {
    const css = document.createElement("style");
    css.textContent = ".fbtn{width:44px;height:38px;font-size:19px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:rgba(10,24,34,.82);color:#fff;margin:3px 0} .fpanel{position:fixed;top:64px;right:10px;z-index:60;width:min(340px,86vw);max-height:70vh;overflow:auto;display:none} .mrow{display:flex;gap:6px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08)}";
    document.head.appendChild(css);

    const bar = document.createElement("div");
    bar.style.cssText = "position:fixed;top:8px;right:10px;z-index:61;display:flex;flex-direction:column";
    bar.innerHTML = `<button class="fbtn" id="bMiss">🎯</button><button class="fbtn" id="bGar">🚗</button><button class="fbtn" id="bBook">📖</button><button class="fbtn" id="bSet">⚙️</button><button class="fbtn" id="bBug">🐞</button><button class="fbtn" id="bHand" style="display:none">✋</button>`;
    document.body.appendChild(bar);

    const panel = document.createElement("div");
    panel.className = "fpanel panel";
    panel.id = "fpanel";
    document.body.appendChild(panel);
    const P = (html) => { panel.innerHTML = html; panel.style.display = "block"; };
    const closeP = () => { panel.style.display = "none"; };
    const q = (id) => document.getElementById(id);
    const money = () => "₹" + G.ECON.money.toLocaleString("en-IN");

    function missionsUI() {
      M.refresh();
      let h = `<h3>🎯 Mission Board</h3>`;
      if (M.act) h += `<div class="mrow"><div style="flex:1">${M.act.name}<br><b style="color:#8fd">${money()}</b></div><button class="fbtn" id="mAb">✖</button></div><p style="opacity:.7;font-size:11px">Follow the waypoint arrow. Payment on completion.</p>`;
      else h += M.offers.map((o, i) => `<div class="mrow"><div style="flex:1;font-size:12px">${o.name}</div><b style="color:#8fd">₹${o.pay}</b><button class="fbtn" data-mi="${i}" style="width:34px">✔</button></div>`).join("");
      h += `<p style="opacity:.6;font-size:11px">Done: ${M.done} · New offers each time you open the board.</p>
            ${nearestMetroStop() ? `<button class="fbtn" id="mMetro" style="width:100%">🚇 Board Metro (nearby station)</button>` : ""}
            ${nearestMetroStop() ? `<button class="fbtn" id="mMetroF" style="width:100%">🚇 Metro — FULL line ride</button>` : ""}
            ${nearestRailStop() ? `<button class="fbtn" id="mTrain" style="width:100%">🚆 Ride a Local (nearby station)</button>` : ""}
            ${nearestRailStop() ? `<button class="fbtn" id="mTrainF" style="width:100%">🚆 Local — FULL line ride</button>` : ""}
            <button class="fbtn" id="mFerry" style="width:100%">⛴️ Harbour ferry M2 (Gateway ⇄ Butcher Island)</button>
            <button class="fbtn" id="mFlight" style="width:100%">✈️ Scenic coastal flight (from CSMIA)</button>
            <h4>⭐ Mumbai Stories</h4>` +
            G.STORIES.map((st, i) => `<div class="mrow"><div style="flex:1;font-size:12px">${st.name}</div><b style="color:#8fd">₹${st.pay}</b><button class="fbtn" data-story="${i}" style="width:34px">▶</button></div>`).join("") +
            `<h4>📅 Today's challenges</h4>` +
            [["earn", "Earn ₹1,500 from missions"], ["disc", "Discover 3 new places"], ["rides", "Take 2 rides"]].map(dd => {
              const def = DDEF.find(x => x[0] === dd[0]);
              const pr = Math.min(DAILY.prog[dd[0]] || 0, def[2]);
              return `<div class="mrow"><span style="flex:1;font-size:11px">${dd[1]}</span><b style="font-size:11px;color:${DAILY.prog.paid[dd[0]] ? "#8f8" : "#8fd"}">${pr}/${def[2]}</b></div>`;
            }).join("") +
            `<button class="fbtn" id="mClose" style="width:100%">Close</button>`;
      P(h);
      document.querySelectorAll("[data-story]").forEach(b => b.onclick = () => { M.startStory(+b.dataset.story); closeP(); });
      const mmF = q("mMetroF"); if (mmF) mmF.onclick = () => { RIDE.metroFull(); closeP(); };
      const mtF = q("mTrainF"); if (mtF) mtF.onclick = () => { RIDE.trainFull(); closeP(); };
      document.querySelectorAll("[data-mi]").forEach(b => b.onclick = () => { M.accept(+b.dataset.mi); closeP(); });
      const ab = q("mAb"); if (ab) ab.onclick = () => { M.abandon(); closeP(); };
      const mm = q("mMetro"); if (mm) mm.onclick = () => { RIDE.metro(); closeP(); };
      const mt = q("mTrain"); if (mt) mt.onclick = () => { RIDE.train(); closeP(); };
      q("mFerry").onclick = () => { RIDE.ferry(); closeP(); };
      q("mFlight").onclick = () => { RIDE.flight(); closeP(); };
      q("mClose").onclick = closeP;
      const hand = q("bHand"); hand.style.display = RIDE.on ? "block" : "none";
    }

    function garageUI() {
      const integ = Math.max(0.15, G.PL.integrity === undefined ? 1 : G.PL.integrity);
      let h = `<h3>🚗 Garage & Fuel</h3><div class="mrow"><b>${money()}</b><div style="flex:1"></div><div>⛽ ${Math.round(OWN.fuel * 100)}% · ₹${G.fuelPrice().toFixed(2)}/%</div></div>
      <div class="mrow"><span>🛠️ Vehicle condition ${Math.round(integ * 100)}%</span><div style="flex:1"></div>${integ < 0.99 ? `<button class="fbtn" id="repair" style="width:auto;padding:0 8px;font-size:13px">Repair ₹${Math.ceil((1 - integ) * 8000)}</button>` : "<b style='color:#8f8'>FIT</b>"}</div>`;
      for (const k of Object.keys(PRICES)) {
        const T = G.VEHTYPES[k], has = OWN.owned.includes(k);
        h += `<div class="mrow"><span>${T.icon} ${T.n}</span><div style="flex:1"></div>${has ? `<b style="color:#8f8">OWNED</b>` : `<button class="fbtn" data-buy="${k}" style="width:auto;padding:0 8px;font-size:13px">₹${PRICES[k].toLocaleString("en-IN")}</button>`}</div>`;
      }
      h += `<div class="mrow"><button class="fbtn" id="refuel" style="width:auto;padding:0 10px">⛽ Refuel ₹${Math.ceil((1 - OWN.fuel) * 100) * 2}</button><div style="flex:1"></div><label style="font-size:11px"><input type="checkbox" id="ownTgl" ${S.own ? "checked" : ""}> ownership required</label></div>
      <button class="fbtn" id="gClose" style="width:100%">Close</button>`;
      P(h);
      document.querySelectorAll("[data-buy]").forEach(b => b.onclick = () => {
        const k = b.dataset.buy, pr = PRICES[k];
        if (G.ECON.money >= pr) {
          G.ECON.money -= pr; G.store.set("money", G.ECON.money);
          OWN.owned.push(k); G.store.set("owned", OWN.owned);
          G.emit("toast", "🔑 Bought " + G.VEHTYPES[k].n + "!");
        } else G.emit("toast", "💸 Not enough money (₹" + pr.toLocaleString("en-IN") + "). Take missions! 🎯");
        garageUI();
      });
      const rp = q("repair");
      if (rp) rp.onclick = () => {
        const cost = Math.ceil((1 - Math.max(0.15, G.PL.integrity || 1)) * 8000);
        if (G.ECON.money >= cost) { G.ECON.money -= cost; G.store.set("money", G.ECON.money); G.PL.integrity = 1; G.emit("toast", "🛠️ Repaired — ₹" + cost); }
        else G.emit("toast", "💸 Not enough for repairs");
        garageUI();
      };
      q("refuel").onclick = () => {
        const cost = Math.ceil((1 - OWN.fuel) * 100 * G.fuelPrice());
        if (cost <= 0) { G.emit("toast", "⛽ Tank is full"); return; }
        if (G.ECON.money >= cost) { G.ECON.money -= cost; G.store.set("money", G.ECON.money); OWN.fuel = 1; G.store.set("fuel", 1); G.emit("toast", "⛽ Full tank — ₹" + cost); }
        else G.emit("toast", "💸 Not enough for fuel");
        garageUI();
      };
      q("ownTgl").onchange = (e) => { S.own = e.target.checked ? 1 : 0; saveS(); };
      q("gClose").onclick = closeP;
    }

    function bookUI() {
      const ph = G.store.get("photos", []);
      let h = `<h3>📖 Postcards & Achievements</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">` +
        ph.map((s, i) => `<div style="background:rgba(255,255,255,.06);border-radius:6px;padding:4px"><img src="${s.s}" style="width:100%;border-radius:4px"><div style="font-size:9px;opacity:.8">${s.at}</div><button class="fbtn" data-exp="${i}" style="width:100%;font-size:11px;height:26px">⬇️ export</button></div>`).join("") +
        `</div>${ph.length ? "" : "<p style='opacity:.7'>No postcards yet.</p>"}
      <h4>🏆 Achievements</h4>` +
        ["explorer1|Wanderer|10 places", "explorer2|City Explorer|30 places", "explorer3|The 780|70 places", "chron1|Postcard home|3 postcards", "chron2|Chronicle|6 postcards", "worker1|Working for the city|5 missions", "worker2|Backbone|15 missions", "worker3|Mumbai's own|40 missions", "rich1|First lakh|₹1L", "rich2|Serious money|₹5L", "boro1|Hopping|5 districts", "boro2|Boroughs|9 districts", "boro3|Whole city|14 districts"]
          .map(a => { const [id, n, d] = a.split("|"); return `<div class="mrow"><span>${ACH.got[id] ? "🏆" : "◻️"} ${n}</span><div style="flex:1"></div><span style="font-size:10px;opacity:.7">${d}</span></div>`; }).join("") +
        `<button class="fbtn" id="bkClose" style="width:100%">Close</button>`;
      P(h);
      document.querySelectorAll("[data-exp]").forEach(b => b.onclick = () => {
        const s = ph[+b.dataset.exp];
        try {
          const a = document.createElement("a");
          a.href = s.s; a.download = "postcard_" + s.at.replace(/\W+/g, "_") + ".jpg";
          document.body.appendChild(a); a.click(); a.remove();
          G.emit("toast", "⬇️ Postcard exported (check Downloads; if blocked, screenshot it)");
        } catch (e) { G.emit("toast", "Export blocked — long-press the postcard to save it"); }
      });
      q("bkClose").onclick = closeP;
    }

    function settingsUI() {
      let h = `<h3>⚙️ Settings</h3>
      <div class="mrow"><label style="flex:1"><input type="checkbox" id="sQ" ${S.quality ? "checked" : ""}> High graphics</label></div>
      <div class="mrow"><label style="flex:1"><input type="checkbox" id="sS" ${S.sound ? "checked" : ""}> Sound</label></div>
      <div class="mrow"><label style="flex:1"><input type="checkbox" id="sL" ${S.labels ? "checked" : ""}> District name signs</label></div>
      <div class="mrow"><h4 style="margin:0">Language</h4>${[["en", "EN"], ["hi", "हिं"], ["mr", "मरा"]].map(l => `<button class="fbtn" data-lang="${l[0]}" style="width:46px;${S.lang === l[0] ? "border-color:#8fd" : ""}">${l[1]}</button>`).join("")}</div>
      <div class="mrow"><label style="flex:1"><input type="checkbox" id="sInv" ${S.invert ? "checked" : ""}> Invert look drag</label></div>
      <div class="mrow"><button class="fbtn" id="sExport" style="flex:1">⬆️ Export save</button><button class="fbtn" id="sImport" style="flex:1">⬇️ Import save</button></div>
      <div class="mrow"><textarea id="sXfer" style="width:100%;height:64px;font:10px monospace" placeholder="save text appears here / paste here to import"></textarea></div>
      <div class="mrow"><h4 style="margin:0">Save slot</h4>${["A", "B", "C"].map(s => `<button class="fbtn" data-slot="${s}" style="width:40px;${S.slot === s ? "border-color:#8fd" : ""}">${s}</button>`).join("")}</div>
      <div class="mrow"><button class="fbtn" id="sReset" style="width:100%;color:#f88">Erase this slot's progress</button></div>
      <button class="fbtn" id="sClose" style="width:100%">Close</button>`;
      P(h);
      q("sQ").onchange = e => { S.quality = e.target.checked ? 1 : 0; saveS(); applyQuality(); };
      q("sS").onchange = e => { S.sound = e.target.checked ? 1 : 0; saveS(); applySound(); };
      q("sL").onchange = e => { S.labels = e.target.checked ? 1 : 0; saveS(); applyLabels(); };
      q("sInv").onchange = e => { S.invert = e.target.checked ? 1 : 0; saveS(); };
      document.querySelectorAll("[data-lang]").forEach(b => b.onclick = () => { S.lang = b.dataset.lang; saveS(); settingsUI(); });
      q("sExport").onclick = () => {
        const keys = ["save", "save_A", "save_B", "save_C", "settings", "owned", "fuel", "money", "visited", "ach", "missionsDone", "photos", "districts", "tutDone"];
        const dump = {};
        keys.forEach(k => { const v = G.store.get(k, undefined); if (v !== undefined && v !== null) dump[k] = v; });
        const txt = JSON.stringify(dump);
        q("sXfer").value = txt;
        try { navigator.clipboard.writeText(txt).then(() => G.emit("toast", "⬆️ Save copied to clipboard"), () => G.emit("toast", "⬆️ Save text ready — copy it")); } catch (e) { G.emit("toast", "⬆️ Save text ready — copy it"); }
      };
      q("sImport").onclick = () => {
        try {
          const dump = JSON.parse(q("sXfer").value);
          Object.keys(dump).forEach(k => G.store.set(k, dump[k]));
          G.emit("toast", "⬇️ Imported — restart the app to load it");
          closeP();
        } catch (e) { G.emit("toast", "Import failed — paste a valid save text first"); }
      };
      document.querySelectorAll("[data-slot]").forEach(b => b.onclick = () => {
        S.slot = b.dataset.slot; saveS();
        const sv = G.store.get("save_" + S.slot, null);
        if (sv) { G.store.set("save", sv); G.emit("toast", "💾 Slot " + S.slot + " loaded — teleports you there"); G.PL.x = sv.x; G.PL.y = sv.y; if (sv.mode) G.PL.mode = sv.mode; }
        else G.emit("toast", "💾 Slot " + S.slot + " is empty — will start fresh there");
        settingsUI();
      });
      q("sReset").onclick = () => {
        G.store.set("save_" + S.slot, null); G.store.set("save", null);
        G.emit("toast", "🧹 Progress erased for slot " + S.slot + " (reload the app)"); closeP();
      };
      q("sClose").onclick = closeP;
    }

    function bugUI() {
      const stored = G.store.get("lastError", null);
      P(`<h3>🐞 Diagnostics</h3><div style="font:11px monospace;background:rgba(0,0,0,.4);padding:8px;border-radius:6px;white-space:pre-wrap">${stored || "No errors recorded. 👍"}</div><p style="font-size:11px;opacity:.7">Send this text to the developer if something breaks.</p><button class="fbtn" id="bugC" style="width:100%">Close</button>`);
      q("bugC").onclick = closeP;
    }

    q("bMiss").onclick = missionsUI;
    q("bGar").onclick = garageUI;
    q("bBook").onclick = bookUI;
    q("bSet").onclick = settingsUI;
    q("bBug").onclick = bugUI;
    q("bHand").onclick = () => { RIDE.alight(); q("bHand").style.display = "none"; };
    const storedErr = G.store.get("lastError", null);
    if (storedErr) { const b = q("bBug"); b.textContent = "🐞!"; b.style.color = "#ff8080"; }

    // ---- look-around: drag the RIGHT half of the 3D canvas
    const cv3 = document.getElementById("game3d");
    if (cv3) {
      let lx = 0, ly = 0, pid = null;
      cv3.addEventListener("pointerdown", (e) => {
        if (e.clientX < window.innerWidth * 0.45) return;
        pid = e.pointerId; lx = e.clientX; ly = e.clientY; LOOK.drag = true;
      });
      cv3.addEventListener("pointermove", (e) => {
        if (!LOOK.drag || e.pointerId !== pid) return;
        LOOK.yaw += (e.clientX - lx) * 0.006;
        LOOK.pitch = Math.max(-0.8, Math.min(0.8, LOOK.pitch + (e.clientY - ly) * 0.004));
        lx = e.clientX; ly = e.clientY;
      });
      const up = () => { LOOK.drag = false; pid = null; };
      cv3.addEventListener("pointerup", up); cv3.addEventListener("pointercancel", up);
    }

    // ---------------- P1: tutorial ----------------
    const TUT = [
      ["🕹️ Move", "Drag the left joystick to walk. The ▲▼ buttons control throttle in vehicles."],
      ["🚗 Vehicles", "Tap 🚗 (or press V) to switch vehicle. Buy your own in the Garage (top-right 🚗). Missions pay!"],
      ["🗺️ The city", "Open the map (🗺️ / M). Distances are real — use ✨ teleports to jump between favourites."],
      ["🌐 The 3D world", "Tap 🌐 for the full 3D city. F6 changes camera. Buildings, trains and rain are real data."],
      ["🎯 Your Mumbai", "Missions, metro rides, the coastal flight, postcards and 3 save slots live in the buttons top-right."]
    ];
    if (!G.store.get("tutDone", 0)) {
      let step = 0;
      const t = document.createElement("div");
      t.style.cssText = "position:fixed;inset:auto 10px 84px 10px;z-index:70;background:rgba(8,20,30,.94);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:12px;font-family:inherit;color:#fff";
      const show = () => {
        const [h, b] = TUT[step];
        t.innerHTML = `<b>${h}</b><p style="font-size:12px;opacity:.9;margin:6px 0">${b}</p><div style="display:flex;gap:8px"><button class="fbtn" id="tutNext" style="flex:1">${step === TUT.length - 1 ? "Start exploring 🌆" : "Next →"}</button><button class="fbtn" id="tutSkip" style="width:70px">Skip</button></div>`;
        document.body.appendChild(t);
        q("tutNext").onclick = () => { step++; if (step >= TUT.length) { t.remove(); G.store.set("tutDone", 1); } else show(); };
        q("tutSkip").onclick = () => { t.remove(); G.store.set("tutDone", 1); };
      };
      STO(show, 3500); // after the splash
    }

    // ---------------- settings effects ----------------
    G.applyQuality = applyQuality; G.applySound = applySound; G.applyLabels = applyLabels;
    function applyQuality() {
      if (G.TW && G.TW.renderer) { try { G.TW.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, S.quality ? 2 : 1)); } catch (e) { } }
    }
    function applySound() {
      if (G.AUDIO && G.AUDIO.master) { try { G.AUDIO.master.gain.value = S.sound ? 0.8 : 0; } catch (e) { } }
    }
    function applyLabels() { if (G.TW.labels) G.TW.labels.visible = !!S.labels; }
    STO(() => { applyQuality(); applySound(); }, 6000);
  }

  // ---------------- P1/P2 3D: stars, moon, city lights, district labels, gulls ----------------
  let sky3dDone = false;
  function ensureSky3D() {
    if (sky3dDone || !G.TW || !G.TW.ready || !window.THREE) return;
    const T = G.TW, THREE = window.THREE;
    // stars
    const starGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(900 * 3);
    const rnd = G.rng(4242);
    for (let i = 0; i < 900; i++) {
      const a = rnd() * Math.PI * 2, e = 0.25 + rnd() * 1.2, r = 13000;
      sp[i * 3] = Math.cos(a) * Math.cos(e) * r; sp[i * 3 + 1] = Math.sin(e) * r; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    T.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 14, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    T.stars.frustumCulled = false; T.scene.add(T.stars);
    // moon
    const mc = document.createElement("canvas"); mc.width = mc.height = 64;
    const mg = mc.getContext("2d"); const grd = mg.createRadialGradient(32, 32, 4, 32, 32, 32);
    grd.addColorStop(0, "rgba(240,240,235,1)"); grd.addColorStop(0.55, "rgba(220,225,235,.9)"); grd.addColorStop(1, "rgba(200,210,230,0)");
    mg.fillStyle = grd; mg.fillRect(0, 0, 64, 64);
    T.moon = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(mc), transparent: true, opacity: 0, fog: false, depthWrite: false }));
    T.moon.frustumCulled = false; T.scene.add(T.moon);
    // city lights (real rooftops)
    const pos = [], cols = [];
    for (const ra of T.realAreas || []) {
      for (let i = 0; i < ra.bldgs.length; i += 3) {
        const b = ra.bldgs[i];
        let cx = 0, cy = 0, n = b.p.length / 2;
        for (let j = 0; j < b.p.length; j += 2) { cx += b.p[j]; cy += b.p[j + 1]; }
        cx /= n; cy /= n;
        const warm = Math.random();
        cols.push(warm < 0.8 ? 1 : 0.6, warm < 0.8 ? 0.75 : 0.75, warm < 0.8 ? 0.4 : 1);
        pos.push(cx, b.h + 1.2, cy);
      }
    }
    if (pos.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      lg.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      T.cityLights = new THREE.Points(lg, new THREE.PointsMaterial({ size: 5, vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
      T.cityLights.frustumCulled = false; T.scene.add(T.cityLights);
    }
    // gulls
    T.gulls = new THREE.InstancedMesh(new THREE.ConeGeometry(1.1, 3.4, 3).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe8ecef }), 18);
    T.gulls.frustumCulled = false; T.scene.add(T.gulls);
    T._gullSeed = [];
    for (let i = 0; i < 18; i++) T._gullSeed.push([Math.random() * Math.PI * 2, 120 + Math.random() * 380]);
    // district label sprites
    // petrol pump markers (blue pillars)
    const pumpPos = new Float32Array(G.FUELSTATIONS.length * 3);
    G.FUELSTATIONS.forEach((fp, i) => { pumpPos[i * 3] = fp.x; pumpPos[i * 3 + 1] = 60; pumpPos[i * 3 + 2] = fp.y; });
    const pumpGeo = new THREE.BufferGeometry();
    pumpGeo.setAttribute("position", new THREE.BufferAttribute(pumpPos, 3));
    T.pumps = new THREE.Points(pumpGeo, new THREE.PointsMaterial({ color: 0x66aaff, size: 26, transparent: true, opacity: 0.85, depthWrite: false }));
    T.pumps.frustumCulled = false; T.scene.add(T.pumps);
    // crowds (people = body+head instanced)
    const crowdN = 120;
    T.crowdBody = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 1.55, 5), new THREE.MeshLambertMaterial({ color: 0xd8c8a8 }), crowdN);
    T.crowdHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 5, 4), new THREE.MeshLambertMaterial({ color: 0xc09878 }), crowdN);
    T.crowdBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage); T.crowdHead.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    T.crowdBody.frustumCulled = false; T.crowdHead.frustumCulled = false;
    T.scene.add(T.crowdBody); T.scene.add(T.crowdHead);
    T._crowdSeed = [];
    for (let i = 0; i < crowdN; i++) T._crowdSeed.push([Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 6.28, 0.5 + Math.random()]);
    // sea link toll gantries
    T.tollBooms = [];
    for (const g of SEALINK_GATES) {
      const grp = new THREE.Group();
      const pm = new THREE.MeshLambertMaterial({ color: 0x8892a0 });
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 9, 6), pm); p1.position.set(-8, 4.5, 0); grp.add(p1);
      const p2 = p1.clone(); p2.position.x = 8; grp.add(p2);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(15, 0.45, 0.45), new THREE.MeshLambertMaterial({ color: 0xd04040 }));
      boom.position.set(0, 6.4, 0); grp.add(boom);
      grp.position.set(g.x, G.TERRAIN ? Math.max(2, G.TERRAIN.elev(g.x, g.y)) : 2, g.y);
      grp.rotation.y = 0.3;
      T.scene.add(grp);
      T.tollBooms.push({ boom, g });
    }
    // ganpati procession (people + floats)
    T.gpPpl = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 1.6, 5), new THREE.MeshLambertMaterial({ color: 0xe8b050 }), 40);
    T.gpFloats = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 2.6, 2.4), new THREE.MeshLambertMaterial({ color: 0xd060a0 }), 3);
    T.gpCanopy = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 1.2, 6), new THREE.MeshLambertMaterial({ color: 0xffd060 }), 3);
    [T.gpPpl, T.gpFloats, T.gpCanopy].forEach(m => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; T.scene.add(m); });
    // fireworks
    T.fwRocket = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3)), new THREE.PointsMaterial({ color: 0xffe0a0, size: 22, transparent: true, opacity: 0 }));
    T.fwBurst = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(42 * 3), 3)), new THREE.PointsMaterial({ color: 0xffd0d0, size: 14, transparent: true, opacity: 0 }));
    T.fwRocket.frustumCulled = false; T.fwBurst.frustumCulled = false;
    T.scene.add(T.fwRocket); T.scene.add(T.fwBurst);
    T._fw = { t: 0, phase: 0, site: 0, base: [0, 0] };
    // golden-hour sun sprite
    const sc = document.createElement("canvas"); sc.width = sc.height = 64;
    const sg = sc.getContext("2d"); const sgr = sg.createRadialGradient(32, 32, 3, 32, 32, 32);
    sgr.addColorStop(0, "rgba(255,230,170,1)"); sgr.addColorStop(0.4, "rgba(255,190,110,.95)"); sgr.addColorStop(1, "rgba(255,160,60,0)");
    sg.fillStyle = sgr; sg.fillRect(0, 0, 64, 64);
    T.sunSprite = new THREE.Mesh(new THREE.PlaneGeometry(1300, 1300), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0, fog: false, depthWrite: false }));
    T.sunSprite.frustumCulled = false; T.scene.add(T.sunSprite);
    T.labels = new THREE.Group();
    for (const d of DISTRICTS) {
      const cv = document.createElement("canvas"); cv.width = 512; cv.height = 96;
      const g = cv.getContext("2d");
      g.font = "bold 54px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.strokeStyle = "rgba(0,20,30,.9)"; g.lineWidth = 10; g.strokeText(d[0], 256, 48);
      g.fillStyle = "#eaf6ff"; g.fillText(d[0], 256, 48);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.9, depthTest: false }));
      spr.position.set(d[1], 260, d[2]);
      spr.scale.set(900, 170, 1);
      T.labels.add(spr);
    }
    T.scene.add(T.labels);
    sky3dDone = true;
    if (DOM) applyLabels();
  }

  // ---------------- living-world effects (per frame inside the render wrapper) ----------------
  const LOOK = G.LOOK = { yaw: 0, pitch: 0, drag: false };
  let lastV = null, fpsE = 60, fpsLow = 0, floodOn = false;
  function effectsTick(dt) {
    const T = G.TW, env = G.ENV, pl = G.PL, THREE = window.THREE;
    const day = env.sun().day;
    const golden = Math.max(0, 1 - Math.abs(env.sun().alt) / 0.22) * (env.sun().alt > -0.22 ? 1 : 0);
    // ---- look camera (post-orig rotation for CHASE/WALK-ish cams)
    if (!LOOK.drag) { LOOK.yaw *= 0.986; LOOK.pitch *= 0.986; }
    if ((Math.abs(LOOK.yaw) > 0.005 || Math.abs(LOOK.pitch) > 0.005) && T.camMode !== 3) {
      const dir = S.invert ? -1 : 1;
      const px = pl.x, pz = pl.y, elev = G.TERRAIN.elev(pl.x, pl.y);
      const dx = T.cam.position.x - px, dz = T.cam.position.z - pz;
      const a = LOOK.yaw * dir, ca = Math.cos(a), sa = Math.sin(a);
      T.cam.position.x = px + dx * ca - dz * sa;
      T.cam.position.z = pz + dx * sa + dz * ca;
      T.cam.position.y = elev + (T.cam.position.y - elev) * Math.exp(-LOOK.pitch * dir);
      T.cam.lookAt(px, elev + 2, pz);
    }
    // ---- sun + golden tint
    if (T.sunSprite) {
      const az = (env.t / 86400) * Math.PI * 2 - Math.PI / 2;
      const alt = env.sun().alt;
      T.sunSprite.position.set(pl.x + Math.cos(az) * 9000, Math.sin(alt) * 8000 + 400, pl.y + Math.sin(az) * 9000);
      T.sunSprite.material.opacity = Math.max(0, Math.min(1, alt * 8));
      T.sunSprite.lookAt(T.cam.position);
      if (T.renderer && T._baseClear === undefined) { try { T._baseClear = T.renderer.getClearColor(new THREE.Color()).clone(); } catch (e) { T._baseClear = new THREE.Color(0x87ceeb); } }
      if (T.renderer && T._baseClear) {
        const c = T._baseClear.clone().lerp(new THREE.Color(0xff9a55), Math.min(0.55, golden * 0.55));
        try { T.renderer.setClearColor(c, 1); } catch (e) { }
      }
    }
    // ---- monsoon flooding
    if (T.water) {
      const flood = Math.max(0, env.rain - 0.5) * 6;
      T.water.position.y = 1.0 + env.tide() * 0.35 + flood;
      if (T.waterMat) { try { T.waterMat.color.setHex(0x2a4a5a).lerp(new THREE.Color(0x6a5f49), Math.min(0.7, flood / 2)); } catch (e) { } }
      if (flood > 0.7 && !floodOn) { floodOn = true; G.emit("toast", "🌊 Monsoon flooding — low-lying roads are under water"); }
      if (flood < 0.1) floodOn = false;
    }
    // ---- crash damage (sudden deceleration while driving)
    if (lastV !== null && pl.mode !== "foot" && lastV - (pl.v || 0) > 9 && (pl.v || 0) < 5) {
      pl.integrity = Math.max(0.15, (pl.integrity === undefined ? 1 : pl.integrity) - 0.25);
      G.emit("toast", G.T("crash"));
    }
    lastV = pl.v || 0;
    // ---- crowds near POIs
    if (T.crowdBody && day > 0.15 && env.rain < 0.5) {
      const near = G.POI.nearby(pl.x, pl.y, 420);
      let n = 0;
      const m = T._m4, q4 = T._q, sc3 = T._s, pv = T._p, col = T._col;
      const t = performance.now() / 1000;
      const per = Math.max(4, Math.floor(T._crowdSeed.length / Math.max(1, near.length)));
      for (const poi of near) {
        for (let k = 0; k < per && n < T._crowdSeed.length; k++) {
          const sd = T._crowdSeed[n];
          const wx = poi.x + sd[0] * 70 + Math.cos(t * sd[3] + sd[2]) * 4;
          const wz = poi.y + sd[1] * 70 + Math.sin(t * sd[3] + sd[2]) * 4;
          const ey = G.TERRAIN.elev(wx, wz);
          pv.set(wx, ey + 0.8 + Math.abs(Math.sin(t * sd[3] * 2 + sd[2])) * 0.06, wz);
          q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t * sd[3] + sd[2]);
          sc3.set(1, 1, 1); m.compose(pv, q4, sc3);
          T.crowdBody.setMatrixAt(n, m);
          pv.set(wx, ey + 1.75, wz); m.compose(pv, q4, sc3);
          T.crowdHead.setMatrixAt(n, m);
          n++;
        }
        if (n >= T._crowdSeed.length) break;
      }
      T.crowdBody.count = n; T.crowdHead.count = n;
      T.crowdBody.instanceMatrix.needsUpdate = true; T.crowdHead.instanceMatrix.needsUpdate = true;
      T.crowdBody.visible = true; T.crowdHead.visible = true;
    } else if (T.crowdBody) { T.crowdBody.visible = false; T.crowdHead.visible = false; }
    // ---- sea link tolls
    for (const tb of (T.tollBooms || [])) {
      const g = tb.g;
      const d = Math.hypot(pl.x - g.x, pl.y - g.y);
      g.open += ((d < 30 ? 1 : 0) - g.open) * Math.min(1, dt * 2.2);
      tb.boom.rotation.z = -1.35 * g.open;
      if (d < 20 && performance.now() - g.last > 90000 && (pl.v || 0) > 0.5) {
        g.last = performance.now();
        if (G.ECON.money >= 60) { G.ECON.money -= 60; G.store.set("money", G.ECON.money); G.emit("toast", "🛣️ Sea Link toll ₹" + 60 + " — " + g.side + " side"); }
        else G.emit("toast", "🛣️ Toll unpaid at " + g.side + " — they noted your plate!");
      }
    }
    // ---- ganpati procession (seasonal)
    if (T.gpPpl) {
      const on = isGanpati();
      T.gpPpl.visible = on; T.gpFloats.visible = on; T.gpCanopy.visible = on;
      if (on) {
        const dMid = Math.hypot(pl.x - GANPATI_ROUTE[1][0], pl.y - GANPATI_ROUTE[1][1]);
        if (dMid < 1600) {
          T._gpT = (T._gpT || 0) + dt * 2.2;
          const span = 26, m = T._m4, q4 = T._q, sc3 = T._s, pv = T._p;
          for (let i = 0; i < 40; i++) {
            const u = ((T._gpT + i * 2.1) % (GANPATI_ROUTE.length - 1));
            const si = Math.min(GANPATI_ROUTE.length - 2, Math.floor(u));
            const ft = u - si;
            const a = GANPATI_ROUTE[si], b = GANPATI_ROUTE[si + 1];
            const ox = Math.sin(i * 2.4) * 6, oz = Math.cos(i * 1.7) * 6;
            const ey = G.TERRAIN.elev(a[0] + (b[0] - a[0]) * ft + ox, a[1] + (b[1] - a[1]) * ft + oz);
            pv.set(a[0] + (b[0] - a[0]) * ft + ox, ey + 0.8, a[1] + (b[1] - a[1]) * ft + oz);
            q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(b[0] - a[0], b[1] - a[1]));
            sc3.set(1, 1, 1); m.compose(pv, q4, sc3); T.gpPpl.setMatrixAt(i, m);
          }
          for (let i = 0; i < 3; i++) {
            const u = ((T._gpT * 0.5 + i * 12) % (GANPATI_ROUTE.length - 1));
            const si = Math.min(GANPATI_ROUTE.length - 2, Math.floor(u));
            const ft = u - si;
            const a = GANPATI_ROUTE[si], b = GANPATI_ROUTE[si + 1];
            const ey = G.TERRAIN.elev(a[0] + (b[0] - a[0]) * ft, a[1] + (b[1] - a[1]) * ft);
            pv.set(a[0] + (b[0] - a[0]) * ft, ey + 1.3, a[1] + (b[1] - a[1]) * ft);
            q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(b[0] - a[0], b[1] - a[1]));
            sc3.set(1, 1, 1); m.compose(pv, q4, sc3); T.gpFloats.setMatrixAt(i, m);
            pv.y = ey + 3.2; m.compose(pv, q4, sc3); T.gpCanopy.setMatrixAt(i, m);
          }
          T.gpPpl.instanceMatrix.needsUpdate = true; T.gpFloats.instanceMatrix.needsUpdate = true; T.gpCanopy.instanceMatrix.needsUpdate = true;
          if (!T._gpAnnounced) { T._gpAnnounced = true; G.emit("toast", "🪔 गणपती बाप्पा मोरया! The visarjan procession is out."); }
        }
      }
    }
    // ---- fireworks (select dates, after dark, near Marine Drive)
    if (T.fwRocket && isFireworks() && day < 0.2) {
      const d0 = Math.hypot(pl.x - MD_FIREWORKS[0][0], pl.y - MD_FIREWORKS[0][1]);
      if (d0 < 3000) {
        const st = T._fw;
        st.t += dt;
        if (st.phase === 0 && st.t > 2.2) {
          st.t = 0; st.phase = 1;
          const site = MD_FIREWORKS[(st.site++) % MD_FIREWORKS.length];
          st.base = [site[0] + (Math.random() - 0.5) * 300, site[1] + (Math.random() - 0.5) * 200];
          st.h = 0; st.peak = 200 + Math.random() * 80;
          const rp = T.fwRocket.geometry.attributes.position;
          rp.setXYZ(0, st.base[0], G.TERRAIN.elev(st.base[0], st.base[1]) + st.h, st.base[1]);
          rp.needsUpdate = true;
          T.fwRocket.material.opacity = 1;
        } else if (st.phase === 1) {
          st.h += dt * 110;
          const rp = T.fwRocket.geometry.attributes.position;
          rp.setXYZ(0, st.base[0], G.TERRAIN.elev(st.base[0], st.base[1]) + st.h, st.base[1]);
          rp.needsUpdate = true;
          if (st.h >= st.peak) {
            st.phase = 2; st.t = 0;
            T.fwRocket.material.opacity = 0;
            T.fwBurst.material.color.setHSL(Math.random(), 0.75, 0.65);
            const bp = T.fwBurst.geometry.attributes.position;
            for (let i = 0; i < 42; i++) {
              const a2 = (i / 42) * Math.PI * 2, r2 = (i % 3) * 14 + 8;
              bp.setXYZ(i, st.base[0] + Math.cos(a2) * r2, st.peak + Math.sin(a2 * 1.3) * r2, st.base[1] + Math.sin(a2) * r2);
            }
            bp.needsUpdate = true;
            T.fwBurst.material.opacity = 1;
          }
        } else if (st.phase === 2) {
          T.fwBurst.material.opacity = Math.max(0, 1 - st.t / 1.4);
          if (st.t > 1.4) { st.phase = 0; st.t = 0; T.fwBurst.material.opacity = 0; }
        }
      }
    }
    // ---- auto low-end profile
    if (T.renderer) {
      try {
        const info = T.renderer.info;
        fpsE = fpsE * 0.97 + (1 / Math.max(0.016, dt || 0.016)) * 0.03;
        if (S.quality && fpsE < 27) { fpsLow += dt; if (fpsLow > 4) { S.quality = 0; saveS(); applyQuality(); G.emit("toast", "⚙️ Low graphics mode enabled automatically"); } }
        else fpsLow = 0;
      } catch (e) { }
    }
  }

  // ---------------- per-frame 3D hook (wraps TW.render) ----------------
  let wrapped = false;
  function wrapRender() {
    if (wrapped || !G.TW || !G.TW.ready || !G.TW.render) return;
    const orig = G.TW.render.bind(G.TW);
    const m4 = G.TW._m4, q4 = G.TW._q, s3 = G.TW._s, p3 = G.TW._p;
    G.TW.render = function (dt) {
      const out = orig(dt);
      try {
        ensureSky3D();
        const T = G.TW, env = G.ENV;
        const day = env.sun().day;
        const night = Math.max(0, 1 - day * 3);
        if (T.stars) T.stars.material.opacity = Math.min(0.9, night);
        if (T.moon) {
          T.moon.material.opacity = night;
          const az = (env.t / 86400) * Math.PI * 2 - Math.PI / 2;
          T.moon.position.set(G.PL.x + Math.cos(az) * 9000, 5200, G.PL.y + Math.sin(az) * 9000);
          T.moon.lookAt(G.TW.cam.position);
        }
        if (T.cityLights) { T.cityLights.material.opacity = Math.min(0.95, night * 1.15); T.cityLights.visible = night > 0.03; }
        if (T.gulls) {
          let gi = 0;
          const t = performance.now() / 1000;
          for (let i = 0; i < T._gullSeed.length; i++) {
            const g = T._gullSeed[i];
            const cx = G.PL.x + Math.cos(g[0]) * g[1], cz = G.PL.y + Math.sin(g[0]) * g[1];
            if (G.TERRAIN.elev(cx, cz) > 4) continue;
            const a = t * (0.5 + i * 0.03) + g[0];
            const x = cx + Math.cos(a) * 40, z = cz + Math.sin(a) * 40;
            p3.set(x, 26 + Math.sin(t + i) * 6, z); q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a); s3.set(1, 1, 1);
            m4.compose(p3, q4, s3); T.gulls.setMatrixAt(gi++, m4);
          }
          T.gulls.count = gi; T.gulls.instanceMatrix.needsUpdate = true;
          T.gulls.visible = day > 0.2;
        }
        RIDE.update(dt);
        effectsTick(dt);
      } catch (e) { /* never break the render loop */ }
      return out;
    };
    wrapped = true;
  }
  IV(wrapRender, 1500);
})();
