// Headless FUNCTIONAL test for the phases 1–5 systems (17_features.js).
// Reuses smoke_test.js's stub environment, then drives the new systems.
"use strict";
const fs = require("fs"), vm = require("vm");

const pre = fs.readFileSync("tools/smoke_test.js", "utf8");
const cut = pre.indexOf("vm.createContext(sandbox);");
if (cut < 0) { console.error("cannot find env prelude"); process.exit(1); }
const prelude = pre.slice(0, cut) + "vm.createContext(sandbox);\nmodule.exports = { sandbox, windowObj, documentObj, els };\n";
fs.writeFileSync("/tmp/_env.js", prelude);
const { sandbox, windowObj } = require("/tmp/_env.js");

const html = fs.readFileSync("www/index.html", "utf8");
const m = html.match(/<script>\s*\/\* ===== 00_boot[\s\S]*?<\/script>/);
if (!m) { console.error("no script found"); process.exit(1); }
const code = m[0].replace(/^<script>/, "").replace(/<\/script>$/, "");
vm.runInContext(code, sandbox, { filename: "bundle.js" });

const G = () => windowObj.G;
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log("PASS " + name); } else { fail++; console.log("FAIL " + name); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await wait(700); // let boot + first frames run
  ok(!!G(), "booted, G exists");
  ok(!!G().MISSIONS && !!G().GARAGE && !!G().RIDE && !!G().SET, "phase-5 systems registered");

  // ---- missions: delivery completes and pays ----
  const E = G().ECON, M = G().MISSIONS;
  M.refresh();
  ok(M.offers.length > 0, "mission board generates offers (" + M.offers.length + ")");
  const pois = G().POI.all;
  const a = pois[5], b = pois[60] || pois[pois.length - 1];
  const money0 = E.money;
  M.act = { kind: "delivery", name: "test", pay: 500, from: a, to: b, stage: 0 };
  G().PL.x = a.x; G().PL.y = a.y; M.update(0.5);
  ok(M.act && M.act.stage === 1, "delivery pickup stage advances");
  G().PL.x = b.x; G().PL.y = b.y; M.update(0.5);
  ok(M.act === null, "delivery completes");
  ok(E.money === money0 + 500, "mission pays ₹500 (got ₹" + (E.money - money0) + ")");

  // ---- tours ----
  M.act = { kind: "tour", name: "tour", pay: 900, stops: [pois[2], pois[3], pois[4]], prog: 0 };
  for (const s of [pois[2], pois[3], pois[4]]) { G().PL.x = s.x; G().PL.y = s.y; M.update(0.5); }
  ok(M.act === null && E.money === money0 + 500 + 900, "tour completes after 3 stops");

  // ---- photo mission completes when a postcard is taken ----
  const ph0 = (G().store.get("photos", []) || []).length;
  M.act = { kind: "photo", name: "photo", pay: 300, to: b };
  G().PL.x = b.x; G().PL.y = b.y; M.update(0.5);
  const arr = G().store.get("photos", []); arr.push({ d: Date.now(), s: "x", at: "t" }); G().store.set("photos", arr);
  M.update(0.5);
  ok(M.act === null, "photo mission completes after a postcard");

  // ---- metro ride ----
  const R = G().RIDE, P = G().PL;
  const metro = (G().W.rails || []).find(r => r.kind === "metro" && r.st && r.st.length && r.pts);
  ok(!!metro, "a rideable metro line exists");
  P.x = metro.st[0].x; P.y = metro.st[0].y; P.mode = "foot";
  R.metro();
  ok(!!R.on, "metro boards near a station");
  const sx = P.x, sy = P.y;
  for (let i = 0; i < 20; i++) R.update(0.25);
  ok(Math.hypot(P.x - sx, P.y - sy) > 10, "metro actually moves the player (" + Math.round(Math.hypot(P.x - sx, P.y - sy)) + " m)");
  const modeBefore = P._rideMode || "foot";
  R.alight();
  ok(!R.on && P.mode === modeBefore && P.alt === 0, "alight restores mode + grounds player");

  // ---- local train (any rail line) ----
  const rail = (G().W.rails || []).find(r => r.kind !== "metro" && r.st && r.st.length && r.pts);
  ok(!!rail, "a rideable local line exists");
  P.x = rail.st[0].x; P.y = rail.st[0].y;
  R.train();
  ok(!!R.on, "local boards near a station");
  R.alight();

  // ---- ferry ----
  const gw = pois.find(p => /gateway/i.test(p.name)) || pois[0];
  P.x = gw.x; P.y = gw.y;
  R.ferry();
  ok(!!R.on, "ferry boards at the Gateway");
  for (let i = 0; i < 8; i++) R.update(0.25);
  R.alight();

  // ---- flight ----
  R.flight();
  ok(R.on && P.mode === "heli", "flight boards as hover mode");
  for (let i = 0; i < 10; i++) R.update(0.25);
  ok(P.alt > 50, "flight climbs (alt " + Math.round(P.alt) + " m)");
  R.alight();
  ok(P.alt === 0 && P.mode === "foot", "flight alight grounds the player");

  // ---- achievements run ----
  G().ACH.update();
  ok(true, "achievement pass runs");

  // ---- ownership store round-trip ----
  const OWN = G().GARAGE;
  ok(OWN.owned.includes("foot"), "ownership defaults include foot");

  console.log("\nFeature test: " + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("TEST CRASH:", e); process.exit(1); });
