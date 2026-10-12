import * as THREE from 'three';
import { hash2D } from '../core/math.js';

const loader = new THREE.TextureLoader();

function loadTiledTexture(path, repeatX, repeatY, color = true) {
  const texture = loader.load(path);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createNoiseTexture(size = 128, seed = 1, normal = false) {
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const broad = hash2D(Math.floor(x / 4), Math.floor(y / 4), seed) * .55;
      const fine = hash2D(x, y, seed + 91) * .45;
      heights[y * size + x] = broad + fine;
    }
  }
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (normal) {
        const left = heights[y * size + ((x - 1 + size) % size)];
        const right = heights[y * size + ((x + 1) % size)];
        const down = heights[((y - 1 + size) % size) * size + x];
        const up = heights[((y + 1) % size) * size + x];
        let nx = (left - right) * 1.8;
        let ny = (down - up) * 1.8;
        let nz = 1;
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length; ny /= length; nz /= length;
        pixels[index * 4] = (nx * .5 + .5) * 255;
        pixels[index * 4 + 1] = (ny * .5 + .5) * 255;
        pixels[index * 4 + 2] = (nz * .5 + .5) * 255;
      } else {
        const value = Math.round((.72 + heights[index] * .26) * 255);
        pixels[index * 4] = value;
        pixels[index * 4 + 1] = value;
        pixels[index * 4 + 2] = value;
      }
      pixels[index * 4 + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function createTerrainMaterial() {
  const ground = loadTiledTexture('/textures/nauru-ground.jpg', 620, 670);
  const limestone = loadTiledTexture('/textures/weathered-concrete.jpg', 430, 465);
  const normals = createNoiseTexture(128, 819, true);
  normals.repeat.set(840, 910);
  const roughness = createNoiseTexture(128, 312, false);
  roughness.repeat.set(520, 560);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: ground,
    normalMap: normals,
    normalScale: new THREE.Vector2(.48, .48),
    roughnessMap: roughness,
    roughness: .93,
    metalness: 0,
    vertexColors: true,
  });
  material.userData.limestone = limestone;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLimestoneMap = { value: limestone };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float rockMix;\nvarying float vRockMix;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRockMix = rockMix;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uLimestoneMap;\nvarying float vRockMix;')
      .replace(
        'vec4 sampledDiffuseColor = texture2D( map, vMapUv );',
        'vec4 sampledDiffuseColor = texture2D( map, vMapUv );\nvec4 limestoneColor = texture2D( uLimestoneMap, vMapUv * 0.72 + vec2(0.17, 0.31) );\nsampledDiffuseColor = mix(sampledDiffuseColor, limestoneColor, smoothstep(0.08, 0.92, vRockMix));',
      );
  };
  material.customProgramCacheKey = () => 'nauru-terrain-biome-v2';
  return material;
}

export function createAsphaltMaterial() {
  const map = loadTiledTexture('/textures/island-asphalt.jpg', 1, 1);
  const normalMap = createNoiseTexture(96, 144, true);
  normalMap.repeat.set(1, 1);
  const roughnessMap = createNoiseTexture(96, 552, false);
  roughnessMap.repeat.set(1, 1);
  return new THREE.MeshStandardMaterial({
    color: 0x9a9a94,
    map,
    normalMap,
    normalScale: new THREE.Vector2(.32, .32),
    roughnessMap,
    roughness: .86,
    metalness: .02,
  });
}

export function createConcreteMaterial(color = 0xd0cab9) {
  const map = loadTiledTexture('/textures/weathered-concrete.jpg', 2, 2);
  const normalMap = createNoiseTexture(96, 427, true);
  normalMap.repeat.set(2, 2);
  return new THREE.MeshStandardMaterial({
    color,
    map,
    normalMap,
    normalScale: new THREE.Vector2(.22, .22),
    roughness: .88,
    metalness: 0,
  });
}

export function createShoulderMaterial() {
  const map = loadTiledTexture('/textures/nauru-ground.jpg', 1, 1);
  return new THREE.MeshStandardMaterial({ color: 0xb09872, map, roughness: 1, metalness: 0 });
}
