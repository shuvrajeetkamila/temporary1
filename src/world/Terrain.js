import * as THREE from 'three';
import { COASTLINE, ISLAND_BOUNDS } from '../data/nauruCoastline.js';
import { LAGOON, LAGOON_LEVEL, coastDistance, terrainColor, terrainHeight } from '../core/terrainModel.js';

export class Terrain {
  constructor(quality) {
    this.group = new THREE.Group();
    this.group.name = 'Terrain';
    this.mesh = this.#buildTerrainMesh(quality.terrainStep);
    this.group.add(this.mesh);
    this.group.add(this.#buildShoreline());
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
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Nauru terrain (${step}m grid)`;
    mesh.receiveShadow = true;
    return mesh;
  }

  #buildShoreline() {
    const points = COASTLINE.map(([x, z]) => new THREE.Vector3(x, 0.32, z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xd8fff2, transparent: true, opacity: 0.5 });
    const line = new THREE.LineLoop(geometry, material);
    line.name = 'Reef edge foam';
    return line;
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
  }

  get triangleCount() { return (this.mesh.geometry.index?.count || 0) / 3; }
}
