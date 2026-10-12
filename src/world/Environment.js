import * as THREE from 'three';
import { COASTLINE, ISLAND_BOUNDS } from '../data/nauruCoastline.js';
import { AIRPORT, airportInfluence, coastDistance, lagoonEllipticDistance, terrainHeight, terrainRegion } from '../core/terrainModel.js';
import { hash2D, seededRandom } from '../core/math.js';
import { createConcreteMaterial } from './MaterialLibrary.js';

const SECTOR_SIZE = 600;

function createPalmCrownGeometry(frondCount = 9, segments = 6) {
  const positions = [];
  const indices = [];
  for (let frond = 0; frond < frondCount; frond += 1) {
    const angle = (frond / frondCount) * Math.PI * 2 + Math.sin(frond * 17.1) * .08;
    const directionX = Math.sin(angle);
    const directionZ = Math.cos(angle);
    const sideX = Math.cos(angle);
    const sideZ = -Math.sin(angle);
    const start = positions.length / 3;
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const distance = .18 + t * 3.45;
      const width = Math.sin(t * Math.PI) * .46 + .035;
      const y = .42 - Math.pow(t, 1.45) * 1.25 + Math.sin(t * Math.PI) * .28;
      const centerX = directionX * distance;
      const centerZ = directionZ * distance;
      positions.push(centerX - sideX * width, y, centerZ - sideZ * width);
      positions.push(centerX + sideX * width, y, centerZ + sideZ * width);
    }
    for (let segment = 0; segment < segments; segment += 1) {
      const a = start + segment * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createGableRoofGeometry() {
  const positions = [
    -.5, -.5, -.5,  .5, -.5, -.5,  -.5, -.5, .5,  .5, -.5, .5,
    0, .5, -.5,  0, .5, .5,
  ];
  const indices = [0,1,4, 2,5,3, 0,4,2, 2,4,5, 1,3,4, 3,5,4, 0,2,1, 1,2,3];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const palmCrownGeometry = createPalmCrownGeometry();
const gableRoofGeometry = createGableRoofGeometry();

const materials = {
  palmTrunk: new THREE.MeshStandardMaterial({ color: 0x765334, roughness: 1 }),
  palmLeaf: new THREE.MeshStandardMaterial({ color: 0x2f713b, roughness: 0.88, emissive: 0x081b0b, emissiveIntensity: .28, side: THREE.DoubleSide }),
  treeTrunk: new THREE.MeshStandardMaterial({ color: 0x5d432c, roughness: 1 }),
  treeLeaf: new THREE.MeshStandardMaterial({ color: 0x3b7040, roughness: 1, emissive: 0x0a180b, emissiveIntensity: .3 }),
  bush: new THREE.MeshStandardMaterial({ color: 0x527947, roughness: 1, emissive: 0x081208, emissiveIntensity: .22 }),
  pinnacle: new THREE.MeshStandardMaterial({ color: 0x948a70, roughness: 1, flatShading: true }),
  roof: new THREE.MeshStandardMaterial({ color: 0x70483d, roughness: 0.88, metalness: 0.08 }),
  concrete: createConcreteMaterial(0xc8bea7),
  darkConcrete: new THREE.MeshStandardMaterial({ color: 0x706f65, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x536262, roughness: 0.62, metalness: 0.55 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x7d4329, roughness: 0.86, metalness: 0.32 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x82bdc3, roughness: 0.18, metalness: 0.12, transparent: true, opacity: 0.78 }),
  window: new THREE.MeshStandardMaterial({ color: 0x29484e, roughness: .2, metalness: .28, emissive: 0x102427, emissiveIntensity: .22 }),
  door: new THREE.MeshStandardMaterial({ color: 0x5c4938, roughness: .82 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xd9fff0, roughness: 0.3, emissive: 0x9ddfc7, emissiveIntensity: 0 }),
};

function matrixAt(x, y, z, yaw, sx, sy, sz, target = new THREE.Matrix4()) {
  const position = new THREE.Vector3(x, y, z);
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  return target.compose(position, quaternion, new THREE.Vector3(sx, sy, sz));
}

function makeInstances(geometry, material, entries, castShadow, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(entries.length, 1));
  entries.forEach((entry, index) => mesh.setMatrixAt(index, entry.matrix));
  mesh.count = entries.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}

function addBox(group, name, position, scale, material, yaw = 0, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.y = yaw;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function runwayWorld(localX, localZ) {
  const c = Math.cos(AIRPORT.angle);
  const s = Math.sin(AIRPORT.angle);
  return [AIRPORT.x + localX * c - localZ * s, AIRPORT.z + localX * s + localZ * c];
}

export class Environment {
  constructor(scene, roads, quality) {
    this.scene = scene;
    this.roads = roads;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'Streamed environment';
    this.scene.add(this.group);
    this.sectors = new Map();
    this.activeCount = 0;
    this.updateTimer = 0;
    this.#indexSectors();
    this.group.add(this.#buildUtilities());
    this.group.add(this.#buildLandmarks());
  }

  #indexSectors() {
    const minSX = Math.floor((ISLAND_BOUNDS.minX - 300) / SECTOR_SIZE);
    const maxSX = Math.ceil((ISLAND_BOUNDS.maxX + 300) / SECTOR_SIZE);
    const minSZ = Math.floor((ISLAND_BOUNDS.minZ - 300) / SECTOR_SIZE);
    const maxSZ = Math.ceil((ISLAND_BOUNDS.maxZ + 300) / SECTOR_SIZE);
    for (let sz = minSZ; sz <= maxSZ; sz += 1) {
      for (let sx = minSX; sx <= maxSX; sx += 1) {
        const x = (sx + 0.5) * SECTOR_SIZE;
        const z = (sz + 0.5) * SECTOR_SIZE;
        const intersects = coastDistance(x, z) > -SECTOR_SIZE * 0.85;
        if (intersects) this.sectors.set(`${sx}:${sz}`, { sx, sz, x, z, group: null, active: false });
      }
    }
  }

  #buildSector(sector) {
    const group = new THREE.Group();
    group.name = `Sector ${sector.sx},${sector.sz}`;
    const seed = ((sector.sx + 50) * 73856093) ^ ((sector.sz + 50) * 19349663);
    const random = seededRandom(seed);
    const cast = this.quality.shadows;
    const minX = sector.sx * SECTOR_SIZE;
    const minZ = sector.sz * SECTOR_SIZE;
    const randomPoint = () => [minX + random() * SECTOR_SIZE, minZ + random() * SECTOR_SIZE];

    const palms = [];
    const palmCrowns = [];
    const palmAttempts = Math.round(42 * this.quality.vegetation);
    for (let i = 0; i < palmAttempts; i += 1) {
      const [x, z] = randomPoint();
      const coast = coastDistance(x, z);
      if (coast < 40 || coast > 720 || this.roads.distanceToRoad(x, z) < 13 || airportInfluence(x, z) > 0.4) continue;
      const height = 5.5 + random() * 4.8;
      const yaw = random() * Math.PI * 2;
      const y = terrainHeight(x, z);
      palms.push({ matrix: matrixAt(x, y + height * 0.5, z, yaw, 0.8 + random() * 0.5, height, 0.8 + random() * 0.5) });
      palmCrowns.push({ matrix: matrixAt(x, y + height + 1.0, z, yaw, .8 + random() * .26, .8 + random() * .2, .8 + random() * .26) });
    }
    if (palms.length) {
      group.add(makeInstances(new THREE.CylinderGeometry(0.24, 0.42, 1, 7), materials.palmTrunk, palms, cast, 'Coconut palm trunks'));
      group.add(makeInstances(palmCrownGeometry, materials.palmLeaf, palmCrowns, cast, 'Coconut palm fronds'));
    }

    const treeTrunks = [];
    const treeCrowns = [];
    const bushes = [];
    const treeAttempts = Math.round(33 * this.quality.vegetation);
    for (let i = 0; i < treeAttempts; i += 1) {
      const [x, z] = randomPoint();
      const coast = coastDistance(x, z);
      if (coast < 170 || coast > 1250 || this.roads.distanceToRoad(x, z) < 10 || lagoonEllipticDistance(x, z) < 1.18 || airportInfluence(x, z) > .18) continue;
      if (terrainRegion(x, z) === 'mining' && random() < 0.58) continue;
      const h = 3.5 + random() * 5;
      const y = terrainHeight(x, z);
      treeTrunks.push({ matrix: matrixAt(x, y + h * 0.45, z, random() * 6.28, .7, h * .9, .7) });
      treeCrowns.push({ matrix: matrixAt(x, y + h, z, random() * 6.28, 2.2 + random(), 1.8 + random() * .7, 2.2 + random()) });
      if (random() > .55) bushes.push({ matrix: matrixAt(x + random() * 5, y + .7, z + random() * 5, random() * 6.28, 1.3, .9, 1.3) });
    }
    if (treeTrunks.length) {
      group.add(makeInstances(new THREE.CylinderGeometry(.3, .45, 1, 6), materials.treeTrunk, treeTrunks, cast, 'Tropical tree trunks'));
      group.add(makeInstances(new THREE.IcosahedronGeometry(1, 1), materials.treeLeaf, treeCrowns, cast, 'Tropical tree canopies'));
    }
    if (bushes.length) group.add(makeInstances(new THREE.IcosahedronGeometry(1, 1), materials.bush, bushes, false, 'Understory bushes'));

    const walls = [];
    const roofs = [];
    const windows = [];
    const doors = [];
    const buildingAttempts = Math.round(92 * this.quality.buildings);
    for (let i = 0; i < buildingAttempts; i += 1) {
      const [x, z] = randomPoint();
      const coast = coastDistance(x, z);
      const roadDistance = this.roads.distanceToRoad(x, z);
      if (coast < 80 || coast > 620 || roadDistance < 15 || roadDistance > 88 || airportInfluence(x, z) > .28) continue;
      const width = 7 + random() * 12;
      const depth = 7 + random() * 9;
      const height = 3.1 + random() * 2.7;
      const yaw = Math.atan2(x, z) + (random() - .5) * .24;
      const y = terrainHeight(x, z);
      const frontX = Math.sin(yaw);
      const frontZ = Math.cos(yaw);
      walls.push({ matrix: matrixAt(x, y + height * 0.5, z, yaw, width, height, depth) });
      roofs.push({ matrix: matrixAt(x, y + height + .65, z, yaw, width + 1.2, 1.4, depth + 1.2) });
      windows.push({ matrix: matrixAt(x + frontX * (depth * .5 + .07), y + height * .62, z + frontZ * (depth * .5 + .07), yaw, width * .52, Math.min(1.25, height * .28), .12) });
      doors.push({ matrix: matrixAt(x + frontX * (depth * .5 + .13) - Math.cos(yaw) * width * .28, y + 1.05, z + frontZ * (depth * .5 + .13) + Math.sin(yaw) * width * .28, yaw, .95, 2.1, .14) });
      if (walls.length >= Math.round(12 * this.quality.buildings)) break;
    }
    if (walls.length) {
      const wallMesh = makeInstances(new THREE.BoxGeometry(1, 1, 1), materials.concrete, walls, cast, 'Weathered coastal houses');
      const colors = [0xe1d1ae, 0xc9d3bf, 0xd3c7af, 0xbfd0cf, 0xd6baa1];
      walls.forEach((_, i) => wallMesh.setColorAt(i, new THREE.Color(colors[Math.floor(random() * colors.length)])));
      if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
      group.add(wallMesh);
      group.add(makeInstances(gableRoofGeometry, materials.roof, roofs, cast, 'Corrugated gable roofs'));
      group.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), materials.window, windows, false, 'House windows'));
      group.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), materials.door, doors, false, 'House doors'));
    }

    const pinnacles = [];
    const pinnacleAttempts = Math.round(56 * this.quality.vegetation);
    for (let i = 0; i < pinnacleAttempts; i += 1) {
      const [x, z] = randomPoint();
      if (coastDistance(x, z) < 690 || lagoonEllipticDistance(x, z) < 1.8 || this.roads.distanceToRoad(x, z) < 9) continue;
      const h = 1.8 + random() * 5;
      const y = terrainHeight(x, z);
      pinnacles.push({ matrix: matrixAt(x, y + h * .5, z, random() * 6.28, .7 + random() * 1.3, h, .7 + random() * 1.3) });
    }
    if (pinnacles.length) group.add(makeInstances(new THREE.ConeGeometry(.8, 1, 5), materials.pinnacle, pinnacles, cast, 'Exposed coral pinnacles'));

    return group;
  }

  #buildUtilities() {
    const group = new THREE.Group();
    group.name = 'Ring road utilities';
    const poles = [];
    const crossbars = [];
    const wireLeft = [];
    const wireRight = [];
    for (let i = 0; i < this.roads.ringPath.length; i += 7) {
      const point = this.roads.ringPath[i];
      const next = this.roads.ringPath[(i + 1) % this.roads.ringPath.length];
      const tx = next[0] - point[0];
      const tz = next[1] - point[1];
      const len = Math.hypot(tx, tz) || 1;
      const x = point[0] - (tz / len) * 10;
      const z = point[1] + (tx / len) * 10;
      const y = terrainHeight(x, z);
      const yaw = Math.atan2(tx, tz);
      poles.push({ matrix: matrixAt(x, y + 4.3, z, yaw, 1, 8.6, 1) });
      crossbars.push({ matrix: matrixAt(x, y + 8.2, z, yaw, 4.5, .25, .25) });
      const sideX = Math.cos(yaw) * 1.65;
      const sideZ = -Math.sin(yaw) * 1.65;
      wireLeft.push(new THREE.Vector3(x - sideX, y + 8.28, z - sideZ));
      wireRight.push(new THREE.Vector3(x + sideX, y + 8.28, z + sideZ));
    }
    group.add(makeInstances(new THREE.CylinderGeometry(.11, .16, 1, 6), materials.treeTrunk, poles, this.quality.shadows, 'Utility poles'));
    group.add(makeInstances(new THREE.BoxGeometry(1, 1, 1), materials.darkConcrete, crossbars, false, 'Utility crossbars'));
    const wireMaterial = new THREE.LineBasicMaterial({ color: 0x222827, transparent: true, opacity: .82 });
    const leftWire = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(wireLeft), wireMaterial);
    const rightWire = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(wireRight), wireMaterial);
    leftWire.name = 'Power distribution wire';
    rightWire.name = 'Power distribution wire';
    group.add(leftWire, rightWire);
    return group;
  }

  #buildLandmarks() {
    const group = new THREE.Group();
    group.name = 'Persistent landmarks';
    const shadow = this.quality.shadows;

    // Original modular airport terminal and control tower.
    const [terminalX, terminalZ] = runwayWorld(-260, -165);
    const terminalY = terrainHeight(terminalX, terminalZ);
    addBox(group, 'Airport terminal', [terminalX, terminalY + 6, terminalZ], [145, 12, 30], materials.concrete, -AIRPORT.angle, shadow);
    addBox(group, 'Terminal glass frontage', ...[[terminalX + Math.sin(AIRPORT.angle) * 15, terminalY + 6, terminalZ - Math.cos(AIRPORT.angle) * 15], [110, 6, 1.2], materials.glass, -AIRPORT.angle, false]);
    const [towerX, towerZ] = runwayWorld(-180, -190);
    const towerY = terrainHeight(towerX, towerZ);
    addBox(group, 'Control tower', [towerX, towerY + 10, towerZ], [9, 20, 9], materials.concrete, -AIRPORT.angle, shadow);
    addBox(group, 'Control cab', [towerX, towerY + 21, towerZ], [14, 5, 14], materials.glass, -AIRPORT.angle, shadow);
    const [hangarX, hangarZ] = runwayWorld(-600, -175);
    addBox(group, 'Airport utility hangar', [hangarX, terrainHeight(hangarX, hangarZ) + 8, hangarZ], [70, 16, 42], materials.metal, -AIRPORT.angle, shadow);

    // Civic precinct, placed in Yaren beside the airport district.
    const civicY = terrainHeight(-1450, 2250);
    addBox(group, 'Civic centre main hall', [-1450, civicY + 7, 2250], [74, 14, 46], materials.concrete, .08, shadow);
    addBox(group, 'Civic centre roof', [-1450, civicY + 14.8, 2250], [82, 1.4, 53], materials.roof, .08, shadow);
    addBox(group, 'Civic arcade', [-1452, civicY + 3.6, 2225], [60, 7, 4], materials.glass, .08, false);

    // Aiwo harbour and original cantilever-inspired loading remnant.
    const harbourY = Math.max(1.2, terrainHeight(-2500, 380));
    addBox(group, 'Aiwo harbour quay', [-2640, 1.4, 380], [310, 2.8, 50], materials.darkConcrete, 0, false);
    addBox(group, 'Harbour warehouse', [-2450, harbourY + 7, 440], [80, 14, 38], materials.metal, -.1, shadow);
    addBox(group, 'Phosphate loader remnant', [-2705, 12, 330], [185, 4, 5], materials.rust, -.05, shadow);
    addBox(group, 'Loader support A', [-2635, 7, 330], [4, 14, 4], materials.rust, 0, shadow);
    addBox(group, 'Loader support B', [-2740, 7, 335], [4, 14, 4], materials.rust, 0, shadow);

    // Topside mining infrastructure tells the industrial history without copying a real structure.
    const mineY = terrainHeight(20, -600);
    addBox(group, 'Topside processing ruin', [20, mineY + 9, -600], [46, 18, 30], materials.rust, .22, shadow);
    addBox(group, 'Topside hopper', [55, mineY + 18, -575], [15, 24, 15], materials.metal, .22, shadow);
    addBox(group, 'Topside conveyor', [-35, mineY + 16, -620], [120, 3, 7], materials.rust, .22, shadow);

    // Command Ridge lookout and beach shelters.
    const ridgeY = terrainHeight(-1080, -240);
    addBox(group, 'Command Ridge lookout', [-1080, ridgeY + 3, -240], [18, 6, 12], materials.darkConcrete, -.4, shadow);
    const bayY = terrainHeight(2040, 360);
    for (let i = -2; i <= 2; i += 1) {
      addBox(group, 'Anibare beach shelter', [2040 + i * 34, bayY + 1.4, 360 + i * 8], [12, .7, 9], materials.roof, -.2, shadow);
      addBox(group, 'Beach shelter post', [2040 + i * 34, bayY, 360 + i * 8], [.7, 3.8, .7], materials.treeTrunk, -.2, shadow);
    }
    return group;
  }

  update(playerPosition, dt, force = false) {
    this.updateTimer -= dt;
    if (this.updateTimer > 0 && !force) return;
    this.updateTimer = 0.45;
    const radius = this.quality.sectorRadius;
    let active = 0;
    for (const sector of this.sectors.values()) {
      const near = Math.abs(sector.x - playerPosition.x) < radius + SECTOR_SIZE * .5 && Math.abs(sector.z - playerPosition.z) < radius + SECTOR_SIZE * .5;
      if (near && !sector.group) {
        sector.group = this.#buildSector(sector);
        this.group.add(sector.group);
      }
      if (sector.group) sector.group.visible = near;
      sector.active = near;
      if (near) active += 1;
    }
    this.activeCount = active;
  }

  setQuality(quality) { this.quality = quality; }
  get totalSectors() { return this.sectors.size; }
  get loadedSectors() { return [...this.sectors.values()].filter((sector) => sector.group).length; }
}

export { SECTOR_SIZE };
