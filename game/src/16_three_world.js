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
      new THREE.MeshLambertMaterial({ color: 0x2a2a30 }),
      new THREE.MeshLambertMaterial({ color: 0x3a3a42 }),
      new THREE.MeshLambertMaterial({ color: 0x44444c }),
      new THREE.MeshLambertMaterial({ color: 0x55555c }),
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
    group.position.y = 0.6;
    area.mesh = group;
    TW.scene.add(group);
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
          if (G.TERRAIN.waterAt(jx, jy, 1.5)) continue;
          const p = nearPOI.length ? nearPOI[Math.min(nearPOI.length - 1, Math.floor(rnd() * 3))] : null;
          const pal = p ? p.palette : "";
          const hgt = 6 + rnd() * 24 + (rnd() < 0.08 ? 30 + rnd() * 40 : 0);
          list.push({ x: jx, y: jy, w: 11 + rnd() * 18, hgt, col: palHex(pal, rnd) });
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
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (b.x + b.y) % 3);
      p.set(b.x, elevAt(b.x, b.y) + b.hgt / 2 - 0.5, b.y);
      s.set(b.w, b.hgt, b.w * 0.8);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.setHex(b.col));
    });
    mesh.instanceMatrix.needsUpdate = true;
    TW.bldMesh = mesh;
    TW.bldAnchor = [cam.x, cam.y];
    TW.scene.add(mesh);
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
    // landmark culling
    for (const lm of TW.lms) lm.g.visible = G.dist(pl.x, pl.y, lm.x, lm.z) < 10000;
    updateEntities();
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
