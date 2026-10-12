import * as THREE from 'three';
import { COASTLINE } from '../data/nauruCoastline.js';
import { AIRPORT, terrainHeight, toRotatedLocal } from '../core/terrainModel.js';
import { closestPointOnPolyline, distanceToPolyline } from '../core/math.js';
import { createAsphaltMaterial, createShoulderMaterial } from './MaterialLibrary.js';

const asphaltMaterial = createAsphaltMaterial();
const shoulderMaterial = createShoulderMaterial();
const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xe7d89a, roughness: 0.75 });

function smoothRingPath() {
  const insetPoints = COASTLINE.map(([x, z]) => {
    const radius = Math.hypot(x, z) || 1;
    const inset = 118;
    return new THREE.Vector3(x * ((radius - inset) / radius), 0, z * ((radius - inset) / radius));
  });
  const curve = new THREE.CatmullRomCurve3(insetPoints, true, 'centripetal', 0.35);
  return curve.getSpacedPoints(420).slice(0, -1).map((point) => [point.x, point.z]);
}

function smoothOpenPath(points, samples = 70) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal', 0.4);
  return curve.getSpacedPoints(samples).map((point) => [point.x, point.z]);
}

function buildRibbon(points, width, elevation, material, closed = false) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const count = points.length;
  const cumulative = new Float32Array(count);
  for (let i = 1; i < count; i += 1) cumulative[i] = cumulative[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  for (let i = 0; i < count; i += 1) {
    const previous = points[(i - 1 + count) % count];
    const next = points[(i + 1) % count];
    const fallbackPrevious = i === 0 && !closed ? points[0] : previous;
    const fallbackNext = i === count - 1 && !closed ? points[count - 1] : next;
    const tx = fallbackNext[0] - fallbackPrevious[0];
    const tz = fallbackNext[1] - fallbackPrevious[1];
    const length = Math.hypot(tx, tz) || 1;
    const nx = -tz / length;
    const nz = tx / length;
    for (const side of [-1, 1]) {
      const x = points[i][0] + nx * width * 0.5 * side;
      const z = points[i][1] + nz * width * 0.5 * side;
      positions.push(x, terrainHeight(x, z) + elevation, z);
      uvs.push(side < 0 ? 0 : 1, cumulative[i] / 7.5);
    }
  }
  const segmentCount = closed ? count : count - 1;
  for (let i = 0; i < segmentCount; i += 1) {
    const next = (i + 1) % count;
    const a = i * 2;
    const b = a + 1;
    const c = next * 2;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function transformRunwayPoint(localX, localZ) {
  const c = Math.cos(AIRPORT.angle);
  const s = Math.sin(AIRPORT.angle);
  return [AIRPORT.x + localX * c - localZ * s, AIRPORT.z + localX * s + localZ * c];
}

export class Roads {
  constructor(quality) {
    this.group = new THREE.Group();
    this.group.name = 'Road network';
    this.ringPath = smoothRingPath();
    this.sidePaths = [
      smoothOpenPath([[-2220, 410], [-1680, 450], [-1120, 390], [-650, 420]], 52),
      smoothOpenPath([[-2050, -610], [-1420, -420], [-880, -250], [-200, -380], [510, -540]], 64),
      smoothOpenPath([[1780, 640], [1250, 470], [740, 180], [220, -370]], 58),
      smoothOpenPath([[-1120, 1480], [-780, 1120], [-650, 720], [-650, 420]], 38),
    ];
    this.paths = [this.ringPath, ...this.sidePaths];
    this.#buildRoads(quality);
    this.#buildRunway();
  }

  #buildRoads(quality) {
    const paths = [{ points: this.ringPath, width: 9.2, closed: true }, ...this.sidePaths.map((points) => ({ points, width: 7.2, closed: false }))];
    for (const [index, path] of paths.entries()) {
      const shoulder = buildRibbon(path.points, path.width + 4.5, 0.13, shoulderMaterial, path.closed);
      shoulder.name = index === 0 ? 'Island Ring Road shoulder' : `Interior road ${index} shoulder`;
      this.group.add(shoulder);
      const road = buildRibbon(path.points, path.width, 0.2, asphaltMaterial, path.closed);
      road.name = index === 0 ? 'Island Ring Road' : `Interior road ${index}`;
      this.group.add(road);
      if (quality.name !== 'LOW' || index === 0) this.group.add(this.#buildCentreMarks(path.points, path.closed));
    }
  }

  #buildCentreMarks(points, closed) {
    const geometry = new THREE.BoxGeometry(0.16, 0.045, 8.5);
    const material = lineMaterial;
    const indices = [];
    for (let i = 1; i < points.length - (closed ? 0 : 1); i += 3) indices.push(i);
    const instances = new THREE.InstancedMesh(geometry, material, indices.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    indices.forEach((pointIndex, instanceIndex) => {
      const point = points[pointIndex];
      const next = points[(pointIndex + 1) % points.length];
      const yaw = Math.atan2(next[0] - point[0], next[1] - point[1]);
      quaternion.setFromAxisAngle(up, yaw);
      position.set(point[0], terrainHeight(point[0], point[1]) + 0.27, point[1]);
      matrix.compose(position, quaternion, scale);
      instances.setMatrixAt(instanceIndex, matrix);
    });
    instances.receiveShadow = true;
    instances.name = 'Road centre markings';
    return instances;
  }

  #buildRunway() {
    const runwayMaterial = createAsphaltMaterial();
    runwayMaterial.color.set(0x777772);
    runwayMaterial.map.repeat.set(120, 3);
    runwayMaterial.normalMap.repeat.set(120, 3);
    runwayMaterial.roughnessMap.repeat.set(120, 3);
    const apronMaterial = new THREE.MeshStandardMaterial({ color: 0x5e6260, roughness: 0.94 });
    const runwayGeometry = new THREE.BoxGeometry(AIRPORT.length, 0.24, AIRPORT.runwayWidth);
    const runway = new THREE.Mesh(runwayGeometry, runwayMaterial);
    runway.position.set(AIRPORT.x, AIRPORT.elevation + 0.18, AIRPORT.z);
    runway.rotation.y = -AIRPORT.angle;
    runway.receiveShadow = true;
    runway.name = 'Nauru International Airport runway';
    this.group.add(runway);

    const apronGeometry = new THREE.BoxGeometry(720, 0.15, 130);
    const apron = new THREE.Mesh(apronGeometry, apronMaterial);
    const [apronX, apronZ] = transformRunwayPoint(-260, -88);
    apron.position.set(apronX, AIRPORT.elevation + 0.14, apronZ);
    apron.rotation.y = -AIRPORT.angle;
    apron.receiveShadow = true;
    apron.name = 'Airport apron';
    this.group.add(apron);

    const markerGeometry = new THREE.BoxGeometry(25, 0.05, 0.42);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xf3eee0 });
    const count = 25;
    const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, count + 12);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -AIRPORT.angle);
    const scale = new THREE.Vector3(1, 1, 1);
    let instance = 0;
    for (let lx = -960; lx <= 960; lx += 80) {
      const [x, z] = transformRunwayPoint(lx, 0);
      matrix.compose(new THREE.Vector3(x, AIRPORT.elevation + 0.33, z), quaternion, scale);
      markers.setMatrixAt(instance++, matrix);
    }
    for (const end of [-1, 1]) {
      for (let lane = -2; lane <= 2; lane += 1) {
        const [x, z] = transformRunwayPoint(end * 1010, lane * 6);
        const stripeScale = new THREE.Vector3(1.15, 1, 3.4);
        matrix.compose(new THREE.Vector3(x, AIRPORT.elevation + 0.33, z), quaternion, stripeScale);
        markers.setMatrixAt(instance++, matrix);
      }
    }
    markers.count = instance;
    markers.name = 'Runway markings';
    this.group.add(markers);

    const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xc9edff, emissive: 0x8fd8ff, emissiveIntensity: 2.1, roughness: .25 });
    const lightCount = 44;
    const edgeLights = new THREE.InstancedMesh(new THREE.SphereGeometry(.22, 7, 5), lightMaterial, lightCount);
    let lightIndex = 0;
    for (let lx = -1000; lx <= 1000; lx += 100) {
      for (const lz of [-26, 26]) {
        const [x, z] = transformRunwayPoint(lx, lz);
        matrix.compose(new THREE.Vector3(x, AIRPORT.elevation + .48, z), quaternion, new THREE.Vector3(1, 1, 1));
        edgeLights.setMatrixAt(lightIndex++, matrix);
      }
    }
    edgeLights.count = lightIndex;
    edgeLights.name = 'Runway edge lights';
    this.group.add(edgeLights);
  }

  distanceToRoad(x, z) {
    let best = distanceToPolyline(x, z, this.ringPath, true);
    for (const path of this.sidePaths) best = Math.min(best, distanceToPolyline(x, z, path, false));
    const local = toRotatedLocal(x, z, AIRPORT.x, AIRPORT.z, AIRPORT.angle);
    if (Math.abs(local.x) < AIRPORT.length * 0.5 && Math.abs(local.z) < AIRPORT.runwayWidth * 0.75) best = 0;
    return best;
  }

  closestRoadPoint(x, z) {
    let best = closestPointOnPolyline(x, z, this.ringPath, true);
    for (const path of this.sidePaths) {
      const candidate = closestPointOnPolyline(x, z, path, false);
      if (candidate.distance < best.distance) best = candidate;
    }
    return best;
  }

  surfaceAt(x, z) {
    const local = toRotatedLocal(x, z, AIRPORT.x, AIRPORT.z, AIRPORT.angle);
    if (Math.abs(local.x) < AIRPORT.length * 0.52 && Math.abs(local.z) < AIRPORT.runwayWidth) return 'RUNWAY';
    if (local.x > -620 && local.x < 100 && local.z > -154 && local.z < -22) return 'APRON';
    return this.distanceToRoad(x, z) < 7 ? 'ASPHALT' : 'OFF ROAD';
  }
}
