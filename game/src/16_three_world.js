// 3D WORLD LAYER (Three.js): real terrain, tidal water, REAL OSM street ribbons,
// buildings, survey-modeled landmarks, walk/drive/fly cameras.
// Streets data: (c) OpenStreetMap contributors, ODbL — see game/data/streets_real.js
"use strict";
(function () {
  const G = window.G;
  if (typeof THREE === "undefined") { console.warn("THREE missing — 3D layer disabled"); return; }
  const TW = G.TW = { active: false, inited: false, ready: false };

  // ---------- camera modes ----------
  const CAMS = { WALK: 0, CHASE: 1, FLY: 2, ORBIT: 3 };
  TW.camMode = CAMS.CHASE;
  TW.orbit = { yaw: Math.PI * 0.8, pitch: 0.42, dist: 60 };

  // ---------- height model (meters; matches 2D TERRAIN) ----------
  function elevAt(x, y) {
    return G.TERRAIN.elev(x, y);
  }

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
      buildLights();
      buildTerrain();
      buildWater();
      buildGateway();
      buildStreetRigs();
      buildBuildingRigs();
      window.addEventListener("resize", () => {
        r.setSize(window.innerWidth, window.innerHeight, false);
        TW.cam.aspect = window.innerWidth / window.innerHeight;
        TW.cam.updateProjectionMatrix();
      });
      TW.ready = true;
      console.log("3D world ready");
    } catch (e) {
      console.error("3D init failed:", e);
      G.emit("toast", "3D unavailable on this device: " + e.message);
    }
  };

  function skyColors() {
    const day = G.ENV.sun().day;
    const daySky = new THREE.Color(0x9fc8e8), duskSky = new THREE.Color(0xd8946a), nightSky = new THREE.Color(0x0a1626);
    let sky;
    if (G.ENV.sun().golden > 0.25 && day < 0.6) sky = duskSky.clone();
    else sky = daySky.clone().lerp(nightSky, 1 - Math.min(1, day * 1.4));
    return sky;
  }

  function buildLights() {
    TW.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a5040, 0.9);
    TW.scene.add(TW.hemi);
    TW.sun = new THREE.DirectionalLight(0xfff2d8, 1.2);
    TW.scene.add(TW.sun);
  }

  // ---------- terrain ----------
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
        // carve creeks/rivers/lakes/sea below water plane
        const d = G.TERRAIN.depth(x, z, 1.5);
        h = -Math.min(14, 2 + d * 2.5);
        c = new THREE.Color(0x6a6a58); // submerged silt
      } else {
        h = elevAt(x, z);
        c = k.kind === "forest" ? forestC : (G.hash2(x | 0, z | 0) < 0.25 ? dryC : landC);
        if (h < 5 && !G.TERRAIN.hillAt(x, z)) c = sandC; // coastal strip
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
    TW.waterMat = new THREE.MeshPhongMaterial({
      color: 0x2e6b8a, transparent: true, opacity: 0.86, shininess: 90, specular: 0x88ccee
    });
    TW.water = new THREE.Mesh(geo, TW.waterMat);
    TW.water.position.y = 1.2; // tide offset added per-frame
    TW.scene.add(TW.water);
  }

  // ---------- real OSM streets ----------
  function buildStreetRigs() {
    TW.streetAreas = (typeof REAL_STREETS !== "undefined" ? REAL_STREETS.areas : []).map(a => ({
      ...a, mesh: null, cx: (a.bb[0] + a.bb[2]) / 2, cy: (a.bb[1] + a.bb[3]) / 2
    }));
    TW.streetMats = [
      new THREE.MeshLambertMaterial({ color: 0x2a2a30 }), // expressway
      new THREE.MeshLambertMaterial({ color: 0x3a3a42 }),
      new THREE.MeshLambertMaterial({ color: 0x44444c }),
      new THREE.MeshLambertMaterial({ color: 0x55555c }),
      new THREE.MeshLambertMaterial({ color: 0x606066 }),
      new THREE.MeshLambertMaterial({ color: 0x8a8578 })  // footpath
    ];
  }

  function ribbonGeometry(pts, width) {
    // pts: flat [x,y,x,y...] world meters; build ribbon at y=0 (raised later)
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

  function ensureStreetMesh(area) {
    if (area.mesh) return;
    const byClass = [[], [], [], [], [], []];
    for (const st of area.streets) byClass[st.c].push(st);
    const group = new THREE.Group();
    for (let c = 0; c < 6; c++) {
      if (!byClass[c].length) continue;
      const geos = byClass[c].map(st => ribbonGeometry(st.p, st.w));
      const merged = mergeGeoms(geos);
      const mesh = new THREE.Mesh(merged, TW.streetMats[c]);
      group.add(mesh);
      geos.forEach(g => g.dispose && 0);
    }
    group.position.y = 0.6; // above terrain (streets near coast; hills get drape later)
    area.mesh = group;
    TW.scene.add(group);
  }

  function mergeGeoms(geos) {
    // minimal merge for same-layout BufferGeometries (position + index)
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

  TW.setStreetsVisible = (on) => {
    TW.streetAreas.forEach(a => { if (a.mesh) a.mesh.visible = on; });
  };

  // ---------- buildings (seeded blocks as instanced boxes; real footprints next) ----------
  function buildBuildingRigs() {
    TW.bldMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    TW.bldMesh = null;
    TW.bldAnchor = [1e9, 1e9];
  }

  function rebuildBuildings() {
    if (TW.bldMesh) { TW.scene.remove(TW.bldMesh); TW.bldMesh.geometry.dispose(); TW.bldMesh = null; }
    const cam = G.CAM;
    const near = G.POI.nearby(cam.x, cam.y, 1500);
    const list = [];
    for (const poi of near) {
      const rnd = G.rng((poi.x * 13 + poi.y * 7) | 0);
      const n = 8 + Math.floor(rnd() * 16), rad = 200 + rnd() * 380;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad;
        const bx = poi.x + Math.cos(a) * d, by = poi.y + Math.sin(a) * d;
        if (G.TERRAIN.waterAt(bx, by, 1.5)) continue;
        list.push({
          x: bx, y: by, w: 12 + rnd() * 26, hgt: (6 + rnd() * 30) * (rnd() < (poi.region === "south mumbai" ? 2.2 : 1) ? 1 : 0.5),
          col: [0xcfc5b4, 0xb8a890, 0xa8b0b8, 0xc8b8a0, 0xd8c8b8][Math.floor(rnd() * 5)]
        });
        if (list.length > 900) break;
      }
    }
    if (!list.length) return;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(box, TW.bldMat, list.length);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    list.forEach((b, i) => {
      m.makeRotationY(0);
      m.setPosition(b.x, elevAt(b.x, b.y) + b.hgt / 2 - 0.5, b.y);
      m.scale(new THREE.Vector3(b.w, b.hgt, b.w * 0.8));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.setHex(b.col));
    });
    mesh.instanceMatrix.needsUpdate = true;
    TW.bldMesh = mesh;
    TW.bldAnchor = [G.CAM.x, G.CAM.y];
    TW.scene.add(mesh);
  }

  // ---------- landmark: Gateway of India (survey dims: 26 m arch, 4 corner turrets) ----------
  function buildGateway() {
    const g = new THREE.Group();
    const basalt = new THREE.MeshLambertMaterial({ color: 0x8a6a4e });
    const basaltD = new THREE.MeshLambertMaterial({ color: 0x7a5c42 });
    const [gx, gy] = G.PROJ.lonLatToXY(72.8347, 18.9220);
    const H = 26, W = 48; // real: 26 m tall, ~48 m wide face
    // side blocks with arched openings (approx by 3 boxes + 2 side arches as boxes)
    const side = new THREE.BoxGeometry(W * 0.22, H, 12);
    const L = new THREE.Mesh(side, basalt); L.position.set(-W * 0.39, H / 2, 0); g.add(L);
    const R = new THREE.Mesh(side, basalt); R.position.set(W * 0.39, H / 2, 0); g.add(R);
    // top beam across
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 8, 12), basaltD);
    beam.position.set(0, H - 4, 0); g.add(beam);
    // central arch: torus half
    const arch = new THREE.Mesh(new THREE.TorusGeometry(W * 0.24, 4, 8, 20, Math.PI), basaltD);
    arch.position.set(0, H - 14, 0); g.add(arch);
    // piers under arch shoulders
    const pier = new THREE.BoxGeometry(8, H - 14, 12);
    const p1 = new THREE.Mesh(pier, basalt); p1.position.set(-W * 0.24, (H - 14) / 2, 0); g.add(p1);
    const p2 = new THREE.Mesh(pier, basalt); p2.position.set(W * 0.24, (H - 14) / 2, 0); g.add(p2);
    // four corner turrets (real feature)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 32, 8), basalt);
      t.position.set(sx * W * 0.5, 16, sz * 8); g.add(t);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), basaltD);
      dome.position.set(sx * W * 0.5, 33.5, sz * 8); g.add(dome);
    }
    g.position.set(gx, 1.5, gy);
    TW.scene.add(g);
    TW.gateway = g;
  }

  // ---------- per-frame ----------
  const camTarget = new THREE.Vector3();
  TW.render = function (dt) {
    if (!TW.ready) return;
    const pl = G.PL, env = G.ENV;
    const day = env.sun().day;
    // sky/fog
    const sky = skyColors();
    TW.scene.background = sky;
    TW.scene.fog = new THREE.Fog(sky.getHex(), 900, 16000);
    // sun position
    const az = env.hourFrac() / 24 * Math.PI * 2;
    TW.sun.position.set(Math.cos(az) * 8000, Math.max(200, Math.sin(env.sun().alt + 0.2) * 9000), Math.sin(az) * 8000);
    TW.sun.intensity = 0.25 + day * 1.1;
    TW.hemi.intensity = 0.25 + day * 0.7;
    // tide
    TW.water.position.y = 1.0 + env.tide() * 0.35;
    TW.waterMat.opacity = 0.72 + 0.2 * day;
    // dynamic rigs near player
    if (G.dist(pl.x, pl.y, TW.bldAnchor[0], TW.bldAnchor[1]) > 900) rebuildBuildings();
    for (const a of TW.streetAreas) {
      const d = G.dist(pl.x, pl.y, a.cx, a.cy);
      const want = d < 4200;
      if (want && !a.mesh) ensureStreetMesh(a);
      if (a.mesh) a.mesh.visible = want;
    }
    // street drape onto terrain (cheap: raise group by area median height when inland)
    for (const a of TW.streetAreas) {
      if (a.mesh) a.mesh.position.y = Math.min(6, Math.max(0, elevAt(a.cx, a.cy) - 1.5));
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
      const dist = 60, up = 26;
      cp = eye.clone(); cp.x -= Math.sin(hd) * dist; cp.z -= Math.cos(hd) * dist; cp.y += up + (pl.alt || 0) * 0.2;
      TW.cam.position.copy(cp);
      TW.cam.lookAt(eye.x + Math.sin(hd) * 30, eye.y + (pl.alt || 0) * 0.5, eye.z + Math.cos(hd) * 30);
    } else if (TW.camMode === CAMS.ORBIT) {
      cp = eye.clone();
      cp.x += Math.sin(TW.orbit.yaw) * TW.orbit.dist;
      cp.z += Math.cos(TW.orbit.yaw) * TW.orbit.dist;
      cp.y += TW.orbit.dist * Math.tan(TW.orbit.pitch);
      TW.cam.position.copy(cp);
      TW.cam.lookAt(eye.x, eye.y + 10, eye.z);
    } else { // CHASE
      const dist = 26 + Math.abs(pl.v) * 1.1, up = 12;
      cp = eye.clone(); cp.x -= Math.sin(hd) * dist; cp.z -= Math.cos(hd) * dist; cp.y += up;
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
    G.emit("toast", TW.active ? "🌐 3D world — real OSM streets visible near you" : "Back to map view");
    const b = document.getElementById("b3d");
    if (b) b.style.background = TW.active ? "rgba(80,160,220,0.8)" : "";
  };

  // orbit camera drag
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

  // keyboard: F6 cycles camera mode in 3D
  G.on("key", code => {
    if (!TW.active) return;
    if (code === "F6") {
      TW.camMode = (TW.camMode + 1) % 4;
      G.emit("toast", ["🎥 Walk cam", "🎥 Chase cam", "🎥 Fly cam", "🎥 Orbit cam (drag to rotate)"][TW.camMode]);
    }
  });
})();
