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
    auto: 40000, bike: 30000, taxi: 60000, car: 80000, truck: 120000,
    boat: 90000, speed: 150000, plane: 800000, heli: 1200000
  };
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
  M.accept = (i) => { if (!M.act && M.offers[i]) { M.act = M.offers[i]; G.emit("toast", "📋 Accepted — " + M.act.name); } };
  M.complete = () => {
    const E = G.ECON; E.money += M.act.pay; G.store.set("money", E.money);
    M.done++; G.store.set("missionsDone", M.done);
    G.emit("toast", "✅ " + M.act.name + " — earned ₹" + M.act.pay + " (total ₹" + E.money + ")");
    M.act = null; ach("worker", "Working for the city", "Complete 5 missions", 5, M.done);
  };
  M.abandon = () => { if (M.act) { G.emit("toast", "📋 Mission abandoned"); M.act = null; } };
  M.update = (dt) => {
    const P = G.PL;
    if (M.act) {
      const d2 = (p) => (P.x - p.x) * (P.x - p.x) + (P.y - p.y) * (P.y - p.y);
      if (M.act.kind === "tour") {
        const t = M.act.stops[M.act.prog];
        if (t && d2(t) < 120 * 120) { M.act.prog++; G.emit("toast", "📍 Stop " + M.act.prog + "/3 done"); if (M.act.prog >= 3) M.complete(); }
      } else if (M.act.kind === "photo") {
        if (d2(M.act.to) < 150 * 150) { M._photoReady = M.act.to; G.emit("toast", "📷 Open 📖 → Take a postcard here to finish the job"); }
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
    if (T && !T.rail && P.mode !== "foot") {
      if (OWN.fuel > 0) OWN.fuel = Math.max(0, OWN.fuel - dt * (0.00022 + 0.00002 * T.vmax) * Math.min(1, (P.v || 0) / 6));
      if (OWN.fuel <= 0 && (P.v || 0) > 2) { P.v *= (1 - Math.min(0.9, dt * 1.6)); if (Math.random() < dt * 0.2) G.emit("toast", "⛽ Out of fuel! Open 🚗 Garage → Refuel"); }
    }
    // speeding challans inside named districts
    if (!HEADLESS) {
      const lim = 26;
      if (!T || T.road || false) { }
      if ((P.v || 0) > lim * 1.45) {
        M._sp = (M._sp || 0) + dt;
        if (M._sp > 6) {
          M._sp = 0;
          if (G.ECON.money >= 200) { G.ECON.money -= 200; G.store.set("money", G.ECON.money); G.emit("toast", "🚨 Traffic challan: ₹200 (speeding in city limits)"); }
          else G.emit("toast", "🚨 Slow down! (no money for the challan — they took your photo)");
        }
      } else M._sp = 0;
    }
  };
  IV(() => { if (!HEADLESS) M.update(0.5); }, 500);

  // ---------------- P3: achievements ----------------
  const ACH = G.ACH = { got: G.store.get("ach", {}) };
  function ach(id, name, desc, need, have) {
    if (!ACH.got[id] && have >= need) {
      ACH.got[id] = true; G.store.set("ach", ACH.got);
      G.emit("toast", "🏆 Achievement: " + name);
    }
  }
  ACH.update = () => {
    const disc = (G.store.get("disc", []) || []).length;
    const ph = (G.store.get("photos", []) || []).length;
    ach("explorer", "City Explorer", "Discover 25 places", 25, disc);
    ach("chronicler", "Chronicler of Mumbai", "Own 5 postcards", 5, ph);
    ach("rich", "Crorepati-in-training", "Hold ₹1,00,000", 100000, G.ECON.money);
    const dists = Object.keys(G.store.get("districts", {})).length;
    ach("boroughs", "Knows the Boroughs", "Visit 8 districts", 8, dists);
  };
  IV(() => { if (!HEADLESS) ACH.update(); }, 4000);

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
  function nearestMetroStop() {
    let best = null, bd = 1e18;
    for (const r of metroLines()) for (const st of r.st) {
      const d = (G.PL.x - st.x) * (G.PL.x - st.x) + (G.PL.y - st.y) * (G.PL.y - st.y);
      if (d < bd) { bd = d; best = { st, r, d }; }
    }
    return bd < 400 * 400 ? best : null;
  }
  RIDE.metro = () => {
    const near = nearestMetroStop();
    if (!near) { G.emit("toast", "🚇 No metro station within 400 m"); return; }
    const r = near.r, pts = r.pts;
    // find nearest point index on the line, then ride forward ~1400 m along it
    let bi = 0, bd = 1e18;
    for (let i = 0; i < pts.length; i++) { const d = (G.PL.x - pts[i][0]) ** 2 + (G.PL.y - pts[i][1]) ** 2; if (d < bd) { bd = d; bi = i; } }
    let dist = 0, ei = bi;
    while (ei < pts.length - 1 && dist < 1400) { dist += Math.hypot(pts[ei + 1][0] - pts[ei][0], pts[ei + 1][1] - pts[ei][1]); ei++; }
    RIDE.on = { kind: "metro", pts, i: bi, end: ei, t: 0, name: r.name || "Metro" };
    G.emit("toast", "🚇 " + RIDE.on.name + " — riding " + Math.round(dist) + " m. Tap ✋ to alight.");
  };
  const FLIGHT_WPS = [[-3620, -9180], [-9500, -13200], [-12300, -17000], [-13100, -1300], [-9835, -5971], [-5900, 1200]];
  RIDE.flight = () => {
    RIDE.on = { kind: "flight", wps: FLIGHT_WPS, i: 0, alt: 260, name: "Coastal flight" };
    G.emit("toast", "✈️ Scenic coastal flight — CSMIA → Marine Drive → Gateway → Juhu. Tap ✋ to skip.");
  };
  RIDE.alight = () => { if (RIDE.on) { RIDE.on = null; G.emit("toast", "🚏 You stepped off."); } };
  RIDE.update = (dt) => {
    if (!RIDE.on) return;
    const P = G.PL, sp = RIDE.on.kind === "flight" ? 46 : 15;
    if (RIDE.on.kind === "metro") {
      const pts = RIDE.on.pts;
      let seg = Math.hypot(pts[RIDE.on.i + 1][0] - pts[RIDE.on.i][0], pts[RIDE.on.i + 1][1] - pts[RIDE.on.i][1]) || 1;
      RIDE.on.t += sp * dt / seg; 
      while (RIDE.on.t >= 1 && RIDE.on.i < RIDE.on.end) { RIDE.on.t -= 1; RIDE.on.i++; seg = Math.hypot(pts[RIDE.on.i + 1][0] - pts[RIDE.on.i][0], pts[RIDE.on.i + 1][1] - pts[RIDE.on.i][1]) || 1; RIDE.on.t += 0; }
      const i = Math.min(RIDE.on.i, pts.length - 2);
      P.x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * RIDE.on.t;
      P.y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * RIDE.on.t;
      P.heading = Math.atan2(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (RIDE.on.i >= RIDE.on.end) { RIDE.alight(); G.emit("toast", "🚇 Arrived — platform please mind the gap"); }
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
            <button class="fbtn" id="mFlight" style="width:100%">✈️ Scenic coastal flight (from CSMIA)</button>
            <button class="fbtn" id="mClose" style="width:100%">Close</button>`;
      P(h);
      document.querySelectorAll("[data-mi]").forEach(b => b.onclick = () => { M.accept(+b.dataset.mi); closeP(); });
      const ab = q("mAb"); if (ab) ab.onclick = () => { M.abandon(); closeP(); };
      const mm = q("mMetro"); if (mm) mm.onclick = () => { RIDE.metro(); closeP(); };
      q("mFlight").onclick = () => { RIDE.flight(); closeP(); };
      q("mClose").onclick = closeP;
      const hand = q("bHand"); hand.style.display = RIDE.on ? "block" : "none";
    }

    function garageUI() {
      let h = `<h3>🚗 Garage & Fuel</h3><div class="mrow"><b>${money()}</b><div style="flex:1"></div><div>⛽ ${Math.round(OWN.fuel * 100)}%</div></div>`;
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
      q("refuel").onclick = () => {
        const cost = Math.ceil((1 - OWN.fuel) * 100) * 2;
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
        ["explorer|City Explorer|discover 25 places", "chronicler|Chronicler|own 5 postcards", "worker|Working for the city|5 missions", "rich|Crorepati-in-training|₹1,00,000", "boroughs|Knows the Boroughs|8 districts"]
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
      <div class="mrow"><h4 style="margin:0">Save slot</h4>${["A", "B", "C"].map(s => `<button class="fbtn" data-slot="${s}" style="width:40px;${S.slot === s ? "border-color:#8fd" : ""}">${s}</button>`).join("")}</div>
      <div class="mrow"><button class="fbtn" id="sReset" style="width:100%;color:#f88">Erase this slot's progress</button></div>
      <button class="fbtn" id="sClose" style="width:100%">Close</button>`;
      P(h);
      q("sQ").onchange = e => { S.quality = e.target.checked ? 1 : 0; saveS(); applyQuality(); };
      q("sS").onchange = e => { S.sound = e.target.checked ? 1 : 0; saveS(); applySound(); };
      q("sL").onchange = e => { S.labels = e.target.checked ? 1 : 0; saveS(); applyLabels(); };
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
      } catch (e) { /* never break the render loop */ }
      return out;
    };
    wrapped = true;
  }
  IV(wrapRender, 1500);
})();
