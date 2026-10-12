import * as THREE from 'three';
import { Terrain } from './Terrain.js';
import { Ocean } from './Ocean.js';
import { Roads } from './Roads.js';
import { Environment } from './Environment.js';
import { Atmosphere } from './Atmosphere.js';
import { coastDistance, terrainHeight, terrainNormal, terrainRegion } from '../core/terrainModel.js';
import { LANDMARKS } from '../data/landmarks.js';
import { DISTRICT_POLYGONS } from '../data/nauruDistricts.js';
import { pointInPolygon } from '../core/math.js';

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'NAURU — 1 unit = 1 metre';
    scene.add(this.root);

    this.terrain = new Terrain(quality);
    this.ocean = new Ocean(quality);
    this.roads = new Roads(quality);
    this.root.add(this.ocean.mesh);
    this.root.add(this.terrain.group);
    this.root.add(this.roads.group);
    this.environment = new Environment(scene, this.roads, quality);
    this.atmosphere = new Atmosphere(scene, quality, this.ocean);
  }

  update(dt, elapsed, focusPosition) {
    this.terrain.update(elapsed);
    this.ocean.update(elapsed);
    this.environment.update(focusPosition, dt);
    this.atmosphere.update(dt, focusPosition, elapsed);
  }

  heightAt(x, z) { return terrainHeight(x, z); }
  normalAt(x, z) { return terrainNormal(x, z); }
  coastDistanceAt(x, z) { return coastDistance(x, z); }
  regionAt(x, z) { return terrainRegion(x, z); }
  roadDistanceAt(x, z) { return this.roads.distanceToRoad(x, z); }
  surfaceAt(x, z) { return this.roads.surfaceAt(x, z); }

  locationAt(x, z) {
    const landmark = LANDMARKS
      .map((entry) => ({ ...entry, distance: Math.hypot(x - entry.x, z - entry.z) }))
      .filter((entry) => entry.distance < entry.radius)
      .sort((a, b) => a.distance - b.distance)[0];
    if (landmark) return { id: landmark.id, name: landmark.district.toUpperCase(), detail: landmark.name, landmark };
    const coast = coastDistance(x, z);
    if (coast < -5) return { id: 'ocean', name: 'PACIFIC OCEAN', detail: 'Nauru coastal waters', landmark: null };
    const district = DISTRICT_POLYGONS.find((entry) => pointInPolygon(x, z, entry.points));
    const districtName = district?.name || 'Nauru';
    return {
      id: districtName.toLowerCase(),
      name: districtName.toUpperCase(),
      detail: coast > 630 ? 'Topside phosphate plateau' : coast < 520 ? 'Coastal settlement belt' : 'Island uplands',
      landmark: null,
    };
  }

  setQuality(quality) {
    this.quality = quality;
    this.environment.setQuality(quality);
    this.atmosphere.setQuality(quality);
  }

  get stats() {
    return {
      activeSectors: this.environment.activeCount,
      totalSectors: this.environment.totalSectors,
      loadedSectors: this.environment.loadedSectors,
      terrainTriangles: this.terrain.triangleCount,
    };
  }
}
