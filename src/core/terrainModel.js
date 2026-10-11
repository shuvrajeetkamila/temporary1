import { COASTLINE } from '../data/nauruCoastline.js';
import { clamp, fbm2D, lerp, signedDistanceToPolygon, smoothstep, valueNoise2D } from './math.js';

export const SEA_LEVEL = 0;
export const LAGOON_LEVEL = 13.8;
export const AIRPORT = Object.freeze({ x: -450, z: 1870, angle: 0.18, length: 2250, runwayWidth: 46, apronWidth: 230, elevation: 4.2 });
export const LAGOON = Object.freeze({ x: -650, z: 420, radiusX: 250, radiusZ: 135, angle: -0.18 });

export function toRotatedLocal(x, z, originX, originZ, angle) {
  const dx = x - originX;
  const dz = z - originZ;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: dx * c + dz * s, z: -dx * s + dz * c };
}

export function airportInfluence(x, z) {
  const local = toRotatedLocal(x, z, AIRPORT.x, AIRPORT.z, AIRPORT.angle);
  const dx = Math.max(Math.abs(local.x) - AIRPORT.length * 0.57, 0);
  const dz = Math.max(Math.abs(local.z) - AIRPORT.apronWidth * 0.5, 0);
  const outside = Math.hypot(dx, dz);
  const inside = Math.abs(local.x) <= AIRPORT.length * 0.57 && Math.abs(local.z) <= AIRPORT.apronWidth * 0.5;
  return inside ? 1 : 1 - smoothstep(0, 150, outside);
}

export function lagoonEllipticDistance(x, z) {
  const local = toRotatedLocal(x, z, LAGOON.x, LAGOON.z, LAGOON.angle);
  return Math.hypot(local.x / LAGOON.radiusX, local.z / LAGOON.radiusZ);
}

export function coastDistance(x, z) {
  return signedDistanceToPolygon(x, z, COASTLINE);
}

export function terrainHeight(x, z) {
  const coast = coastDistance(x, z);
  if (coast < -130) return -7 - Math.min(12, Math.abs(coast) * 0.012);

  const broad = fbm2D(x, z, 904);
  const detail = valueNoise2D(x, z, 68, 421);
  const beachRise = smoothstep(8, 190, coast);
  const plateau = smoothstep(230, 820, coast);
  let height = 1.0 + beachRise * 4.2 + plateau * (31 + broad * 7.5);
  height += broad * (0.5 + plateau * 4.2) + detail * (0.15 + plateau * 1.2);

  // Most of Topside is deliberately scarred and irregular rather than generic desert.
  if (coast > 650) {
    const miningNoise = Math.abs(valueNoise2D(x, z, 110, 1907));
    height += smoothstep(650, 1050, coast) * (miningNoise * 4.5 - 1.2);
  }

  // Buada's central depression is blended into the plateau before the water mesh is laid down.
  const lagoonDistance = lagoonEllipticDistance(x, z);
  if (lagoonDistance < 1.75) {
    const blend = 1 - smoothstep(0.92, 1.75, lagoonDistance);
    const bed = LAGOON_LEVEL - 2.4 + Math.min(1, lagoonDistance) * 0.9;
    height = lerp(height, bed, blend);
  }

  const runwayBlend = airportInfluence(x, z);
  height = lerp(height, AIRPORT.elevation, runwayBlend);

  if (coast < 0) height = lerp(0.15, height, smoothstep(-130, 0, coast));
  return height;
}

export function terrainNormal(x, z, sample = 2.5) {
  const left = terrainHeight(x - sample, z);
  const right = terrainHeight(x + sample, z);
  const back = terrainHeight(x, z - sample);
  const front = terrainHeight(x, z + sample);
  let nx = left - right;
  let ny = sample * 2;
  let nz = back - front;
  const length = Math.hypot(nx, ny, nz) || 1;
  nx /= length; ny /= length; nz /= length;
  return { x: nx, y: ny, z: nz };
}

export function terrainRegion(x, z) {
  const coast = coastDistance(x, z);
  if (coast < 0) return 'ocean';
  if (airportInfluence(x, z) > 0.55) return 'airport';
  if (lagoonEllipticDistance(x, z) < 1.02) return 'lagoon';
  if (coast < 105) return 'beach';
  if (coast < 470) return 'coastal';
  if (coast > 720) return 'mining';
  return 'upland';
}

export function terrainColor(x, z, target = { r: 0, g: 0, b: 0 }) {
  const coast = coastDistance(x, z);
  const region = terrainRegion(x, z);
  const noise = clamp(valueNoise2D(x, z, 85, 713) * 0.5 + 0.5, 0, 1);
  const palette = {
    ocean: [0.47, 0.55, 0.43], beach: [0.73, 0.64, 0.39], coastal: [0.22, 0.43, 0.19],
    upland: [0.26, 0.38, 0.18], mining: [0.43, 0.39, 0.29], airport: [0.34, 0.42, 0.25], lagoon: [0.3, 0.34, 0.2],
  };
  const base = palette[region];
  let shade = 0.88 + noise * 0.22;
  if (coast >= 0 && coast < 45) shade += 0.1;
  target.r = clamp(base[0] * shade, 0, 1);
  target.g = clamp(base[1] * shade, 0, 1);
  target.b = clamp(base[2] * shade, 0, 1);
  return target;
}
