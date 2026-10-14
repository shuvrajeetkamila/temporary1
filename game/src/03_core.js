// World core: projection, POI index, terrain queries, region meta
"use strict";
(function () {
  const G = window.G, GEO = G.GEO;

  // ---------------- PROJECTION (meters, +x east, +y south) ----------------
  const MLAT = 111320 * Math.cos(19.1 * Math.PI / 180); // ~105175 m/deg lon at 19.1N
  const MLON = 110574;                                   // m/deg lat
  const C = GEO.CENTER;
  G.PROJ = {
    MLAT, MLON,
    lonToX: lon => (lon - C.lo) * MLAT,
    latToY: lat => (C.la - lat) * MLON,
    xToLon: x => x / MLAT + C.lo,
    yToLat: y => C.la - y / MLON,
    lonLatToXY: (lon, lat) => [(lon - C.lo) * MLAT, (C.la - lat) * MLON],
    xyToLonLat: (x, y) => [x / MLAT + C.lo, C.la - y / MLON]
  };

  // ---------------- PREP GEOMETRY (to meters) ----------------
  const P = G.PROJ;
  const prepPoly = pts => pts.map(p => [P.lonToX(p[0]), P.latToY(p[1])]);
  const bbox = pts => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return [x0, y0, x1, y1];
  };
  const W = {};
  W.land = GEO.LAND.map(l => ({ n: l.n, pts: prepPoly(l.pts), bb: bbox(prepPoly(l.pts)) }));
  W.islands = GEO.ISLANDS.map(l => ({ n: l.n, pts: prepPoly(l.pts), bb: bbox(prepPoly(l.pts)) }));
  W.water = GEO.WATER_LINES.map(w => ({ n: w.n, w: w.w * 0.5, tidal: w.tidal ? 1 : 0, pts: prepPoly(w.pts), bb: bbox(prepPoly(w.pts)) }));
  W.lakes = GEO.LAKES.map(l => ({ n: l.n, pts: prepPoly(l.pts), bb: bbox(prepPoly(l.pts)) }));
  W.hills = GEO.HILLS.map(h => ({ n: h.n, h: h.h, pts: prepPoly(h.pts), bb: bbox(prepPoly(h.pts)) }));
  W.forest = GEO.FORESTS.map(f => ({ n: f.n, pts: prepPoly(f.pts), bb: bbox(prepPoly(f.pts)) }));
  W.roads = GEO.ROADS.map(r => ({ n: r.n, cls: r.cls, pts: prepPoly(r.pts), bb: bbox(prepPoly(r.pts)) }));
  W.rails = GEO.RAILS.map(l => ({ n: l.n, kind: l.kind, pts: prepPoly(l.pts), st: l.st.map((s, i) => ({ n: s, ...stPos(l, i) })), bb: bbox(prepPoly(l.pts)) }));
  function stPos(line, i) {
    // station i at fraction (i+0.5)/n along line — good enough for rail rendering
    const pts = prepPoly(line.pts), f = (i + 0.5) / line.st.length;
    let total = 0; const segs = [];
    for (let j = 0; j < pts.length - 1; j++) { const d = G.dist(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1]); segs.push(d); total += d; }
    let target = f * total;
    for (let j = 0; j < segs.length; j++) {
      if (target <= segs[j]) { const t = segs[j] ? target / segs[j] : 0; return { x: G.lerp(pts[j][0], pts[j + 1][0], t), y: G.lerp(pts[j][1], pts[j + 1][1], t) }; }
      target -= segs[j];
    }
    const last = pts[pts.length - 1]; return { x: last[0], y: last[1] };
  }
  W.airports = GEO.AIRPORTS.map(a => ({ n: a.n, big: a.big, pts: prepPoly(a.rwy), bb: bbox(prepPoly(a.rwy)) }));
  W.helipads = GEO.HELIPADS.map(h => ({ n: h.n, x: P.lonToX(h.lon), y: P.latToY(h.lat) }));
  W.ferries = GEO.FERRIES;
  W.landmarks = GEO.LANDMARKS.map(l => ({ n: l.n, a: l.a, x: P.lonToX(l.lon), y: P.latToY(l.lat) }));
  W.regionLabels = GEO.REGION_LABELS.map(l => ({ n: l.n, s: l.s, x: P.lonToX(l.lon), y: P.latToY(l.lat) }));
  G.W = W;
  G.bbox = bbox;

  // ---------------- POI INDEX ----------------
  const pois = typeof POIS !== "undefined" ? POIS : [];
  const CATMETA = {
    locality: { label: "Locality", col: "#e8c46b" }, rail: { label: "Rail / Metro", col: "#7fd3ff" },
    beach: { label: "Beach", col: "#ffd97f" }, fort: { label: "Fort / Heritage", col: "#d9a06b" },
    port: { label: "Port / Dock", col: "#9fb6ff" }, island: { label: "Island", col: "#a5ffd6" },
    lake: { label: "Lake", col: "#8fd8ff" }, dam: { label: "Dam / Reservoir", col: "#8fd8ff" },
    water: { label: "Creek / River", col: "#8fd8ff" }, nature: { label: "Park / Hills", col: "#9fdd8a" },
    market: { label: "Market / Mall", col: "#ffb0c8" }, temple: { label: "Place of Worship", col: "#ffc46b" },
    stadium: { label: "Stadium / Ground", col: "#c8ffb0" }, campus: { label: "Campus", col: "#d0b0ff" },
    airport: { label: "Airport", col: "#ffffff" }, heliport: { label: "Heliport", col: "#ffffff" },
    bridge: { label: "Bridge / Flyover", col: "#c0c0ff" }, industry: { label: "Industry / Power", col: "#b8b8b8" }
  };
  const REGIONS = [
    { id: "south mumbai", label: "South Mumbai — Island City", col: "#ffb3a0" },
    { id: "western suburbs", label: "Western Suburbs", col: "#ffd97f" },
    { id: "eastern suburbs", label: "Eastern Suburbs & Harbour", col: "#a0e0b0" },
    { id: "thane", label: "Thane & Creek Fringe", col: "#a0d0ff" },
    { id: "bhiwandi kalyan", label: "Bhiwandi & Kalyan Belt", col: "#e0b0ff" },
    { id: "vasai virar", label: "Vasai-Virar", col: "#ffcfa0" },
    { id: "navi mumbai core", label: "Navi Mumbai Core", col: "#b0f0d0" },
    { id: "kharghar panvel", label: "Kharghar & Panvel", col: "#d0ffb0" },
    { id: "uran jnpt", label: "Uran & JNPT Port", col: "#b0c8ff" },
    { id: "raigad fringe", label: "Raigad Fringe", col: "#ffe0b0" }
  ];
  const RMAP = {}; REGIONS.forEach(r => RMAP[r.id] = r);

  const POI = G.POI = {
    all: pois.map(p => {
      const xy = P.lonLatToXY(p.lo, p.la);
      return {
        name: p.n, region: p.r, cat: p.c || "locality", x: xy[0], y: xy[1],
        lat: p.la, lon: p.lo, elev: Math.min(120, p.el || 5),
        pos: p.pos, moment: p.moment, landmark: p.landmark, figure: p.figure,
        community: p.community, sounds: p.sounds, smells: p.smells,
        drama: p.drama, traffic: p.traffic, wildlife: p.wildlife,
        visited: false
      };
    }),
    grid: new Map(), CELL: 1500,
    key: (cx, cy) => cx + "," + cy,
    cellOf(x, y) { return [Math.floor(x / this.CELL), Math.floor(y / this.CELL)]; },
    build() {
      for (const p of this.all) {
        const [cx, cy] = this.cellOf(p.x, p.y);
        const k = this.key(cx, cy);
        (this.grid.get(k) || this.grid.set(k, []).get(k)).push(p);
      }
    },
    nearby(x, y, r) {
      const rad = Math.ceil(r / this.CELL), [cx, cy] = this.cellOf(x, y), out = [];
      for (let i = -rad; i <= rad; i++) for (let j = -rad; j <= rad; j++) {
        const c = this.grid.get(this.key(cx + i, cy + j));
        if (c) for (const p of c) { p._d = G.dist(x, y, p.x, p.y); if (p._d <= r) out.push(p); }
      }
      out.sort((a, b) => a._d - b._d);
      return out;
    },
    nearest(x, y, r) { const a = this.nearby(x, y, r || 1200); return a.length ? a[0] : null; },
    search(q) {
      q = q.toLowerCase(); const out = [];
      for (const p of this.all) if (p.name.toLowerCase().includes(q)) out.push(p);
      return out.slice(0, 80);
    }
  };
  G.CATMETA = CATMETA; G.REGIONS = REGIONS; G.RMAP = RMAP;

  // ---------------- TERRAIN QUERIES ----------------
  const inAny = (x, y, arr) => {
    for (const poly of arr) {
      const b = poly.bb;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (G.inPoly(x, y, poly.pts)) return poly;
    }
    return null;
  };
  G.TERRAIN = {
    landAt(x, y) { return inAny(x, y, W.land) || inAny(x, y, W.islands); },
    waterLineAt(x, y, tide) {
      for (const wl of W.water) {
        const b = wl.bb, grow = wl.tidal ? (wl.w * 0.35 * tide) : 0;
        if (x < b[0] - grow - 50 || x > b[2] + grow + 50 || y < b[1] - grow - 50 || y > b[3] + grow + 50) continue;
        if (G.polyDist(x, y, wl.pts) < wl.w + grow) return wl;
      }
      return null;
    },
    lakeAt(x, y) { return inAny(x, y, W.lakes); },
    forestAt(x, y) { return inAny(x, y, W.forest); },
    hillAt(x, y) { return inAny(x, y, W.hills); },
    waterAt(x, y, tide) { return !this.landAt(x, y) || this.waterLineAt(x, y, tide) || this.lakeAt(x, y); },
    depth(x, y, tide) {
      if (this.lakeAt(x, y)) return 3;
      if (!this.landAt(x, y)) return 8 + tide * 1.5;
      const wl = this.waterLineAt(x, y, tide);
      if (wl) return Math.min(4, (wl.w + wl.tidal * wl.w * 0.35 * tide - G.polyDist(x, y, wl.pts)) / 60 + 0.4);
      return 0;
    },
    elev(x, y) {
      let e = 3;
      const h = this.hillAt(x, y);
      if (h) e = Math.max(e, h.h * (0.55 + 0.45 * G.hash2(Math.round(x / 500), Math.round(y / 500))));
      const p = POI.nearest(x, y, 2500);
      if (p) e = Math.max(e, Math.min(p.elev, 90) * (1 - p._d / 2500) + 2);
      return Math.round(e);
    },
    kindAt(x, y, tide) {
      const wl = this.waterLineAt(x, y, tide);
      if (wl) return { water: true, kind: wl.tidal ? "creek" : "river", name: wl.n };
      const lk = this.lakeAt(x, y);
      if (lk) return { water: true, kind: "lake", name: lk.n };
      if (!this.landAt(x, y)) return { water: true, kind: "sea", name: "Arabian Sea / Harbour" };
      const f = this.forestAt(x, y);
      return { water: false, kind: f ? "forest" : "land", name: f ? f.n : null };
    }
  };
})();
