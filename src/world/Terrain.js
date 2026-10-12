import * as THREE from 'three';
import { COASTLINE, ISLAND_BOUNDS } from '../data/nauruCoastline.js';
import { LAGOON, LAGOON_LEVEL, coastDistance, terrainColor, terrainHeight, terrainRockMix } from '../core/terrainModel.js';
import { createTerrainMaterial } from './MaterialLibrary.js';

export class Terrain {
  constructor(quality) {
    this.group = new THREE.Group();
    this.group.name = 'Terrain';
    this.mesh = this.#buildTerrainMesh(quality.terrainStep);
    this.group.add(this.mesh);
    this.reef = this.#buildReefShelf();
    this.group.add(this.reef);
    this.foam = this.#buildShoreline();
    this.group.add(this.foam);
    this.lagoon = this.#buildLagoon();
    this.group.add(this.lagoon);
  }

  #buildTerrainMesh(step) {
    const padding = step * 1.5;
    const minX = ISLAND_BOUNDS.minX - padding;
    const maxX = ISLAND_BOUNDS.maxX + padding;
    const minZ = ISLAND_BOUNDS.minZ - padding;
    const maxZ = ISLAND_BOUNDS.maxZ + padding;
    const cols = Math.ceil((maxX - minX) / step) + 1;
    const rows = Math.ceil((maxZ - minZ) / step) + 1;
    const dx = (maxX - minX) / (cols - 1);
    const dz = (maxZ - minZ) / (rows - 1);
    const positions = new Float32Array(cols * rows * 3);
    const colors = new Float32Array(cols * rows * 3);
    const uvs = new Float32Array(cols * rows * 2);
    const rockMix = new Float32Array(cols * rows);
    const color = { r: 0, g: 0, b: 0 };

    for (let row = 0; row < rows; row += 1) {
      const z = minZ + row * dz;
      for (let col = 0; col < cols; col += 1) {
        const x = minX + col * dx;
        const index = (row * cols + col) * 3;
        positions[index] = x;
        positions[index + 1] = terrainHeight(x, z);
        positions[index + 2] = z;
        terrainColor(x, z, color);
        colors[index] = color.r;
        colors[index + 1] = color.g;
        colors[index + 2] = color.b;
        const vertexIndex = row * cols + col;
        uvs[vertexIndex * 2] = (x - minX) / (maxX - minX);
        uvs[vertexIndex * 2 + 1] = (z - minZ) / (maxZ - minZ);
        rockMix[vertexIndex] = terrainRockMix(x, z);
      }
    }

    const indices = [];
    for (let row = 0; row < rows - 1; row += 1) {
      for (let col = 0; col < cols - 1; col += 1) {
        const cx = minX + (col + 0.5) * dx;
        const cz = minZ + (row + 0.5) * dz;
        if (coastDistance(cx, cz) < -step * 0.72) continue;
        const a = row * cols + col;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('rockMix', new THREE.BufferAttribute(rockMix, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = createTerrainMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Nauru terrain (${step}m grid)`;
    mesh.receiveShadow = true;
    return mesh;
  }

  #buildReefShelf() {
    const positions = [];
    const colors = [];
    const indices = [];
    for (let i = 0; i < COASTLINE.length; i += 1) {
      const [x, z] = COASTLINE[i];
      const length = Math.hypot(x, z) || 1;
      const nx = x / length;
      const nz = z / length;
      positions.push(x - nx * 18, .2, z - nz * 18, x + nx * 155, -.16, z + nz * 155);
      colors.push(.24, .9, .82, .04, .42, .54);
    }
    for (let i = 0; i < COASTLINE.length; i += 1) {
      const next = (i + 1) % COASTLINE.length;
      const a = i * 2;
      const b = a + 1;
      const c = next * 2;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: .72,
      roughness: .16,
      metalness: 0,
      transmission: .08,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const reef = new THREE.Mesh(geometry, material);
    reef.name = 'Shallow coral reef shelf';
    reef.renderOrder = -1;
    return reef;
  }

  #buildShoreline() {
    const positions = [];
    const indices = [];
    for (let i = 0; i < COASTLINE.length; i += 1) {
      const previous = COASTLINE[(i - 1 + COASTLINE.length) % COASTLINE.length];
      const next = COASTLINE[(i + 1) % COASTLINE.length];
      const [x, z] = COASTLINE[i];
      const tx = next[0] - previous[0];
      const tz = next[1] - previous[1];
      const length = Math.hypot(tx, tz) || 1;
      const nx = -tz / length;
      const nz = tx / length;
      positions.push(x - nx * 2.8, .38, z - nz * 2.8, x + nx * 2.8, .39, z + nz * 2.8);
    }
    for (let i = 0; i < COASTLINE.length; i += 1) {
      const next = (i + 1) % COASTLINE.length;
      const a = i * 2;
      const b = a + 1;
      const c = next * 2;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    const material = new THREE.MeshBasicMaterial({ color: 0xe9fff8, transparent: true, opacity: .62, depthWrite: false, side: THREE.DoubleSide });
    const foam = new THREE.Mesh(geometry, material);
    foam.name = 'Breaking shoreline foam';
    foam.renderOrder = 3;
    return foam;
  }

  #buildLagoon() {
    const geometry = new THREE.CircleGeometry(1, 64);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x217f78,
      roughness: 0.18,
      metalness: 0.05,
      transmission: 0.08,
      transparent: true,
      opacity: 0.9,
      depthWrite: true,
    });
    const water = new THREE.Mesh(geometry, material);
    water.position.set(LAGOON.x, LAGOON_LEVEL, LAGOON.z);
    water.scale.set(LAGOON.radiusX, 1, LAGOON.radiusZ);
    water.rotation.y = -LAGOON.angle;
    water.name = 'Buada Lagoon';
    return water;
  }

  update(elapsed) {
    const material = this.lagoon.material;
    material.roughness = 0.16 + Math.sin(elapsed * 0.7) * 0.025;
    this.foam.material.opacity = .54 + Math.sin(elapsed * 1.15) * .1;
    this.reef.material.opacity = .68 + Math.sin(elapsed * .32) * .035;
  }

  get triangleCount() { return (this.mesh.geometry.index?.count || 0) / 3; }
}
