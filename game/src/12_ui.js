// HUD, menus, POI cards, teleport system (Part A/B), discovery, toasts
"use strict";
(function () {
  const G = window.G;
  const UI = G.UI = { hoverPoi: null, tpCharges: 3, tpMax: 3, tpRegen: 0, started: false, sound: false };

  const $ = id => document.getElementById(id);

  // ---------- toasts ----------
  G.on("toast", s => {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = s;
    $("toasts").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .5s"; }, 2600);
    setTimeout(() => t.remove(), 3200);
    while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
  });

  // ---------- teleport (fairness per Part B) ----------
  const TP = UI.tp = {
    can() { return UI.tpCharges >= 1; },
    use(x, y, label) {
      if (!this.can()) { G.emit("toast", "✨ No teleport charges — one refills every 75 s."); return false; }
      const tide = G.ENV.tide();
      const w = G.TERRAIN.waterAt(x, y, tide);
      const veh = G.VEHTYPES[G.PL.mode];
      if (w && G.TERRAIN.depth(x, y, tide) > 0.5 && !(veh && veh.water) && G.PL.mode !== "heli") {
        // fair-drop: find the nearest shore
        const p = G.POI.nearest(x, y, 6000);
        if (p) { x = p.x; y = p.y; label = p.name + " (shore)"; }
      }
      G.PL.x = x; G.PL.y = y; G.PL.v = 0;
      if (G.VEHTYPES[G.PL.mode] && G.VEHTYPES[G.PL.mode].air) { G.PL.alt = 0; G.PL.grounded = true; }
      G.CAM.follow = true; G.CAM.jumpTo(x, y);
      UI.tpCharges--;
      G.emit("toast", "✨ Teleported to " + (label || "the marked spot"));
      G.emit("tpused");
      return true;
    },
    update(dt) {
      if (UI.tpCharges < UI.tpMax) {
        UI.tpRegen += dt;
        if (UI.tpRegen >= 75) { UI.tpRegen = 0; UI.tpCharges++; G.emit("toast", "✨ Teleport charge restored"); }
      }
      const el = $("tpCharges");
      el.textContent = "✨ Teleports: " + "◆".repeat(UI.tpCharges) + "◇".repeat(UI.tpMax - UI.tpCharges);
    }
  };

  // ---------- discovery ----------
  const DISC = UI.disc = {
    set: new Set(G.store.get("visited", [])),
    check() {
      const p = G.POI.nearest(G.PL.x, G.PL.y, 260);
      if (p && !this.set.has(p.name)) {
        this.set.add(p.name);
        p.visited = true;
        G.store.set("visited", [...this.set]);
        G.emit("toast", "📍 Discovered: " + p.name + " — " + (G.RMAP[p.region] ? G.RMAP[p.region].label : p.region));
        G.emit("discovered");
      }
    },
    count() { return this.set.size; },
    markAll() { for (const p of G.POI.all) if (this.set.has(p.name)) p.visited = true; }
  };

  // ---------- HUD refresh ----------
  UI.refreshHud = () => {
    const env = G.ENV;
    const p = G.POI.nearest(G.PL.x, G.PL.y, 1400);
    const k = G.TERRAIN.kindAt(G.PL.x, G.PL.y, env.tide());
    let name = p ? p.name : (k.name || "Open country");
    let sub = p ? (G.RMAP[p.region] ? G.RMAP[p.region].label : p.region) + " · " + (G.CATMETA[p.cat] || {}).label : "";
    if (!p && k.water) sub = "Arabian Sea / harbour waters";
    $("locName").textContent = name;
    $("locSub").textContent = sub;
    const d = env.date();
    const hh = String(d.h).padStart(2, "0"), mm = String(d.mi).padStart(2, "0");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const wdesc = env.rain > 0.5 ? "🌧 heavy rain" : env.rain > 0.1 ? "🌦 showers" : env.season() === "monsoon" ? "☁️ humid" : env.season() === "summer" ? "☀️ hot" : "🌤 clear";
    $("envBox").innerHTML = `${days[d.dow]} ${d.d}/${d.mo} · <b>${hh}:${mm}</b> · ${env.season()} · ${env.tempC()}°C · ${wdesc} · tide ${env.tide().toFixed(1)} m`;
    const veh = G.VEHTYPES[G.PL.mode];
    $("spdVal").textContent = veh.air ? Math.round(G.PL.v * 3.6) + " · alt " + Math.round(G.PL.alt) + "m" : G.fmt.kmh(Math.abs(G.PL.v));
    $("spdLbl").textContent = veh.n;
    $("discoverBox").textContent = "📍 " + DISC.count() + " / 780 discovered";
    if (G.ECON) G.ECON.hud();
    const crowd = G.NPC.crowdLine(G.PL.x, G.PL.y);
    $("locSub").textContent = sub + (crowd ? " — " + crowd : "");
  };

  // ---------- vehicle menu ----------
  const VEH_ORDER = ["foot", "car", "taxi", "auto", "bike", "truck", "boat", "speed", "plane", "heli"];
  UI.openVeh = () => {
    const g = $("vehGrid"); g.innerHTML = "";
    for (const id of VEH_ORDER) {
      const t = G.VEHTYPES[id];
      const b = document.createElement("button");
      b.className = "abtn";
      b.innerHTML = t.icon + " " + t.n;
      b.onclick = () => { G.spawnVehicle(id); closeModals(); };
      g.appendChild(b);
    }
    openModal("vehModal");
  };

  // ---------- jobs board ----------
  UI.openJobs = () => {
    const E = G.ECON;
    E.refresh();
    let html = `<h2>Work board — Mumbai doesn't sleep</h2>
      <p>Wallet: <b style="color:#ffd97f">₹${E.money}</b> · deliveries done: ${E.deliveries}</p>`;
    if (E.active) {
      const o = E.active;
      const d = Math.round(G.dist(G.PL.x, G.PL.y, o.dest.x, o.dest.y));
      html += `<div class="panel" style="padding:10px;margin:8px 0">📋 <b>${o.tr.label}</b><br>
        <small>to ${o.dest.name} · ${G.fmt.m(o.dist)} · ₹${o.pay}</small><br>
        <small>${d < 250 ? "✅ You're here — delivering…" : "still " + G.fmt.m(d) + " away — follow the 📍 marker"}</small></div>`;
    } else {
      html += E.offers.map(o => `<div class="panel" style="padding:10px;margin:8px 0">
        <b>${o.tr.label}</b> <small>· ${G.fmt.m(o.dist)}</small><br>
        <small>${o.origin.name} → ${o.dest.name}</small><br>
        <button class="abtn" data-acc="${o.id}">Accept (₹${o.pay})</button>
        <button class="abtn warn" data-dec="${o.id}">Pass</button></div>`).join("");
      if (!E.offers.length) html += "<p>No work offers right now — wander a bit.</p>";
    }
    $("jobsGrid").innerHTML = html;
    document.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => { G.ECON.accept(b.dataset.acc); closeModals(); });
    document.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => { G.ECON.decline(b.dataset.dec); UI.openJobs(); });
    openModal("jobsModal");
  };

  // ---------- modals ----------
  function openModal(id) { $(id).style.display = "flex"; }
  function closeModals() { document.querySelectorAll(".modal").forEach(m => m.style.display = "none"); }
  document.querySelectorAll("[data-close]").forEach(b => b.onclick = closeModals);
  document.querySelectorAll(".modal").forEach(m => m.addEventListener("pointerdown", e => { if (e.target === m) closeModals(); }));
  UI.openModal = openModal; UI.closeModals = closeModals;

  // ---------- full map wiring ----------
  G.on("fmsel", p => {
    const c = $("fmCard");
    if (!p) { c.style.display = "none"; return; }
    const meta = G.CATMETA[p.cat] || G.CATMETA.locality;
    const reg = G.RMAP[p.region];
    let flavor = "";
    if (p.pos) flavor += `<div>🗺️ ${p.pos}</div>`;
    if (p.moment) flavor += `<div style="margin-top:4px">🌬️ “A typical atmospheric moment: ${p.moment}.”</div>`;
    if (p.figure) flavor += `<div style="margin-top:4px">🚶 You might meet ${p.figure}.</div>`;
    if (p.sounds) flavor += `<div style="margin-top:4px">👂 ${p.sounds} · 👃 ${p.smells || "—"}</div>`;
    if (p.drama) flavor += `<div style="margin-top:4px">🌊 Signature drama: ${p.drama}.</div>`;
    if (p.wildlife) flavor += `<div style="margin-top:4px">🦚 Wildlife: ${p.wildlife}.</div>`;
    c.innerHTML = `<h3>${p.name} ${p.visited ? "✓" : ""}</h3>
      <div class="meta">${meta.label} · ${reg ? reg.label : p.region} · ${p.lat.toFixed(4)}°N ${p.lon.toFixed(4)}°E · ${p.elev} m</div>
      <div class="flavor">${flavor}</div>
      <button class="abtn" id="cTp">✨ Teleport here (1 ◆)</button>
      <button class="abtn" id="cWay">📍 Set waypoint</button>
      <button class="abtn warn" id="cGo">🎬 View on ground</button>`;
    c.style.display = "block";
    $("cTp").onclick = () => { if (UI.tp.use(p.x, p.y, p.name)) { G.MAPS.fullmap.hide(); closeModals(); } };
    $("cWay").onclick = () => { G.WAYPOINT.set(p.x, p.y, p.name); G.emit("toast", "📍 Waypoint: " + p.name); };
    $("cGo").onclick = () => { G.MAPS.fullmap.hide(); G.CAM.jumpTo(p.x, p.y, 2.5); G.CAM.follow = false; closeModals(); };
  });

  // side panel
  UI.buildSide = () => {
    const side = $("fmSide");
    const counts = {};
    for (const p of G.POI.all) counts[p.region] = (counts[p.region] || 0) + 1;
    let html = "<h4>Layers</h4>";
    for (const [id, label] of G.MAPS.LAYER_DEFS) {
      html += `<label class="layerRow"><input type="checkbox" data-layer="${id}" ${G.MAPS.fm.layers[id] ? "checked" : ""}> ${label}</label>`;
    }
    html += "<h4>Regions</h4>";
    for (const r of G.REGIONS) {
      const vis = G.POI.all.filter(p => p.region === r.id && p.visited).length;
      html += `<div class="regionRow" data-region="${r.id}"><span style="color:${r.col}">●</span> ${r.label} <small>(${vis}/${counts[r.id]})</small></div>`;
    }
    html += `<h4>Legend</h4><div style="line-height:1.7">`;
    for (const k in G.CATMETA) html += `<span style="color:${G.CATMETA[k].col}">●</span> ${G.CATMETA[k].label}<br>`;
    html += `</div><h4>About</h4><p style="opacity:.7">Open-world build honouring the Mumbai–Navi Mumbai island-game prompt. Teleports cost ◆ (fair-play charges, Part B). Tap any dot for its dossier.</p>
      <button class="abtn" id="btnAbout">ℹ️ About / credits</button>`;
    side.innerHTML = html;
    side.querySelectorAll("[data-layer]").forEach(cb => cb.onchange = () => {
      G.MAPS.fm.layers[cb.dataset.layer] = cb.checked;
      G.MAPS.fullmap.draw();
    });
    side.querySelectorAll("[data-region]").forEach(row => row.onclick = () => {
      const r = G.RMAP[row.dataset.region];
      G.MAPS.fm.x = G.PROJ.lonToX(r.lo !== undefined ? r.lo : 72.95);
      G.MAPS.fm.y = G.PROJ.latToY(r.la !== undefined ? r.la : 19.10);
      G.MAPS.fullmap.draw();
    });
    $("btnAbout").onclick = () => openModal("aboutModal");
  };

  $("fmSearch").addEventListener("input", e => {
    const q = e.target.value.trim();
    const side = $("fmSide");
    if (!q) { UI.buildSide(); return; }
    const res = G.POI.search(q);
    side.innerHTML = "<h4>Results (" + res.length + ")</h4>" + res.map(p => {
      const meta = G.CATMETA[p.cat] || G.CATMETA.locality;
      return `<div class="sr" data-poi="${p.name}">${p.visited ? "✓" : "•"} ${p.name} <small>${meta.label}</small></div>`;
    }).join("");
    side.querySelectorAll("[data-poi]").forEach(el => el.onclick = () => {
      const p = G.POI.all.find(pp => pp.name === el.dataset.poi);
      if (p) { G.MAPS.fm.x = p.x; G.MAPS.fm.y = p.y; G.MAPS.fm.zoom = Math.max(G.MAPS.fm.zoom, 0.12); G.MAPS.fullmap.select(p); G.MAPS.fullmap.draw(); }
    });
  });
  $("fmClose").onclick = () => G.MAPS.fullmap.hide();

  // ---------- buttons ----------
  const hold = (id, prop) => {
    const el = $(id);
    el.addEventListener("pointerdown", e => { e.preventDefault(); G.IN.btn[prop] = true; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointerup", () => G.IN.btn[prop] = false);
    el.addEventListener("pointercancel", () => G.IN.btn[prop] = false);
  };
  hold("bThrUp", "thrUp"); hold("bThrDn", "thrDn");
  $("bEnter").onclick = () => {
    if (G.TRAFFIC.ridingBoat) { G.alightFerry(); return; }
    if (G.PL.mode === "train") { G.alightTrain(); return; }
    if (G.PL.mode === "foot") {
      if (!G.boardTrain() && !G.boardFerry())
        G.emit("toast", "Walk into a vehicle and press 🚗 to spawn one, or board a stopped train / ferry.");
    } else G.exitVehicle();
  };
  $("bVeh").onclick = () => UI.openVeh();
  $("bMap").onclick = () => G.MAPS.fullmap.show();
  $("bTp").onclick = () => { G.MAPS.fullmap.show(); G.emit("toast", "Pick a dot, then “Teleport here”."); };
  $("bJobs").onclick = () => UI.openJobs();
  $("bHelp").onclick = () => openModal("helpModal");
  $("bSound").onclick = () => { UI.sound = !UI.sound; $("bSound").textContent = UI.sound ? "🔊" : "🔇"; G.emit("sound", UI.sound); };

  // ---------- joystick ----------
  const jb = $("joyBase"), jk = $("joyKnob");
  let joyId = null, cx = 0, cy = 0;
  jb.addEventListener("pointerdown", e => {
    e.preventDefault(); joyId = e.pointerId; jb.setPointerCapture(e.pointerId);
    const r = jb.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    G.IN.joy.active = true; moveKnob(e.clientX, e.clientY);
  });
  jb.addEventListener("pointermove", e => { if (e.pointerId === joyId) moveKnob(e.clientX, e.clientY); });
  const jend = e => { if (e.pointerId === joyId) { joyId = null; G.IN.joy.active = false; G.IN.joy.x = G.IN.joy.y = 0; jk.style.transform = ""; } };
  jb.addEventListener("pointerup", jend); jb.addEventListener("pointercancel", jend);
  function moveKnob(x, y) {
    let dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy), max = 44;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    jk.style.transform = `translate(${dx}px,${dy}px)`;
    G.IN.joy.x = dx / max; G.IN.joy.y = dy / max;
  }

  // ---------- keyboard actions ----------
  G.on("key", code => {
    if (!UI.started) return;
    switch (code) {
      case "KeyM": G.MAPS.fullmap.open ? G.MAPS.fullmap.hide() : G.MAPS.fullmap.show(); break;
      case "KeyV": UI.openVeh(); break;
      case "KeyT": $("bTp").onclick(); break;
      case "KeyJ": UI.openJobs(); break;
      case "KeyE": $("bEnter").onclick(); break;
      case "KeyH": openModal("helpModal"); break;
      case "Escape": closeModals(); G.MAPS.fullmap.hide(); break;
      case "Space": G.PL.v = 0; break;
    }
  });

  // ---------- start ----------
  UI.start = () => {
    $("start").style.display = "none";
    UI.started = true;
    G.emit("sound", UI.sound);
    G.emit("toast", "Welcome to the Island Realm. Press ❓ for help.");
  };
  $("startBtn").onclick = () => UI.start();
})();
