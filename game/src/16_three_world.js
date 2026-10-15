// 3D WORLD LAYER (Three.js): elevation terrain, tidal water, REAL OSM street
// ribbons, street-block building infill, LANDMARK LIBRARY (survey dimensions),
// 3D traffic/trains/ferries/crowd, walk/chase/fly/orbit cameras.
// Streets: (c) OpenStreetMap contributors, ODbL. Landmarks: hand-modeled from
// public survey dimensions (heights/spans), stylised materials.
"use strict";
(function () {
  const G = window.G;
  if (typeof THREE === "undefined") { console.warn("THREE missing — 3D layer disabled"); return; }
  const TW = G.TW = { active: false, inited: false, ready: false };

  const CAMS = { WALK: 0, CHASE: 1, FLY: 2, ORBIT: 3 };
  TW.camMode = CAMS.CHASE;
  TW.orbit = { yaw: Math.PI * 0.8, pitch: 0.42, dist: 90 };

  function elevAt(x, y) { return G.TERRAIN.elev(x, y); }

  // ---------------- mesh helpers ----------------
  const MAT = {};
  function mats() {
    MAT.basalt = new THREE.MeshLambertMaterial({ color: 0x8a6a4e });
    MAT.basaltD = new THREE.MeshLambertMaterial({ color: 0x6f543c });
    MAT.plaster = new THREE.MeshLambertMaterial({ color: 0xd8cdb8 });
    MAT.white = new THREE.MeshLambertMaterial({ color: 0xf2efe6 });
    MAT.redTile = new THREE.MeshLambertMaterial({ color: 0xa85242 });
    MAT.stone = new THREE.MeshLambertMaterial({ color: 0x9a8a72 });
    MAT.green = new THREE.MeshLambertMaterial({ color: 0x4a6a3a });
    MAT.dark = new THREE.MeshLambertMaterial({ color: 0x383430 });
    MAT.steel = new THREE.MeshLambertMaterial({ color: 0x8a94a0 });
    MAT.orange = new THREE.MeshLambertMaterial({ color: 0xc07030 });
    MAT.deck = new THREE.MeshLambertMaterial({ color: 0x707880 });
  }
  function B(mat, w, h, d, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (ry) m.rotation.y = ry;
    return m;
  }
  function C(mat, r0, r1, h, x, y, z, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1 == null ? r0 : r1, h, seg || 10), mat);
    m.position.set(x, y, z);
    return m;
  }
  function Dome(mat, r, x, y, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    m.position.set(x, y, z);
    return m;
  }
  function Cone(mat, r, h, x, y, z) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), mat);
    m.position.set(x, y, z);
    return m;
  }

  // ---------------- LANDMARK LIBRARY (survey dims in meters) ----------------
  const LM = {};
  LM.gateway = (g) => { // Gateway of India: 26 m tall, ~48 m face, 4 turrets
    const W = 48, H = 26;
    g.add(B(MAT.basalt, W * 0.22, H, 12, -W * 0.39, H / 2, 0));
    g.add(B(MAT.basalt, W * 0.22, H, 12, W * 0.39, H / 2, 0));
    g.add(B(MAT.basaltD, W, 8, 12, 0, H - 4, 0));
    const arch = new THREE.Mesh(new THREE.TorusGeometry(W * 0.24, 4, 8, 20, Math.PI), MAT.basaltD);
    arch.position.set(0, H - 14, 0); g.add(arch);
    g.add(B(MAT.basalt, 8, H - 14, 12, -W * 0.24, (H - 14) / 2, 0));
    g.add(B(MAT.basalt, 8, H - 14, 12, W * 0.24, (H - 14) / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(C(MAT.basalt, 2.6, 3, 32, sx * W * 0.5, 16, sz * 8));
      g.add(Dome(MAT.basaltD, 3, sx * W * 0.5, 33.5, sz * 8));
    }
  };
  LM.cst = (g) => { // CST: central dome ~40 m + gothic wings ~90 m wide
    g.add(B(MAT.stone, 90, 22, 24, 0, 11, 0));
    g.add(B(MAT.stone, 30, 30, 26, 0, 15, 0));
    g.add(C(MAT.stone, 9, 9, 6, 0, 33, 0));
    g.add(Dome(MAT.redTile, 9.4, 0, 36, 0));
    g.add(C(MAT.stone, 0.6, 0.6, 8, 0, 48, 0));
    for (const sx of [-1, 1]) {
      g.add(B(MAT.stone, 26, 20, 18, sx * 55, 10, 4, 0.16 * sx));
      g.add(Cone(MAT.stone, 2.4, 12, sx * 30, 28, 0));
      g.add(Cone(MAT.stone, 2.4, 12, sx * 66, 26, 6));
    }
  };
  LM.taj = (g) => { // Taj Mahal Palace: dome 32 m + harbour-front wings
    g.add(B(MAT.plaster, 44, 26, 26, 0, 13, 0));
    g.add(C(MAT.plaster, 8, 8, 4, 0, 28, 0));
    g.add(Dome(MAT.redTile, 8.6, 0, 30, 0));
    g.add(B(MAT.plaster, 40, 22, 18, 44, 11, 10, 0.3));
    for (const sx of [-14, 0, 14]) g.add(Dome(MAT.redTile, 2.2, sx, 28.5, 0));
  };
  LM.hajiali = (g) => { // white dome + minarets on a rising platform
    g.add(C(MAT.white, 14, 16, 5, 0, 2.5, 0, 8));
    g.add(B(MAT.white, 16, 8, 16, 0, 9, 0));
    g.add(Dome(MAT.white, 6.5, 0, 13, 0));
    for (const sx of [-9, 9]) g.add(C(MAT.white, 1.1, 1.1, 14, sx, 12, 9));
  };
  LM.mountmary = (g) => { // basilica: nave + tower + pointed spire
    g.add(B(MAT.plaster, 24, 12, 44, 0, 6, 0));
    g.add(B(MAT.plaster, 10, 26, 10, 0, 13, -14));
    g.add(Cone(MAT.redTile, 6, 14, 0, 33, -14));
  };
  LM.siddhivinayak = (g) => { // shikhara temple
    g.add(B(MAT.plaster, 16, 8, 16, 0, 4, 0));
    for (let i = 0; i < 5; i++) {
      const s = 6.5 - i * 1.15;
      g.add(B(MAT.orange, s, 2.6, s, 0, 9.4 + i * 2.5, 0));
    }
    g.add(Cone(MAT.orange, 1.2, 5, 0, 24, 0));
  };
  LM.rajabai = (g) => { // 79 m clock tower
    g.add(B(MAT.stone, 9, 40, 9, 0, 20, 0));
    g.add(B(MAT.stone, 11, 6, 11, 0, 43, 0));
    g.add(C(MAT.stone, 4.5, 4.5, 8, 0, 50, 0, 8));
    g.add(Cone(MAT.stone, 4.5, 20, 0, 64, 0));
  };
  LM.antilia = (g) => { // 173 m tower, distinctive stacked profile
    let y = 0;
    for (let i = 0; i < 9; i++) {
      const h = 17;
      g.add(B(MAT.glass || (MAT.glass = new THREE.MeshLambertMaterial({ color: 0xa8c8d8 })), 30 - (i % 3) * 4, h, 24, 0, y + h / 2, 0));
      y += h + 2.4;
    }
  };
  LM.fort = (g, big) => { // Bandra/Worli/Sewri forts: low basalt walls + turret
    const s = big ? 1.6 : 1;
    g.add(B(MAT.basaltD, 34 * s, 6 * s, 3, 0, 3 * s, -12 * s));
    g.add(B(MAT.basaltD, 34 * s, 6 * s, 3, 0, 3 * s, 12 * s));
    g.add(B(MAT.basaltD, 3, 6 * s, 24 * s, -17 * s, 3 * s, 0));
    g.add(B(MAT.basaltD, 3, 6 * s, 24 * s, 17 * s, 3 * s, 0));
    g.add(C(MAT.basaltD, 3 * s, 3.4 * s, 9 * s, -17 * s, 4.5 * s, -12 * s, 8));
  };
  LM.vasaifort = (g) => { // Bassein: 120×90 m walls, corner bastions, gate
    const W = 120, D = 90, h = 7;
    g.add(B(MAT.basaltD, W, h, 3, 0, h / 2, -D / 2));
    g.add(B(MAT.basaltD, W, h, 3, 0, h / 2, D / 2));
    g.add(B(MAT.basaltD, 3, h, D, -W / 2, h / 2, 0));
    g.add(B(MAT.basaltD, 3, h, D, W / 2, h / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      g.add(C(MAT.basaltD, 7, 8, h + 4, sx * W / 2, (h + 4) / 2, sz * D / 2, 9));
    g.add(B(MAT.basalt, 12, 9, 5, 0, 4.5, D / 2));
  };
  LM.elephanta = (g) => { // cave portico set into a wooded mound
    g.add(Dome(MAT.green, 34, 0, -2, 0));
    g.add(B(MAT.dark, 18, 9, 8, 0, 4.5, 26));
    g.add(B(MAT.basalt, 26, 2, 6, 0, 1, 30));
  };
  LM.karnala = (g) => { // Bhavani tower: basalt spike on the hill
    g.add(C(MAT.basalt, 3.2, 5, 38, 0, 19, 0, 7));
    g.add(Dome(MAT.basaltD, 3.4, 0, 39, 0));
  };
  LM.cranes = (g) => { // JNPT quay gantry cranes: 40 m rails, 55 m booms
    for (let i = 0; i < 3; i++) {
      const x0 = i * 34 - 34;
      g.add(C(MAT.steel, 1.2, 1.2, 40, x0 - 8, 20, -10, 6));
      g.add(C(MAT.steel, 1.2, 1.2, 40, x0 + 8, 20, -10, 6));
      g.add(C(MAT.steel, 1.2, 1.2, 40, x0 - 8, 20, 10, 6));
      g.add(C(MAT.steel, 1.2, 1.2, 40, x0 + 8, 20, 10, 6));
      g.add(B(MAT.steel, 18, 3, 4, x0, 41, -10));
      g.add(B(MAT.steel, 18, 3, 4, x0, 41, 10));
      g.add(B(MAT.orange, 66, 3.4, 5, x0 - 14, 43, 0));
      g.add(B(MAT.dark, 2, 8, 2, x0 - 34, 36, 0));
    }
    g.add(B(MAT.deck, 140, 1.4, 26, 0, 0.7, 0)); // quay slab
  };
  LM.dam = (g) => { // Ransai: ~10 m earthfill with gatehouse
    g.add(B(MAT.stone, 130, 10, 12, 0, 5, 0));
    g.add(B(MAT.plaster, 10, 6, 8, 55, 13, 0));
  };
  LM.wheel = (g) => { // EsselWorld giant wheel ~30 m
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(15, 1, 8, 24), MAT.steel);
    wheel.position.set(0, 17, 0); g.add(wheel);
    g.add(C(MAT.steel, 1.4, 1.4, 6, -6, 2, 0));
    g.add(C(MAT.steel, 1.4, 1.4, 6, 6, 2, 0));
    g.add(C(MAT.steel, 0.9, 0.9, 17, 0, 8.5, 0));
  };
  LM.pagoda = (g) => { // Global Vipassana Pagoda: ~96 m dome of basalt grey
    g.add(C(MAT.basalt, 42, 46, 6, 0, 3, 0, 18));
    g.add(Dome(MAT.basaltD, 34, 0, 5, 0));
    g.add(Cone(MAT.gold || (MAT.gold = new THREE.MeshLambertMaterial({ color: 0xc8a850 })), 2, 9, 0, 42, 0));
  };
  LM.sealink = (g) => { // BWSL pylons ~126 m (stylised pair + deck)
    g.add(B(MAT.deck, 900, 2.2, 16, 0, 11, 0));
    for (const sx of [-140, 140]) {
      g.add(C(MAT.white, 3.2, 5, 70, sx, 35, 0, 6));
      g.add(C(MAT.white, 0.5, 0.5, 34, sx, 68, -8, 4));
      g.add(C(MAT.white, 0.5, 0.5, 34, sx, 68, 8, 4));
    }
  };
  LM.mthl = (g) => { // Atal Setu: 14 km of low deck over the creek (segmented)
    const road = G.W.roads.find(r => r.n === "Atal Setu (MTHL)");
    if (!road) return;
    const pts = road.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const L = G.dist(x1, y1, x2, y2), a = G.angTo(x1, y1, x2, y2);
      g.add(B(MAT.deck, L + 6, 2.4, 18, (x1 + x2) / 2, 15, (y1 + y2) / 2, -a));
      g.add(C(MAT.steel, 1.6, 2, 15, (x1 * 3 + x2) / 4, 7.5, (y1 * 3 + y2) / 4, 6));
      g.add(C(MAT.steel, 1.6, 2, 15, (x1 + x2 * 3) / 4, 7.5, (y1 + y2 * 3) / 4, 6));
    }
  };
  LM.worli = (g) => LM.fort(g, false);

  function buildLandmarks() {
    TW.lms = [];
    const at = (lon, lat, builder, name) => {
      const [x, z] = G.PROJ.lonLatToXY(lon, lat);
      const g = new THREE.Group();
      builder(g);
      g.position.set(x, elevAt(x, z), z);
      TW.scene.add(g);
      TW.lms.push({ g, x, z });
    };
    at(72.8347, 18.9220, LM.gateway, "Gateway");
    at(72.8355, 18.9400, LM.cst, "CST");
    at(72.8330, 18.9218, LM.taj, "Taj");
    at(72.8082, 18.9822, LM.hajiali, "Haji Ali");
    at(72.8208, 19.0482, LM.mountmary, "Mount Mary");
    at(72.8308, 19.0170, LM.siddhivinayak, "Siddhivinayak");
    at(72.8352, 18.9298, LM.rajabai, "Rajabai");
    at(72.8218, 18.9682, LM.antilia, "Antilia");
    at(72.8198, 19.0428, g => LM.fort(g, false), "Bandra Fort");
    at(72.8182, 19.0022, LM.worli, "Worli Fort");
    at(72.8528, 18.9830, g => LM.fort(g, false), "Sewri Fort");
    at(72.8278, 19.3218, LM.vasaifort, "Vasai Fort");
    at(72.9302, 18.9588, LM.elephanta, "Elephanta");
    at(73.1200, 18.9000, LM.karnala, "Karnala");
    at(72.9500, 18.9470, LM.cranes, "JNPT");
    at(72.9530, 18.8369, LM.dam, "Ransai Dam");
    at(72.7892, 19.2482, LM.wheel, "EsselWorld");
    at(72.8268, 19.0880, LM.pagoda, "Pagoda");
    at(72.8180, 19.0200, LM.sealink, "BWSL");
    at(72.8950, 18.9550, LM.mthl, "Atal Setu");
  }

  // ---------------- init ----------------
  TW.init = function (canvas2) {
    if (TW.inited || !THREE) return;
    try {
      const r = new THREE.WebGLRenderer({ canvas: canvas2, antialias: true, powerPreference: "high-performance" });
      r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
      r.setSize(window.innerWidth, window.innerHeight, false);
      TW.renderer = r;
      TW.scene = new THREE.Scene();
      TW.cam = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 26000);
      TW.inited = true;
      mats();
      buildLights();
      buildTerrain();
      buildWater();
      buildStreetRigs();
      buildBuildingRigs();
      buildLandmarks();
      buildEntities();
      buildRain();
      buildVegetation();
      buildKoliwadas();
      buildMarkets();
      buildClouds();
      buildStations();
      buildAirports();
      window.addEventListener("resize", () => {
        r.setSize(window.innerWidth, window.innerHeight, false);
        TW.cam.aspect = window.innerWidth / window.innerHeight;
        TW.cam.updateProjectionMatrix();
      });
      TW.ready = true;
      console.log("3D world ready");
    } catch (e) {
      console.error("3D init failed:", e);
      G.emit("toast", "3D unavailable: " + e.message);
    }
  };

  function buildLights() {
    TW.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a5040, 0.9);
    TW.scene.add(TW.hemi);
    TW.sun = new THREE.DirectionalLight(0xfff2d8, 1.2);
    TW.scene.add(TW.sun);
  }

  // ---------------- terrain + water ----------------
  function buildTerrain() {
    const SIZE = 26000, SEG = 112;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const tint = G.ENV.seasonTint();
    const landC = new THREE.Color(tint.land), dryC = new THREE.Color(tint.dry), forestC = new THREE.Color(tint.for), sandC = new THREE.Color(0xd8c894);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const k = G.TERRAIN.kindAt(x, z, 1.5);
      let h, c;
      if (k.water) {
        const d = G.TERRAIN.depth(x, z, 1.5);
        h = -Math.min(14, 2 + d * 2.5);
        c = new THREE.Color(0x6a6a58);
      } else {
        h = elevAt(x, z);
        c = k.kind === "forest" ? forestC : (G.hash2(x | 0, z | 0) < 0.25 ? dryC : landC);
        if (h < 5 && !G.TERRAIN.hillAt(x, z)) c = sandC;
      }
      pos.setY(i, h);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    TW.terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    TW.scene.add(TW.terrain);
  }

  function buildWater() {
    const geo = new THREE.PlaneGeometry(60000, 60000);
    geo.rotateX(-Math.PI / 2);
    TW.waterMat = new THREE.MeshPhongMaterial({ color: 0x2e6b8a, transparent: true, opacity: 0.86, shininess: 90, specular: 0x88ccee });
    TW.water = new THREE.Mesh(geo, TW.waterMat);
    TW.water.position.y = 1.2;
    TW.scene.add(TW.water);
  }

  // ---------------- real OSM streets ----------------
  function buildStreetRigs() {
    TW.streetAreas = (typeof REAL_STREETS !== "undefined" ? REAL_STREETS.areas : []).map(a => ({
      ...a, mesh: null, cx: (a.bb[0] + a.bb[2]) / 2, cy: (a.bb[1] + a.bb[3]) / 2
    }));
    TW.streetMats = [
      new THREE.MeshPhongMaterial({ color: 0x2a2a30, specular: 0x223038, shininess: 8 }),
      new THREE.MeshPhongMaterial({ color: 0x3a3a42, specular: 0x223038, shininess: 8 }),
      new THREE.MeshPhongMaterial({ color: 0x44444c, specular: 0x223038, shininess: 8 }),
      new THREE.MeshPhongMaterial({ color: 0x55555c, specular: 0x223038, shininess: 8 }),
      new THREE.MeshLambertMaterial({ color: 0x606066 }),
      new THREE.MeshLambertMaterial({ color: 0x8a8578 })
    ];
  }

  function ribbonGeometry(pts, width) {
    const n = pts.length / 2;
    const positions = new Float32Array(n * 2 * 3);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2], y = pts[i * 2 + 1];
      const px = i < n - 1 ? pts[i * 2 + 2] : pts[i * 2 - 2];
      const py = i < n - 1 ? pts[i * 2 + 3] : pts[i * 2 + 1 - 2];
      let dx = px - x, dy = py - y;
      const L = Math.hypot(dx, dy) || 1;
      dx /= L; dy /= L;
      const nx = -dy * width / 2, ny = dx * width / 2;
      positions[i * 6] = x + nx; positions[i * 6 + 1] = 0; positions[i * 6 + 2] = y + ny;
      positions[i * 6 + 3] = x - nx; positions[i * 6 + 4] = 0; positions[i * 6 + 5] = y - ny;
      if (i < n - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  function mergeGeoms(geos) {
    let vCount = 0, iCount = 0;
    geos.forEach(g => { vCount += g.attributes.position.count; iCount += g.index.count; });
    const pos = new Float32Array(vCount * 3);
    const idx = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
    let vo = 0, io = 0;
    geos.forEach(g => {
      pos.set(g.attributes.position.array, vo * 3);
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
      vo += g.attributes.position.count; io += gi.length;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeVertexNormals();
    return out;
  }

  function ensureStreetMesh(area) {
    if (area.mesh) return;
    const byClass = [[], [], [], [], [], []];
    for (const st of area.streets) byClass[st.c].push(st);
    const group = new THREE.Group();
    for (let c = 0; c < 6; c++) {
      if (!byClass[c].length) continue;
      const geos = byClass[c].map(st => ribbonGeometry(st.p, st.w));
      group.add(new THREE.Mesh(mergeGeoms(geos), TW.streetMats[c]));
    }
    // curbs (lighter wider band under main carriageway) + lane dashes, big roads
    const curbGeos = [], dashGeos = [];
    for (const st of area.streets) {
      if (st.c <= 3) curbGeos.push(ribbonGeometry(st.p, st.w + 5));
      if (st.c <= 2) {
        const p = st.p;
        for (let i = 0; i < p.length / 2 - 1; i++) {
          const x1 = p[i * 2], y1 = p[i * 2 + 1], x2 = p[i * 2 + 2], y2 = p[i * 2 + 3];
          const L = G.dist(x1, y1, x2, y2);
          if (L < 8) continue;
          const n = Math.floor(L / 16);
          const dx = (x2 - x1) / L, dy = (y2 - y1) / L;
          for (let k = 0; k < n; k++) {
            const cx = x1 + dx * (k * 16 + 5), cy = y1 + dy * (k * 16 + 5);
            dashGeos.push(ribbonGeometry([cx - dx * 3, cy - dy * 3, cx + dx * 3, cy + dy * 3], 0.35));
          }
        }
      }
    }
    if (curbGeos.length) {
      const curb = new THREE.Mesh(mergeGeoms(curbGeos), new THREE.MeshLambertMaterial({ color: 0x7a756a }));
      curb.position.y = -0.08;
      group.add(curb);
    }
    if (dashGeos.length) {
      const dashes = new THREE.Mesh(mergeGeoms(dashGeos), new THREE.MeshLambertMaterial({ color: 0xd8d4c0 }));
      dashes.position.y = 0.16;
      group.add(dashes);
    }
    group.position.y = 0.6;
    area.mesh = group;
    TW.scene.add(group);
  }

  // ---------------- weather: 3D rain ----------------
  function buildRain() {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 900;
      pos[i * 3 + 1] = Math.random() * 260;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 900;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    TW.rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xaaccee, size: 2.2, transparent: true, opacity: 0.55 }));
    TW.rain.visible = false;
    TW.scene.add(TW.rain);
    // headlights (night)
    TW.light = new THREE.SpotLight(0xfff2c0, 0, 140, 0.5, 0.45);
    TW.lightTarget = new THREE.Object3D();
    TW.scene.add(TW.light); TW.scene.add(TW.lightTarget);
    TW.light.target = TW.lightTarget;
  }

  // ---------------- buildings: street-block infill + POI clusters ----------------
  const PAL3D = [
    [/glass|aluminium/i, [0x8fb2c8, 0xa8c4d4, 0x7ca0b8]],
    [/laterite|khakan|basalt/i, [0xb06a42, 0xa05c38, 0xc07a50]],
    [/lime plaster|mosaic|terrazzo|red oxide/i, [0xe2d6c0, 0xd8c8b0, 0xeadfca]],
    [/MS lattice|corrugated|epoxy/i, [0x9aa4a8, 0x8a9498, 0xaab4b8]],
    [/concrete|cement/i, [0xc4bcb0, 0xb8b0a4, 0xccc6ba]],
    [/tar macadam/i, [0xb0a89c, 0xa8a090, 0xc0b8ac]]
  ];
  function palHex(pal, rnd) {
    for (const [re, cols] of PAL3D) if (re.test(pal || "")) return cols[Math.floor(rnd() * cols.length)];
    return [0xcfc5b4, 0xc2b8a6, 0xd8cec0][Math.floor(rnd() * 3)];
  }

  function segGridFor(area) {
    if (area._grid) return area._grid;
    const CELL = 90, grid = new Map();
    const put = (k, s) => { const arr = grid.get(k); if (arr) arr.push(s); else grid.set(k, [s]); };
    for (const st of area.streets) {
      const p = st.p;
      for (let i = 0; i < p.length / 2 - 1; i++) {
        const x1 = p[i * 2], y1 = p[i * 2 + 1], x2 = p[i * 2 + 2], y2 = p[i * 2 + 3];
        const r = st.w / 2 + 15;
        const gx0 = Math.floor((Math.min(x1, x2) - r) / CELL), gx1 = Math.floor((Math.max(x1, x2) + r) / CELL);
        const gy0 = Math.floor((Math.min(y1, y2) - r) / CELL), gy1 = Math.floor((Math.max(y1, y2) + r) / CELL);
        for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) put(gx + "," + gy, [x1, y1, x2, y2]);
      }
    }
    area._grid = { CELL, grid };
    return area._grid;
  }
  function nearStreet(area, g, x, y, r) {
    const CELL = g.CELL, gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const c = g.grid.get((gx + i) + "," + (gy + j));
      if (!c) continue;
      for (const s of c) if (G.segDist2(x, y, s[0], s[1], s[2], s[3]) < r * r) return true;
    }
    return false;
  }

  function buildBuildingRigs() {
    TW.bldMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    TW.bldMesh = null;
    TW.bldAnchor = [1e9, 1e9];
    // REAL footprints (tools/import_footprints.py -> data/buildings_real.js)
    TW.realAreas = (typeof BUILDINGS3D !== "undefined" ? BUILDINGS3D.areas : []).map(a => ({
      ...a, mesh: null, cx: (a.bb[0] + a.bb[2]) / 2, cy: (a.bb[1] + a.bb[3]) / 2
    }));
    // occupancy grid: real buildings suppress procedural infill around themselves
    TW.occ = new Map(); TW.occCell = 70;
    for (const ra of TW.realAreas) for (const b of ra.bldgs) {
      const xs = [], ys = [];
      for (let i = 0; i < b.p.length; i += 2) { xs.push(b.p[i]); ys.push(b.p[i + 1]); }
      let cx = 0, cy = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < xs.length; i++) { cx += xs[i]; cy += ys[i]; if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i]; if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i]; }
      cx /= xs.length; cy /= ys.length;
      const r = Math.max(3, Math.sqrt((x1 - x0) * (y1 - y0)) / 2 + 16);
      const k = Math.floor(cx / TW.occCell) + "," + Math.floor(cy / TW.occCell);
      const e = TW.occ.get(k); if (e) e.push([cx, cy, r]); else TW.occ.set(k, [[cx, cy, r]]);
    }
  }
  function nearReal(x, y) {
    if (!TW.occ || !TW.occ.size) return false;
    const C = TW.occCell, gx = Math.floor(x / C), gy = Math.floor(y / C);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const c = TW.occ.get((gx + i) + "," + (gy + j));
      if (!c) continue;
      for (const o of c) { const dx = x - o[0], dy = y - o[1], rr = o[2]; if (dx * dx + dy * dy < rr * rr) return true; }
    }
    return false;
  }

  function ensureRealBuildings(area) {
    if (area.mesh) return;
    const geos = [];
    const cols = [];
    for (const b of area.bldgs) {
      const n = b.p.length / 2;
      if (n < 3) continue;
      const shape = new THREE.Shape();
      shape.moveTo(b.p[0], b.p[1]);
      for (let i = 1; i < n; i++) shape.lineTo(b.p[i * 2], b.p[i * 2 + 1]);
      const g = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      geos.push(g);
      // height-tinted color per building
      const c = new THREE.Color(0xcfc5b4).lerp(new THREE.Color(0x8fb2c8), Math.min(1, b.h / 120));
      const vc = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < g.attributes.position.count; i++) { vc[i * 3] = c.r; vc[i * 3 + 1] = c.g; vc[i * 3 + 2] = c.b; }
      g.setAttribute("color", new THREE.BufferAttribute(vc, 3));
    }
    if (!geos.length) return;
    // merge non-indexed geoms (position+normal+uv+color)
    let count = 0;
    geos.forEach(g => count += g.attributes.position.count);
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2), col = new Float32Array(count * 3);
    let o = 0;
    geos.forEach(g => {
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    merged.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.position.y = 0;
    area.mesh = mesh;
    TW.scene.add(mesh);
  }

  function rebuildBuildings() {
    if (TW.bldMesh) { TW.scene.remove(TW.bldMesh); TW.bldMesh.geometry.dispose(); TW.bldMesh = null; }
    const cam = G.CAM, R = 1300;
    const list = [];
    const rnd = G.rng((cam.x | 0) * 31 + (cam.y | 0) * 7);
    // A) real-street infill: player inside an OSM area -> fill blocks between streets
    let area = null;
    for (const a of TW.streetAreas) if (cam.x > a.bb[0] && cam.x < a.bb[2] && cam.y > a.bb[1] && cam.y < a.bb[3]) { area = a; break; }
    if (area) {
      const grid = segGridFor(area);
      const STEP = 26;
      const x0 = Math.floor((cam.x - R) / STEP) * STEP, x1 = cam.x + R, y0 = Math.floor((cam.y - R) / STEP) * STEP, y1 = cam.y + R;
      const nearPOI = G.POI.nearby(cam.x, cam.y, R + 400);
      for (let x = x0; x <= x1 && list.length < 1100; x += STEP) {
        for (let y = y0; y <= y1 && list.length < 1100; y += STEP) {
          const jx = x + (rnd() - 0.5) * 14, jy = y + (rnd() - 0.5) * 14;
          if (nearStreet(area, grid, jx, jy, 15)) continue;
          if (nearReal(jx, jy)) continue;
          if (G.TERRAIN.waterAt(jx, jy, 1.5)) continue;
          const p = nearPOI.length ? nearPOI[Math.min(nearPOI.length - 1, Math.floor(rnd() * 3))] : null;
          const pal = p ? p.palette : "";
          const hgt = 6 + rnd() * 24 + (rnd() < 0.08 ? 30 + rnd() * 40 : 0);
          if (rnd() < 0.17 && hgt < 26) {
            // Mumbai chawl: 4-floor walk-up bars around an open courtyard
            const ch = 13 + rnd() * 3.5, bw = 20 + rnd() * 10, bd = 6 + rnd() * 2;
            const col = palHex("concrete", rnd), rot = rnd() < 0.5 ? 0 : Math.PI / 2;
            const put = (ox, oy, w, d) => list.push({ x: jx + ox * (rot ? 0 : 1) + oy * (rot ? 1 : 0), y: jy - ox * (rot ? 1 : 0) + oy * (rot ? 0 : 1), w: rot ? d : w, d: rot ? w : d, hgt: ch, col, rot });
            put(0, -bd * 1.7, bw, bd); put(0, bd * 1.7, bw, bd); put(bw / 2 + bd * 0.8, 0, bw * 0.72, bd);
          } else list.push({ x: jx, y: jy, w: 11 + rnd() * 18, hgt, col: palHex(pal, rnd) });
        }
      }
    } else {
      // B) POI-cluster fallback (as before)
      const near = G.POI.nearby(cam.x, cam.y, 1500);
      for (const poi of near) {
        const n = 8 + Math.floor(rnd() * 16), rad = 200 + rnd() * 380;
        for (let i = 0; i < n && list.length < 1000; i++) {
          const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad;
          const bx = poi.x + Math.cos(a) * d, by = poi.y + Math.sin(a) * d;
          if (G.TERRAIN.waterAt(bx, by, 1.5)) continue;
          list.push({
            x: bx, y: by, w: 12 + rnd() * 26,
            hgt: (6 + rnd() * 30) * (rnd() < (poi.region === "south mumbai" ? 2.2 : 1) ? 1 : 0.5),
            col: palHex(poi.palette, rnd)
          });
        }
      }
    }
    if (!list.length) return;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(box, TW.bldMat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    list.forEach((b, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot !== undefined ? b.rot : (b.x + b.y) % 3);
      p.set(b.x, elevAt(b.x, b.y) + b.hgt / 2 - 0.5, b.y);
      s.set(b.w, b.hgt, b.d || b.w * 0.8);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.setHex(b.col));
    });
    mesh.instanceMatrix.needsUpdate = true;
    TW.bldMesh = mesh;
    TW.bldAnchor = [cam.x, cam.y];
    TW.scene.add(mesh);
  }

  // ---------------- vegetation: palms on coasts, canopies in forests ----------------
  function buildVegetation() {
    TW.palmTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.4, 9, 5), new THREE.MeshLambertMaterial({ color: 0x9a7a5a }), 220);
    TW.palmCrown = new THREE.InstancedMesh(new THREE.ConeGeometry(3.4, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0x4a7a3a }), 220);
    TW.canopy = new THREE.InstancedMesh(new THREE.SphereGeometry(5, 7, 5), new THREE.MeshLambertMaterial({ color: 0x3a5c2e }), 320);
    [TW.palmTrunk, TW.palmCrown, TW.canopy].forEach(m => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); TW.scene.add(m); });
    TW.vegAnchor = [1e9, 1e9];
  }

  function rebuildVegetation() {
    const pl = G.PL, m = TW._m4, q = TW._q, s = TW._s, p = TW._p, col = TW._col;
    const rnd = G.rng((pl.x | 0) * 13 + (pl.y | 0) * 3);
    let pi = 0, ci = 0;
    // palms: coastal strips near player
    for (let i = 0; i < 1400 && pi < 220; i++) {
      const a = rnd() * Math.PI * 2, d = 60 + Math.sqrt(rnd()) * 1400;
      const x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d;
      if (G.TERRAIN.waterAt(x, y, 1.5)) continue;
      if (G.TERRAIN.elev(x, y) > 7) continue;
      let nearWater = false;
      for (const wl of G.W.water) if (G.polyDist(x, y, wl.pts) < 160) { nearWater = true; break; }
      if (!nearWater && G.TERRAIN.landAt(x, y) && !G.TERRAIN.hillAt(x, y)) { /* inland strip palms rarer */ if (rnd() > 0.25) continue; }
      p.set(x, elevAt(x, y), y); q.identity(); s.set(1, 1, 1);
      m.compose(p, q, s);
      TW.palmTrunk.setMatrixAt(pi, m);
      p.set(x, elevAt(x, y) + 5.4, y);
      m.compose(p, q, s);
      TW.palmCrown.setMatrixAt(pi, m);
      TW.palmCrown.setColorAt(pi, col.setHex(0x4a7a3a + Math.floor(rnd() * 0x183018)));
      pi++;
    }
    for (let i = pi; i < 220; i++) { p.set(0, -60, 0); s.set(0.001, 0.001, 0.001); q.identity(); m.compose(p, q, s); TW.palmTrunk.setMatrixAt(i, m); TW.palmCrown.setMatrixAt(i, m); }
    // forest canopies
    for (let i = 0; i < 2600 && ci < 320; i++) {
      const a = rnd() * Math.PI * 2, d = 80 + Math.sqrt(rnd()) * 1800;
      const x = pl.x + Math.cos(a) * d, y = pl.y + Math.sin(a) * d;
      if (!G.TERRAIN.forestAt(x, y)) continue;
      p.set(x, elevAt(x, y) + 5 + rnd() * 4, y);
      q.identity();
      const sc = 0.7 + rnd() * 0.9;
      s.set(sc, sc * 0.85, sc);
      m.compose(p, q, s);
      TW.canopy.setMatrixAt(ci, m);
      TW.canopy.setColorAt(ci, col.setHex(0x3a5c2e + Math.floor(rnd() * 0x1c2c14)));
      ci++;
    }
    for (let i = ci; i < 320; i++) { p.set(0, -60, 0); s.set(0.001, 0.001, 0.001); q.identity(); m.compose(p, q, s); TW.canopy.setMatrixAt(i, m); }
    TW.palmTrunk.instanceMatrix.needsUpdate = true;
    TW.palmCrown.instanceMatrix.needsUpdate = true;
    TW.canopy.instanceMatrix.needsUpdate = true;
    if (TW.palmCrown.instanceColor) TW.palmCrown.instanceColor.needsUpdate = true;
    if (TW.canopy.instanceColor) TW.canopy.instanceColor.needsUpdate = true;
    TW.vegAnchor = [pl.x, pl.y];
  }

  // ---------------- koliwada hut clusters (real coastal fishing villages) ----------------
  const KOLIWADAS = [
    ["Worli", -13885, -10062], ["Versova", -11308, 4036], ["Dharavi", -9835, -5971],
    ["Sassoon", -14674, -21230], ["Mahim", -11256, -6634], ["Chimbai", -12991, -5197],
    ["Madh", -15884, 6745], ["Manori", -17146, 9288], ["Marve", -16410, 5529], ["Uttan", -17567, 10394]
  ];
  function buildKoliwadas() {
    TW.koliAnchor = [1e9, 1e9];
    TW.koliBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 700);
    TW.koliRoof = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 1.6, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), 700);
    [TW.koliBody, TW.koliRoof].forEach(m => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); TW.scene.add(m); });
    TW.koliTorch = new THREE.PointLight(0xffa050, 0, 70);
    TW.scene.add(TW.koliTorch);
  }
  function rebuildKoliwadas() {
    const pl = G.PL, m = TW._m4, q = TW._q, s = TW._s, p = TW._p, col = TW._col;
    let n = 0;
    const rots = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2];
    for (const [name, kx, ky] of KOLIWADAS) {
      if (G.dist(pl.x, pl.y, kx, ky) > 1700) continue;
      const rnd = G.rng(kx * 3 + ky);
      for (let i = 0; i < 70 && n < 700; i++) {
        const a = rnd() * Math.PI * 2, d = 10 + Math.sqrt(rnd()) * 190;
        const x = kx + Math.cos(a) * d * 1.25, y = ky + Math.sin(a) * d;
        if (G.TERRAIN.waterAt(x, y, 2)) continue;
        if (G.TERRAIN.elev(x, y) > 9) continue;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rots[(rnd() * 4) | 0]);
        const w = 2.6 + rnd() * 1.6, hh = 2.3 + rnd() * 1.1;
        p.set(x, elevAt(x, y) + hh / 2, y); s.set(w, hh, w * 0.85); m.compose(p, q, s);
        TW.koliBody.setMatrixAt(n, m);
        TW.koliBody.setColorAt(n, col.setHex(rnd() < 0.5 ? 0xc9b291 : (rnd() < 0.5 ? 0x9fb6c4 : 0x7ba3c9)));
        p.y += hh / 2 + 0.8; s.set(1, 1, 1); m.compose(p, q, s);
        TW.koliRoof.setMatrixAt(n, m);
        TW.koliRoof.setColorAt(n, col.setHex(rnd() < 0.6 ? 0xa85c38 : 0x8a4a30));
        n++;
      }
    }
    TW.koliBody.count = n; TW.koliRoof.count = n;
    TW.koliBody.instanceMatrix.needsUpdate = true; TW.koliRoof.instanceMatrix.needsUpdate = true;
    if (TW.koliBody.instanceColor) TW.koliBody.instanceColor.needsUpdate = true;
    if (TW.koliRoof.instanceColor) TW.koliRoof.instanceColor.needsUpdate = true;
    TW.koliAnchor = [pl.x, pl.y];
  }

  // ---------------- night-market light spill (real market streets) ----------------
  const MARKETS = [
    ["Crawford Market", -12307, -16807], ["Mohammed Ali Rd", -12150, -15591], ["Zaveri Bazaar", -12360, -16641],
    ["Chor Bazaar", -12307, -13601], ["Dadar Market", -11150, -9012], ["Linking Rd", -12360, -4368]
  ];
  function buildMarkets() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g2 = cv.getContext("2d");
    const gr = g2.createRadialGradient(64, 64, 6, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,176,90,0.85)"); gr.addColorStop(0.5, "rgba(255,150,60,0.30)"); gr.addColorStop(1, "rgba(255,140,50,0)");
    g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
    TW.mktDecal = new THREE.Mesh(new THREE.PlaneGeometry(150, 110),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    TW.mktDecal.rotation.x = -Math.PI / 2; TW.mktDecal.visible = false;
    TW.scene.add(TW.mktDecal);
    TW.mktLight = new THREE.PointLight(0xffa044, 0, 110); TW.scene.add(TW.mktLight);
    TW.mktLight2 = new THREE.PointLight(0xff9040, 0, 80); TW.scene.add(TW.mktLight2);
    TW.mktBulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 120);
    TW.mktBulbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    TW.scene.add(TW.mktBulbs);
  }
  function updateMarkets(day) {
    const pl = G.PL, m = TW._m4, q = TW._q, s = TW._s, p = TW._p, col = TW._col;
    let best = null;
    if (day < 0.3) for (const mk of MARKETS) {
      if (!best || G.dist(pl.x, pl.y, mk[1], mk[2]) < G.dist(pl.x, pl.y, best[1], best[2])) best = mk;
    }
    const d0 = best ? G.dist(pl.x, pl.y, best[1], best[2]) : 1e9;
    if (!best || d0 > 800) {
      TW.mktDecal.visible = false; TW.mktLight.intensity = 0; TW.mktLight2.intensity = 0; TW.mktBulbs.count = 0;
      return;
    }
    const mx = best[1], my = best[2], ey = elevAt(mx, my);
    TW.mktDecal.position.set(mx, ey + 0.4, my);
    TW.mktDecal.material.opacity = Math.max(0.15, 0.6 - d0 / 1400);
    TW.mktDecal.visible = true;
    TW.mktLight.position.set(mx, ey + 7, my);
    TW.mktLight.intensity = Math.max(0, 1.5 - d0 / 700);
    TW.mktLight2.position.set(mx + 34, ey + 5, my + 18);
    TW.mktLight2.intensity = Math.max(0, 1.1 - d0 / 700);
    const rnd = G.rng(mx * 5 + my);
    let n = 0;
    const cols = [0xffd9a0, 0xa0d8ff, 0xffa0a0, 0xa0ffc8, 0xfff0b0];
    for (let line = 0; line < 4 && n < 120; line++) {
      const ang = rnd() * Math.PI, len = 26 + rnd() * 30;
      const sx = mx + (rnd() - 0.5) * 50, sz = my + (rnd() - 0.5) * 40;
      const lc = cols[(rnd() * cols.length) | 0];
      for (let i = 0; i < 12 && n < 120; i++) {
        const t = i / 11, sag = Math.sin(t * Math.PI) * 0.8;
        p.set(sx + Math.cos(ang) * len * t, ey + 3.1 - sag, sz + Math.sin(ang) * len * t);
        q.identity(); s.set(1, 1, 1); m.compose(p, q, s);
        TW.mktBulbs.setMatrixAt(n, m);
        TW.mktBulbs.setColorAt(n, col.setHex(rnd() < 0.75 ? lc : 0xffffff));
        n++;
      }
    }
    TW.mktBulbs.count = n;
    TW.mktBulbs.instanceMatrix.needsUpdate = true;
    if (TW.mktBulbs.instanceColor) TW.mktBulbs.instanceColor.needsUpdate = true;
  }

  // ---------------- monsoon cloud deck (low, dark, drifting) ----------------
  function buildClouds() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g2 = cv.getContext("2d");
    const gr = g2.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(0.6, "rgba(255,255,255,0.42)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
    TW.cloudMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, depthWrite: false,
      color: 0x9aa8b4, side: THREE.DoubleSide, fog: false
    });
    TW.clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), TW.cloudMat, 300);
    TW.clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const rnd = G.rng(7712);
    for (let i = 0; i < 300; i++) {
      const x = (rnd() - 0.5) * 15000, z = (rnd() - 0.5) * 15000, y = 950 + rnd() * 420;
      const w = 260 + rnd() * 480;
      TW._p.set(x, y, z); TW._q.identity(); TW._s.set(w, 1, w * 0.42);
      TW._m4.compose(TW._p, TW._q, TW._s);
      TW.clouds.setMatrixAt(i, TW._m4);
    }
    TW.clouds.instanceMatrix.needsUpdate = true;
    TW.clouds.frustumCulled = false;
    TW.clouds.visible = false;
    TW.scene.add(TW.clouds);
  }
  function updateClouds(dt, day, rain) {
    const on = rain > 0.03;
    TW.clouds.visible = on;
    if (!on) return;
    TW.cloudDrift = (TW.cloudDrift || 0) + dt * 14;
    const qx = Math.round(G.PL.x / 2000) * 2000, qz = Math.round(G.PL.y / 2000) * 2000;
    TW.clouds.position.set(qx + (TW.cloudDrift % 900), 0, qz + (TW.cloudDrift % 700));
    TW.cloudMat.opacity = Math.min(0.62, 0.16 + rain * 0.5);
    TW.cloudMat.color.setHex(0x9aa8b4).lerp(new THREE.Color(0x3e4650), Math.min(1, rain));
  }

  // ---------------- railway stations: platforms + buildings + FOBs ----------------
  function buildStations() {
    const platMat = new THREE.MeshLambertMaterial({ color: 0xb8b2a4 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xa04038 });
    const steelM = new THREE.MeshLambertMaterial({ color: 0x7a8288 });
    TW.stationGroups = [];
    for (const rail of G.W.rails) {
      if (rail.kind === "metro") continue;
      rail.st.forEach((st, si) => {
        const g = new THREE.Group();
        const plat = B(platMat, 130, 1.1, 8, 0, 0.55, 0);
        g.add(plat);
        const roof = B(roofMat, 110, 0.5, 9, 0, 5.2, 0);
        g.add(roof);
        for (const px of [-45, -15, 15, 45]) g.add(C(steelM, 0.25, 0.3, 5, px, 2.6, 0, 6));
        const bld = B(new THREE.MeshLambertMaterial({ color: 0xe2d8c8 }), 22, 6, 14, 0, 3, -12);
        g.add(bld);
        const bldRoof = B(roofMat, 24, 0.6, 16, 0, 6.3, -12);
        g.add(bldRoof);
        if (si % 3 === 0) { // foot-over-bridge
          g.add(B(steelM, 3, 0.4, 44, 0, 7.6, 0));
          g.add(C(steelM, 0.3, 0.35, 7.6, -30, 3.8, 0, 6));
          g.add(C(steelM, 0.3, 0.35, 7.6, 30, 3.8, 0, 6));
        }
        // perpendicular to track
        g.rotation.y = -G.angTo(rail.pts[0][0], rail.pts[0][1], rail.pts[1][0], rail.pts[1][1]) + Math.PI / 2;
        g.position.set(st.x, elevAt(st.x, st.y), st.y);
        TW.scene.add(g);
        TW.stationGroups.push({ g, x: st.x, y: st.y });
      });
    }
  }

  // ---------------- airports ----------------
  function buildAirports() {
    for (const ap of G.W.airports) {
      const g = new THREE.Group();
      const [x1, y1] = ap.pts[0], [x2, y2] = ap.pts[1];
      const L = G.dist(x1, y1, x2, y2), a = G.angTo(x1, y1, x2, y2);
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      // runway slab
      g.add(B(new THREE.MeshLambertMaterial({ color: 0x3c4046 }), L, 0.5, 45, 0, 0.25, 0, -a));
      // centreline
      g.add(B(new THREE.MeshLambertMaterial({ color: 0xd8d4c0 }), L * 0.92, 0.1, 1, 0, 0.55, 0, -a));
      if (ap.big) {
        // T2-style terminal + pier
        const term = B(new THREE.MeshLambertMaterial({ color: 0xd8dee6 }), 320, 24, 90, 260, 12, 0, -a);
        g.add(term);
        const roofC = Dome(new THREE.MeshLambertMaterial({ color: 0xc0c8d4 }), 46, 260, 24, 0);
        roofC.scale.set(3.4, 0.4, 1); roofC.rotation.y = -a;
        g.add(roofC);
        // control tower
        g.add(C(new THREE.MeshLambertMaterial({ color: 0xd8dee6 }), 5, 7, 52, 150, 26, -70));
        g.add(C(new THREE.MeshLambertMaterial({ color: 0x46505a }), 9, 9, 8, 150, 56, -70, 10));
        // parked aircraft
        for (const off of [-60, 30]) {
          const fus = C(new THREE.MeshLambertMaterial({ color: 0xf2f4f6 }), 2.6, 2.6, 38, 190 + off, 5, -52, 8);
          fus.rotation.z = Math.PI / 2; fus.rotation.y = -a;
          g.add(fus);
          g.add(B(new THREE.MeshLambertMaterial({ color: 0xd0d6dc }), 6, 0.8, 34, 190 + off, 4.6, -52, -a));
        }
      }
      g.position.set(cx, elevAt(cx, cy) + 0.2, cy);
      TW.scene.add(g);
      TW.lms.push({ g, x: cx, z: cy });
    }
  }

  // ---------------- 3D entities (player, traffic, trains, boats, crowd) ----------------
  function buildEntities() {
    // player
    TW.playerMesh = B(MAT.plaster, 4.4, 1.8, 2.2, 0, 0, 0);
    TW.scene.add(TW.playerMesh);
    // traffic
    const N = 110;
    TW.carMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
    TW.carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    TW.scene.add(TW.carMesh);
    // boats
    TW.boatMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 14);
    TW.boatMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    TW.scene.add(TW.boatMesh);
    // crowd
    TW.npcMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.4, 1.7, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), 90);
    TW.npcMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    TW.scene.add(TW.npcMesh);
    // trains: lazy groups
    TW.trainGroups = new Map();
    TW._m4 = new THREE.Matrix4(); TW._q = new THREE.Quaternion(); TW._s = new THREE.Vector3(); TW._p = new THREE.Vector3(); TW._col = new THREE.Color();
    TW._up = new THREE.Vector3(0, 1, 0);
  }

  function lineLen(pts) { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += G.dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); return L; }
  function posAlong(pts, d) {
    for (let i = 0; i < pts.length - 1; i++) {
      const dd = G.dist(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (d <= dd) { const t = dd ? d / dd : 0; return { x: G.lerp(pts[i][0], pts[i + 1][0], t), y: G.lerp(pts[i][1], pts[i + 1][1], t), hd: G.angTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) }; }
      d -= dd;
    }
    const l = pts[pts.length - 1]; return { x: l[0], y: l[1], hd: 0 };
  }

  function updateEntities() {
    const pl = G.PL;
    const m = TW._m4, q = TW._q, s = TW._s, p = TW._p, col = TW._col, up = TW._up;
    const day = G.ENV.sun().day;
    // player
    TW.playerMesh.visible = pl.mode !== "foot";
    if (pl.mode !== "foot") {
      const L = { car: 4.6, taxi: 4.4, auto: 3, bike: 2.2, truck: 9, boat: 9, speed: 6, plane: 10, heli: 8, train: 12 }[pl.mode] || 4.6;
      TW.playerMesh.position.set(pl.x, elevAt(pl.x, pl.y) + (pl.alt || 0) + 1, pl.y);
      TW.playerMesh.rotation.set(0, -pl.heading, 0);
      TW.playerMesh.scale.set(L, 1.8, Math.max(1.2, L * 0.45));
      TW.playerMesh.visible = true;
    }
    // traffic cars
    let ci = 0;
    for (const c of G.TRAFFIC.cars) {
      if (ci >= 110 || G.dist(c.x, c.y, pl.x, pl.y) > 1500) continue;
      p.set(c.x, elevAt(c.x, c.y) + 0.9, c.y);
      q.setFromAxisAngle(up, -c.hd);
      s.set(c.ct.l, 1.6, c.ct.w);
      m.compose(p, q, s);
      TW.carMesh.setMatrixAt(ci, m);
      TW.carMesh.setColorAt(ci, col.set(c.ct.col || 0xd8d8d8));
      ci++;
    }
    for (let i = ci; i < 110; i++) {
      p.set(0, -50, 0); s.set(0.001, 0.001, 0.001); q.identity();
      m.compose(p, q, s); TW.carMesh.setMatrixAt(i, m);
    }
    TW.carMesh.instanceMatrix.needsUpdate = true;
    if (TW.carMesh.instanceColor) TW.carMesh.instanceColor.needsUpdate = true;
    // boats
    let bi = 0;
    for (const b of G.TRAFFIC.boats) {
      if (bi >= 14) break;
      p.set(b.x, 1.6 + G.ENV.tide() * 0.35, b.y);
      q.setFromAxisAngle(up, -b.hd);
      s.set(b.fisher ? 7 : 12, 2, b.fisher ? 2.4 : 4);
      m.compose(p, q, s);
      TW.boatMesh.setMatrixAt(bi, m);
      TW.boatMesh.setColorAt(bi, col.set(b.fisher ? 0xc8b090 : 0xf0f0f0));
      bi++;
    }
    for (let i = bi; i < 14; i++) { p.set(0, -50, 0); s.set(0.001, 0.001, 0.001); q.identity(); m.compose(p, q, s); TW.boatMesh.setMatrixAt(i, m); }
    TW.boatMesh.instanceMatrix.needsUpdate = true;
    if (TW.boatMesh.instanceColor) TW.boatMesh.instanceColor.needsUpdate = true;
    // trains
    const used = new Set();
    for (const t of G.TRAFFIC.trains) {
      if (G.dist(t.x, t.y, pl.x, pl.y) > 2500) continue;
      let grp = TW.trainGroups.get(t.idx);
      if (!grp) {
        grp = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const coach = B(MAT.dark, 0, 0, 0, 0, 0, 0);
          coach.material = new THREE.MeshLambertMaterial({ color: i === 0 ? 0xa03030 : 0xb84848 });
          grp.add(coach);
        }
        TW.scene.add(grp);
        TW.trainGroups.set(t.idx, grp);
      }
      used.add(t.idx);
      grp.visible = true;
      const L = lineLen(t.rail.pts);
      grp.children.forEach((coach, i) => {
        const back = Math.max(0, t.d - t.dir * i * 24);
        const pp = posAlong(t.rail.pts, back);
        coach.position.set(pp.x, elevAt(pp.x, pp.y) + 2.2, pp.y);
        coach.rotation.y = -(t.dir > 0 ? pp.hd : pp.hd + Math.PI);
        coach.scale.set(22, 3, 3.2);
      });
    }
    TW.trainGroups.forEach((grp, idx) => { if (!used.has(idx)) grp.visible = false; });
    // crowd
    let ni = 0;
    for (const n of G.NPC.list) {
      if (ni >= 90 || G.dist(n.x, n.y, pl.x, pl.y) > 320) continue;
      p.set(n.x, elevAt(n.x, n.y) + 0.85, n.y);
      q.setFromAxisAngle(up, -(n.tx !== undefined ? G.angTo(n.x, n.y, n.tx, n.ty) : 0));
      s.set(1, 1, 1);
      m.compose(p, q, s);
      TW.npcMesh.setMatrixAt(ni, m);
      const archCols = { commuter: 0xd8d8e8, koli: 0xe8a060, vendor: 0x60c080, dabbawala: 0xf0f0f0, student: 0x88a8e8, tourist: 0xf0d080, portworker: 0xe88030, pilgrim: 0xffc060, jogger: 0x60e0e0, resident: 0xc0a8e0, watchman: 0x8090a0 };
      TW.npcMesh.setColorAt(ni, col.setHex(archCols[n.arch] || 0xcccccc));
      ni++;
    }
    for (let i = ni; i < 90; i++) { p.set(0, -50, 0); s.set(0.001, 0.001, 0.001); q.identity(); m.compose(p, q, s); TW.npcMesh.setMatrixAt(i, m); }
    TW.npcMesh.instanceMatrix.needsUpdate = true;
    if (TW.npcMesh.instanceColor) TW.npcMesh.instanceColor.needsUpdate = true;
  }

  // ---------------- per-frame ----------------
  TW.render = function (dt) {
    if (!TW.ready) return;
    const pl = G.PL, env = G.ENV;
    const day = env.sun().day;
    const daySky = new THREE.Color(0x9fc8e8), duskSky = new THREE.Color(0xd8946a), nightSky = new THREE.Color(0x0a1626);
    let sky = (env.sun().golden > 0.25 && day < 0.6) ? duskSky.clone() : daySky.clone().lerp(nightSky, 1 - Math.min(1, day * 1.4));
    if (env.rain > 0.4) sky.lerp(new THREE.Color(0x556070), 0.45);
    TW.scene.background = sky;
    TW.scene.fog = new THREE.Fog(sky.getHex(), 900, 16000);
    const az = env.hourFrac() / 24 * Math.PI * 2;
    TW.sun.position.set(Math.cos(az) * 8000, Math.max(200, Math.sin(env.sun().alt + 0.2) * 9000), Math.sin(az) * 8000);
    TW.sun.intensity = 0.25 + day * 1.1;
    TW.hemi.intensity = 0.25 + day * 0.7;
    // wet-road sheen in rain
    const wet = Math.max(0, env.rain - 0.15);
    for (let i = 0; i < 4; i++) {
      const m2 = TW.streetMats[i];
      m2.specular.setHex(0x223038).lerp(new THREE.Color(0xbcd8ee), Math.min(1, wet * 1.6));
      m2.shininess = 8 + wet * 140;
    }
    TW.water.position.y = 1.0 + env.tide() * 0.35;
    TW.waterMat.opacity = 0.72 + 0.2 * day;
    if (G.dist(pl.x, pl.y, TW.bldAnchor[0], TW.bldAnchor[1]) > 900) rebuildBuildings();
    for (const a of TW.streetAreas) {
      const d = G.dist(pl.x, pl.y, a.cx, a.cy);
      const want = d < 4200;
      if (want && !a.mesh) ensureStreetMesh(a);
      if (a.mesh) {
        a.mesh.visible = want;
        a.mesh.position.y = Math.min(6, Math.max(0, elevAt(a.cx, a.cy) - 1.5));
      }
    }
    for (const ra of TW.realAreas) {
      const want = G.dist(pl.x, pl.y, ra.cx, ra.cy) < 9000;
      if (want && !ra.mesh) { ensureRealBuildings(ra); if (ra.mesh) G.emit("toast", "🏙️ Real footprints loaded: " + ra.name); }
      if (ra.mesh) { ra.mesh.visible = want; ra.mesh.position.y = Math.max(0, elevAt(ra.cx, ra.cy) - 2); }
    }
    // landmark + station culling; vegetation streaming
    for (const lm of TW.lms) lm.g.visible = G.dist(pl.x, pl.y, lm.x, lm.z) < 10000;
    for (const sg of TW.stationGroups) sg.g.visible = G.dist(pl.x, pl.y, sg.x, sg.y) < 2600;
    if (G.dist(pl.x, pl.y, TW.vegAnchor[0], TW.vegAnchor[1]) > 1600) rebuildVegetation();
    if (G.dist(pl.x, pl.y, TW.koliAnchor[0], TW.koliAnchor[1]) > 1600) rebuildKoliwadas();
    updateMarkets(day);
    updateClouds(dt, day, env.rain);
    if (TW.koliTorch) {
      let best = null, bd2 = 250000;
      for (const kw of KOLIWADAS) { const d2 = (pl.x - kw[1]) * (pl.x - kw[1]) + (pl.y - kw[2]) * (pl.y - kw[2]); if (d2 < bd2) { bd2 = d2; best = kw; } }
      if (best && day < 0.3) { TW.koliTorch.position.set(best[1], elevAt(best[1], best[2]) + 6, best[2]); TW.koliTorch.intensity = 1.15 * (1 - day * 3); }
      else TW.koliTorch.intensity = 0;
    }
    updateEntities();
    // rain follows camera
    if (TW.rain) {
      const on = env.rain > 0.05;
      TW.rain.visible = on;
      if (on) {
        TW.rain.position.set(pl.x, 0, pl.y);
        const pos = TW.rain.geometry.attributes.position;
        const fall = 320 * dt * (0.6 + env.rain);
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) - fall;
          if (y < 0) y = 260;
          pos.setY(i, y);
        }
        pos.needsUpdate = true;
        TW.rain.material.opacity = 0.25 + env.rain * 0.4;
      }
    }
    // headlights at night for ground vehicles
    const night = day < 0.25;
    const groundVeh = !G.VEHTYPES[pl.mode].air && !G.VEHTYPES[pl.mode].water && pl.mode !== "foot";
    TW.light.intensity = night && groundVeh ? 1.5 : 0;
    if (night && groundVeh) {
      TW.light.position.set(pl.x, elevAt(pl.x, pl.y) + 2, pl.y);
      TW.lightTarget.position.set(pl.x + Math.sin(pl.heading) * 60, elevAt(pl.x, pl.y), pl.y + Math.cos(pl.heading) * 60);
    }
    // camera
    const eye = new THREE.Vector3(pl.x, elevAt(pl.x, pl.y), pl.y);
    const hd = pl.heading;
    let cp;
    if (TW.camMode === CAMS.WALK) {
      cp = eye.clone(); cp.y += 1.7;
      TW.cam.position.copy(cp);
      TW.cam.lookAt(cp.x + Math.sin(hd) * 10, cp.y - 1.4, cp.z + Math.cos(hd) * 10);
    } else if (TW.camMode === CAMS.FLY) {
      cp = eye.clone(); cp.x -= Math.sin(hd) * 60; cp.z -= Math.cos(hd) * 60; cp.y += 26 + (pl.alt || 0) * 0.2;
      TW.cam.position.copy(cp);
      TW.cam.lookAt(eye.x + Math.sin(hd) * 30, eye.y + (pl.alt || 0) * 0.5, eye.z + Math.cos(hd) * 30);
    } else if (TW.camMode === CAMS.ORBIT) {
      cp = eye.clone();
      cp.x += Math.sin(TW.orbit.yaw) * TW.orbit.dist;
      cp.z += Math.cos(TW.orbit.yaw) * TW.orbit.dist;
      cp.y += TW.orbit.dist * Math.tan(TW.orbit.pitch);
      TW.cam.position.copy(cp);
      TW.cam.lookAt(eye.x, eye.y + 10, eye.z);
    } else {
      const dist = 26 + Math.abs(pl.v) * 1.1;
      cp = eye.clone(); cp.x -= Math.sin(hd) * dist; cp.z -= Math.cos(hd) * dist; cp.y += 12;
      TW.cam.position.copy(cp);
      TW.cam.lookAt(eye.x + Math.sin(hd) * 12, eye.y + 3, eye.z + Math.cos(hd) * 12);
    }
    TW.renderer.render(TW.scene, TW.cam);
  };

  TW.toggle = function () {
    if (!TW.ready) {
      TW.init(document.getElementById("game3d"));
      if (!TW.ready) return;
    }
    TW.active = !TW.active;
    document.getElementById("game").style.display = TW.active ? "none" : "block";
    document.getElementById("game3d").style.display = TW.active ? "block" : "none";
    G.emit("toast", TW.active ? "🌐 3D world — real OSM streets · F6 cycles cams · drag in Orbit" : "Back to map view");
    const b = document.getElementById("b3d");
    if (b) b.style.background = TW.active ? "rgba(80,160,220,0.8)" : "";
  };

  window.addEventListener("pointermove", e => {
    if (!TW.active || TW.camMode !== CAMS.ORBIT) return;
    if (e.buttons === 1) {
      TW.orbit.yaw -= e.movementX * 0.005;
      TW.orbit.pitch = Math.max(-0.1, Math.min(1.2, TW.orbit.pitch + e.movementY * 0.003));
    }
  });
  window.addEventListener("wheel", e => {
    if (!TW.active) return;
    TW.orbit.dist = Math.max(15, Math.min(900, TW.orbit.dist * (1 + e.deltaY * 0.001)));
  }, { passive: true });

  G.on("key", code => {
    if (!TW.active) return;
    if (code === "F6") {
      TW.camMode = (TW.camMode + 1) % 4;
      G.emit("toast", ["🎥 Walk cam", "🎥 Chase cam", "🎥 Fly cam", "🎥 Orbit cam (drag to rotate)"][TW.camMode]);
    }
  });
})();
