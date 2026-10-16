// Headless smoke test: stub browser env, boot the game, simulate play.
"use strict";
const fs = require("fs"), vm = require("vm");

function makeCtx2d() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === "createRadialGradient" || k === "createLinearGradient") return () => grad;
      if (k === "measureText") return () => ({ width: 10 });
      if (typeof k === "string") return function () {};
      return undefined;
    },
    set() { return true; }
  });
}
function makeEl(id) {
  const el = {
    id, style: {}, children: [], dataset: {}, checked: true, value: "",
    width: 300, height: 300,
    classList: { add() {}, remove() {} },
    appendChild(c) { c._parent = el; this.children.push(c); return c; },
    remove() { const p = el._parent; if (p) { const i = p.children.indexOf(el); if (i >= 0) p.children.splice(i, 1); } },setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    getContext: () => makeCtx2d(),
    parentElement: { clientWidth: 800, clientHeight: 600, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    get firstChild() { return el.children[0]; },
    focus() {},
  };
  return el;
}
const els = {};
const windowObj = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() {}, requestAnimationFrame: fn => { if (typeof fn !== "function") throw new TypeError("rAF non-function: " + typeof fn); setTimeout(() => fn(performance.now()), 1); },
  performance, setTimeout, clearTimeout,
};
const documentObj = {
  readyState: "complete",
  getElementById(id) { return els[id] || (els[id] = makeEl(id)); },
  createElement: tag => makeEl(tag),
  querySelectorAll: () => [],
  addEventListener() {},
};
const storage = {};
const sandbox = {
  window: windowObj, document: documentObj, console, performance, setTimeout, clearTimeout,
  Math, JSON, Infinity, NaN, isFinite, parseInt, parseFloat,
  localStorage: { getItem: k => storage[k] ?? null, setItem: (k, v) => storage[k] = String(v), removeItem: k => delete storage[k] },
  requestAnimationFrame: windowObj.requestAnimationFrame,
  Path2D: class { moveTo() {} lineTo() {} closePath() {} arc() {} },
  AudioContext: undefined, webkitAudioContext: undefined,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const html = fs.readFileSync("www/index.html", "utf8");
const m = html.match(/<script>\s*\/\* ===== 00_boot[\s\S]*?<\/script>/);
if (!m) { console.error("no script found"); process.exit(1); }
const code = m[0].replace(/^<script>/, "").replace(/<\/script>$/, "");
try {
  vm.runInContext(code, sandbox, { filename: "bundle.js" });
} catch (e) {
  console.error("BOOT FAIL:", e.stack);
  process.exit(1);
}

const G = windowObj.G;
const t = (name, fn) => {
  try { fn(); console.log("PASS", name); }
  catch (e) { console.error("FAIL", name, e.message); process.exitCode = 1; }
};

t("G namespace exists", () => { if (!G) throw new Error("no G"); });
t("780 POIs", () => { if (G.POI.all.length !== 780) throw new Error("got " + G.POI.all.length); });
t("land polygons", () => { if (G.W.land.length !== 2) throw new Error("land " + G.W.land.length); });

// run simulated frames
function frames(n, dtms) {
  for (let i = 0; i < n; i++) {
    try { /* loop runs via rAF->setTimeout chain; tick manually instead */ } catch (e) {}
  }
}
t("simulation ticks", () => {
  // directly drive modules
  for (let i = 0; i < 600; i++) {
    G.ENV.update(0.016);
    G.updatePlayer(0.016);
    G.TRAFFIC.update(0.016, G.CAM);
    G.NPC.update(0.016, G.CAM);
    G.CAM.update(G.PL.x, G.PL.y, 0.016);
    G.UI.tp.update(0.016);
    G.R.draw(0.016);
    if (i % 100 === 0) G.MAPS.minimap.draw();
    if (i % 100 === 0) console.error("  tick", i);
  }
});
t("player moved or stayed sane", () => {
  if (!isFinite(G.PL.x) || !isFinite(G.PL.y)) throw new Error("player NaN");
});
t("every vehicle spawns & drives", () => {
  const types = ["car", "taxi", "auto", "bike", "truck", "boat", "speed", "plane", "heli"];
  for (const v of types) {
    G.spawnVehicle(v);
    if (G.PL.mode !== v) throw new Error("spawn failed: " + v);
    for (let i = 0; i < 200; i++) { G.IN.keys.KeyW = true; G.updatePlayer(0.05); }
    if (!isFinite(G.PL.x)) throw new Error(v + " NaN");
    G.IN.keys.KeyW = false;
  }
});
t("teleport works & charges deplete", () => {
  const before = G.UI.tpCharges || 3;
  const ok = G.UI.tp.use(G.PROJ.lonToX(72.95), G.PROJ.latToY(18.88), "Uran");
  if (!ok) throw new Error("teleport refused");
  if (G.UI.tpCharges >= before) throw new Error("charge not consumed");
});
t("train boarding API", () => {
  G.spawnVehicle("foot");
  G.TRAFFIC.trains.length || G.TRAIN.trains.length; // populated by update
  G.boardTrain(); // may return false if not near — must not throw
  G.alightTrain();
});
t("water/terrain consistency", () => {
  const sea = G.TERRAIN.kindAt(G.PROJ.lonToX(72.70), G.PROJ.latToY(18.90), 2);
  if (!sea.water) throw new Error("open sea should be water");
  const land = G.TERRAIN.kindAt(G.PROJ.lonToX(72.836), G.PROJ.latToY(18.98), 2);
  if (land.water) throw new Error("Mumbai Central should be land");
  const creek = G.TERRAIN.kindAt(G.PROJ.lonToX(72.99), G.PROJ.latToY(19.10), 2);
  if (!creek.water) throw new Error("Thane creek should be water");
});
t("poi search", () => {
  const r = G.POI.search("ransai");
  if (!r.length) throw new Error("no Ransai");
  const j = G.POI.search("JNPT");
  if (j.length < 3) throw new Error("JNPT entries missing");
});
t("discovery persists", () => {
  G.UI.disc.check();
  if (typeof G.UI.disc.count() !== "number") throw new Error("count");
});
t("spec flavor present on cards", () => {
  const p = G.POI.all.find(p => p.name === "Marine Drive");
  if (!p.moment || !p.figure) throw new Error("flavor missing");
});
t("economy: offers, accept, deliver, earn", () => {
  const E = G.ECON;
  E.refresh();
  if (E.offers.length < 1) throw new Error("no job offers generated");
  const o = E.offers[0];
  const m0 = E.money;
  E.accept(o.id);
  if (!E.active) throw new Error("accept failed");
  G.PL.x = o.dest.x; G.PL.y = o.dest.y;
  E.update(0.016);
  if (E.active) throw new Error("delivery did not complete");
  if (E.money !== m0 + o.pay) throw new Error("pay not credited");
});
t("ferry boarding ride & alight", () => {
  const TF = G.TRAFFIC;
  TF.boats.length = 0;
  // manufacture a ferry at the player's position on water
  const sea = [G.PROJ.lonToX(72.75), G.PROJ.latToY(18.85)];
  TF.boats.push({ route: [[0, 0]], d: 0, dir: 1, v: 5, vmax: 8, x: sea[0], y: sea[1], hd: 0, fisher: false, wake: 0 });
  G.spawnVehicle("foot");
  G.PL.x = sea[0]; G.PL.y = sea[1];
  if (!G.boardFerry()) throw new Error("ferry boarding refused");
  if (!G.TRAFFIC.ridingBoat) throw new Error("not riding");
  G.updatePlayer(0.016);
  if (!isFinite(G.PL.x)) throw new Error("NaN while riding");
  G.alightFerry();
  if (G.TRAFFIC.ridingBoat) throw new Error("still riding after alight");
});
t("npc chatter pool exists", () => {
  // draw with chatter active must not throw
  G.R.draw(0.016);
});
console.log("\nSmoke test complete.");
process.exit(process.exitCode || 0);
