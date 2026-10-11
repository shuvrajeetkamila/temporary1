export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inverseLerp = (a, b, value) => clamp((value - a) / (b - a), 0, 1);
export const smoothstep = (a, b, value) => {
  const t = inverseLerp(a, b, value);
  return t * t * (3 - 2 * t);
};
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
export const dampAngle = (current, target, lambda, dt) => current + wrapAngle(target - current) * (1 - Math.exp(-lambda * dt));

export function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const crosses = zi > z !== zj > z;
    if (crosses && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function pointSegmentDistanceSquared(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return (px - ax) ** 2 + (pz - az) ** 2;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / lengthSq, 0, 1);
  const x = ax + dx * t;
  const z = az + dz * t;
  return (px - x) ** 2 + (pz - z) ** 2;
}

export function distanceToPolyline(x, z, points, closed = false) {
  let closestSq = Infinity;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    closestSq = Math.min(closestSq, pointSegmentDistanceSquared(x, z, a[0], a[1], b[0], b[1]));
  }
  return Math.sqrt(closestSq);
}

export function signedDistanceToPolygon(x, z, polygon) {
  const distance = distanceToPolyline(x, z, polygon, true);
  return pointInPolygon(x, z, polygon) ? distance : -distance;
}

export function closestPointOnPolyline(x, z, points, closed = false) {
  let best = { x: points[0][0], z: points[0][1], distance: Infinity, segment: 0, t: 0 };
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lengthSq = dx * dx + dz * dz || 1;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq, 0, 1);
    const cx = a[0] + dx * t;
    const cz = a[1] + dz * t;
    const distance = Math.hypot(x - cx, z - cz);
    if (distance < best.distance) best = { x: cx, z: cz, distance, segment: i, t };
  }
  return best;
}

export function hash2D(x, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise2D(x, z, scale = 1, seed = 0) {
  const sx = x / scale;
  const sz = z / scale;
  const ix = Math.floor(sx);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fz = sz - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2D(ix, iz, seed);
  const b = hash2D(ix + 1, iz, seed);
  const c = hash2D(ix, iz + 1, seed);
  const d = hash2D(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}

export function fbm2D(x, z, seed = 0) {
  return (
    valueNoise2D(x, z, 720, seed) * 0.52 +
    valueNoise2D(x, z, 310, seed + 17) * 0.28 +
    valueNoise2D(x, z, 125, seed + 43) * 0.14 +
    valueNoise2D(x, z, 52, seed + 89) * 0.06
  );
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function polylineLength(points, closed = false) {
  let total = 0;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

export function resampleClosedPolyline(points, spacing) {
  const segments = [];
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segments.push({ a, b, start: total, length });
    total += length;
  }
  const count = Math.max(3, Math.round(total / spacing));
  const result = [];
  let segmentIndex = 0;
  for (let i = 0; i < count; i += 1) {
    const target = (i / count) * total;
    while (segmentIndex < segments.length - 1 && target > segments[segmentIndex].start + segments[segmentIndex].length) segmentIndex += 1;
    const segment = segments[segmentIndex];
    const t = (target - segment.start) / (segment.length || 1);
    result.push([lerp(segment.a[0], segment.b[0], t), lerp(segment.a[1], segment.b[1], t)]);
  }
  return result;
}
