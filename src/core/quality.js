export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({ name: 'LOW', pixelRatio: 1, shadows: false, shadowMap: 512, terrainStep: 105, sectorRadius: 950, vegetation: 0.38, buildings: 0.55, rainCount: 450, far: 9500 }),
  medium: Object.freeze({ name: 'MEDIUM', pixelRatio: 1.25, shadows: true, shadowMap: 1024, terrainStep: 78, sectorRadius: 1250, vegetation: 0.68, buildings: 0.78, rainCount: 850, far: 11000 }),
  high: Object.freeze({ name: 'HIGH', pixelRatio: 1.6, shadows: true, shadowMap: 1536, terrainStep: 62, sectorRadius: 1550, vegetation: 1, buildings: 1, rainCount: 1400, far: 13500 }),
  ultra: Object.freeze({ name: 'ULTRA', pixelRatio: 2, shadows: true, shadowMap: 2048, terrainStep: 48, sectorRadius: 1900, vegetation: 1.28, buildings: 1.18, rainCount: 2200, far: 16000 }),
});

export function detectQuality() {
  const saved = localStorage.getItem('nauru.quality');
  if (saved && QUALITY_PRESETS[saved]) return saved;
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  return memory <= 4 || cores <= 4 ? 'low' : memory >= 8 && cores >= 8 ? 'high' : 'medium';
}

export function applyRendererQuality(renderer, camera, key) {
  const preset = QUALITY_PRESETS[key] || QUALITY_PRESETS.medium;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
  renderer.shadowMap.enabled = preset.shadows;
  camera.far = preset.far;
  camera.updateProjectionMatrix();
  localStorage.setItem('nauru.quality', key);
  return preset;
}
