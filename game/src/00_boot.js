// Island Realm: Mumbai–Navi Mumbai — boot, math utils, tiny event bus, storage
"use strict";
window.G = { ver: "0.1.0" };
(function () {
  const G = window.G;
  G.clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  G.smooth = (a, b, dt, rate) => a + (b - a) * Math.min(1, dt * rate);
  // Seeded RNG (mulberry32) — deterministic world features
  G.rng = function (seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  };
  G.hash2 = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // angle helpers (radians, screen space: 0 = +x east, PI/2 = +y south)
  G.normAng = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  G.angTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
  // tiny pub/sub
  const subs = {};
  G.on = (ev, fn) => { (subs[ev] = subs[ev] || []).push(fn); };
  G.emit = (ev, data) => { (subs[ev] || []).forEach(f => { try { f(data); } catch (e) { console.error(e); } }); };
  // safe storage (file:// WebView w/ DOM storage enabled)
  G.store = {
    get(k, d) { try { const v = localStorage.getItem("IR_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("IR_" + k, JSON.stringify(v)); } catch (e) { } }
  };
  G.fmt = {
    m(v) { return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + " km" : Math.round(v) + " m"; },
    kmh(v) { return Math.round(v * 3.6) + " km/h"; },
    alt(v) { return Math.round(v) + " m"; }
  };
  // point in polygon (raycast) for [lon,lat] or [x,y] arrays
  G.inPoly = (px, py, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  // squared distance from point to segment
  G.segDist2 = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = G.clamp(t, 0, 1);
    const cx = ax + t * dx, cy = ay + t * dy;
    return (px - cx) * (px - cx) + (py - cy) * (py - cy);
  };
  // distance (in same units) point->polyline
  G.polyDist = (px, py, pts) => {
    let d2 = Infinity;
    for (let i = 0; i < pts.length - 1; i++) d2 = Math.min(d2, G.segDist2(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    return Math.sqrt(d2);
  };
  G.requestFrame = cb => requestAnimationFrame(cb);
})();
