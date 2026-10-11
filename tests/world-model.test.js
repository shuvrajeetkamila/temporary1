import test from 'node:test';
import assert from 'node:assert/strict';
import { COASTLINE, ISLAND_BOUNDS } from '../src/data/nauruCoastline.js';
import { AIRPORT, airportInfluence, coastDistance, terrainHeight, terrainRegion, toRotatedLocal } from '../src/core/terrainModel.js';
import { distanceToPolyline, pointInPolygon, resampleClosedPolyline, seededRandom, signedDistanceToPolygon } from '../src/core/math.js';

test('coastline keeps Nauru at real-world metre scale', () => {
  const xs = COASTLINE.map(([x]) => x);
  const zs = COASTLINE.map(([, z]) => z);
  const width = Math.max(...xs) - Math.min(...xs);
  const length = Math.max(...zs) - Math.min(...zs);
  assert.ok(width > 5_500 && width < 5_900, `width was ${width}`);
  assert.ok(length > 5_900 && length < 6_300, `length was ${length}`);
  assert.equal(pointInPolygon(0, 0, COASTLINE), true);
  assert.equal(pointInPolygon(8_000, 0, COASTLINE), false);
});

test('signed coast distance is positive on land and negative at sea', () => {
  assert.ok(coastDistance(0, 0) > 1_000);
  assert.ok(coastDistance(ISLAND_BOUNDS.maxX + 1_000, 0) < 0);
  assert.ok(signedDistanceToPolygon(0, 0, COASTLINE) > 0);
});

test('terrain creates a low coast and elevated phosphate plateau', () => {
  const centre = terrainHeight(0, 0);
  const nearCoast = terrainHeight(2_200, 0);
  assert.ok(centre > 20, `central height was ${centre}`);
  assert.ok(nearCoast < centre, `coastal ${nearCoast} should be below ${centre}`);
  assert.equal(terrainRegion(0, 0), 'mining');
});

test('airport footprint is flattened and local transform is reversible in orientation', () => {
  assert.ok(airportInfluence(AIRPORT.x, AIRPORT.z) > .99);
  assert.ok(Math.abs(terrainHeight(AIRPORT.x, AIRPORT.z) - AIRPORT.elevation) < .01);
  const local = toRotatedLocal(AIRPORT.x + Math.cos(AIRPORT.angle) * 100, AIRPORT.z + Math.sin(AIRPORT.angle) * 100, AIRPORT.x, AIRPORT.z, AIRPORT.angle);
  assert.ok(Math.abs(local.x - 100) < .001);
  assert.ok(Math.abs(local.z) < .001);
});

test('closed polyline resampling is deterministic and evenly useful', () => {
  const square = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const samples = resampleClosedPolyline(square, 25);
  assert.equal(samples.length, 16);
  assert.ok(distanceToPolyline(50, 50, samples, true) >= 49.9);
});

test('seeded random sequence can reproduce streamed sectors', () => {
  const first = seededRandom(42);
  const second = seededRandom(42);
  const a = Array.from({ length: 8 }, first);
  const b = Array.from({ length: 8 }, second);
  assert.deepEqual(a, b);
  assert.ok(a.every((value) => value >= 0 && value < 1));
});
