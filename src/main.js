import * as THREE from 'three';
import './styles.css';
import { Input } from './core/Input.js';
import { QUALITY_PRESETS, applyRendererQuality, detectQuality } from './core/quality.js';
import { World } from './world/World.js';
import { PlayerController } from './actors/PlayerController.js';
import { IslandRunner } from './vehicles/IslandRunner.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { HUD } from './ui/HUD.js';
import { AudioSystem } from './audio/AudioSystem.js';
import { SaveSystem } from './save/SaveSystem.js';

const canvas = document.getElementById('game-canvas');
const initialQualityKey = detectQuality();
let qualityKey = initialQualityKey;
let quality = QUALITY_PRESETS[qualityKey];

const renderer = new THREE.WebGLRenderer({ canvas, antialias: qualityKey !== 'low', powerPreference: 'high-performance', logarithmicDepthBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x88b5b6, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, .08, quality.far);
applyRendererQuality(renderer, camera, qualityKey);

const input = new Input(canvas);
const world = new World(scene, quality);
const player = new PlayerController(scene, world);
const vehicle = new IslandRunner(scene, world);
const cameraRig = new ThirdPersonCamera(camera, world);
const hud = new HUD(world);
const audio = new AudioSystem();
const saves = new SaveSystem();
const focus = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();

let started = false;
let inVehicle = false;
let pauseOpen = false;
let mapOpen = false;
let elapsed = 0;
let lastTime = performance.now();
let fps = 60;
let autosaveReady = false;
let escapeCooldown = 0;

// The tiny Windows launcher uses this to know when its Edge app window is alive.
if (window.location.hostname === '127.0.0.1' && window.location.port.startsWith('486')) {
  setInterval(() => fetch('/__heartbeat', { cache: 'no-store' }).catch(() => {}), 5000);
}

const continueButton = document.getElementById('continue-button');
continueButton.disabled = !saves.hasSave;
document.getElementById('sensitivity').value = String(input.sensitivity);

function currentFocus() {
  if (inVehicle) return vehicle.getTarget(focus);
  return player.getTarget(focus);
}

function getState() {
  currentFocus();
  return { player, vehicle, world, hud, inVehicle, focus, cameraYaw: cameraRig.yaw, atmosphere: world.atmosphere };
}

function enterVehicle() {
  if (inVehicle) return;
  inVehicle = true;
  player.setInVehicle(true);
  document.body.classList.add('in-vehicle');
  cameraRig.alignTo(vehicle.yaw);
  cameraRig.mode = 0;
  vehicle.object.userData.visual.visible = true;
  audio.cue(330, .09);
}

function exitVehicle() {
  if (!inVehicle || vehicle.speedKmh > 5) return;
  const exit = vehicle.exitPosition();
  inVehicle = false;
  player.placeAt(exit.x, exit.z, exit.yaw);
  player.setInVehicle(false);
  player.object.visible = cameraRig.mode === 0;
  document.body.classList.remove('in-vehicle');
  cameraRig.alignTo(vehicle.yaw + .18);
  audio.cue(240, .08);
}

function setPause(open) {
  if (!started) return;
  pauseOpen = open;
  hud.setPause(open);
  if (open) document.exitPointerLock?.();
  else if (!mapOpen) input.requestPointerLock();
}

function setMap(open) {
  if (!started) return;
  mapOpen = open;
  hud.setMap(open, getState());
  if (open) document.exitPointerLock?.();
  else if (!pauseOpen) input.requestPointerLock();
}

function resetActive() {
  if (inVehicle) vehicle.reset();
  else player.resetToAirport();
  cameraRig.alignTo(inVehicle ? vehicle.yaw : player.facing);
  cameraRig.snap(currentFocus(), inVehicle ? 'vehicle' : 'player');
  hud.toast(inVehicle ? 'Island Runner returned to the airport' : 'Returned to the airport');
}

function setQuality(key) {
  if (!QUALITY_PRESETS[key]) return;
  qualityKey = key;
  quality = applyRendererQuality(renderer, camera, key);
  world.setQuality(quality);
  document.getElementById('quality-output').textContent = quality.name;
  document.querySelectorAll('[data-quality]').forEach((button) => button.classList.toggle('active', button.dataset.quality === key));
  hud.toast(`${quality.name} graphics preset applied`);
}
setQuality(qualityKey);

function applyRestoredState(payload) {
  inVehicle = saves.restore(payload, { player, vehicle, world, hud });
  player.setInVehicle(inVehicle);
  document.body.classList.toggle('in-vehicle', inVehicle);
  cameraRig.alignTo(inVehicle ? vehicle.yaw : player.facing);
  cameraRig.snap(currentFocus(), inVehicle ? 'vehicle' : 'player');
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function begin(continueSaved) {
  if (started) return;
  await audio.start();
  input.requestPointerLock();
  const loading = document.getElementById('loading-screen');
  const loadingLabel = document.getElementById('loading-label');
  const loadingBar = document.getElementById('loading-bar');
  loading.classList.add('visible');
  loadingBar.style.width = '18%';
  await delay(120);
  loadingLabel.textContent = 'Streaming the Yaren coastal sector…';
  world.environment.update(player.object.position, 1, true);
  loadingBar.style.width = '58%';
  await delay(150);
  if (continueSaved) {
    const payload = saves.load();
    if (payload) applyRestoredState(payload);
  } else {
    saves.clear();
    player.resetToAirport();
    vehicle.reset();
    hud.discovered.clear();
    hud.objectiveComplete = false;
    cameraRig.alignTo(player.facing);
    cameraRig.snap(player.getTarget(cameraTarget), 'player');
  }
  loadingLabel.textContent = 'Starting free roam…';
  loadingBar.style.width = '100%';
  await delay(220);
  started = true;
  autosaveReady = true;
  document.body.classList.add('game-started');
  document.getElementById('splash').classList.remove('visible');
  loading.classList.remove('visible');
  hud.showDiscovery('Nauru International Airport');
  lastTime = performance.now();
}

document.getElementById('start-button').addEventListener('click', () => begin(false));
continueButton.addEventListener('click', () => begin(true));
document.getElementById('resume-button').addEventListener('click', () => setPause(false));
document.getElementById('save-button').addEventListener('click', () => { saves.save(getState()); hud.toast('Game saved'); });
document.getElementById('reset-button').addEventListener('click', () => { resetActive(); setPause(false); });
document.getElementById('sensitivity').addEventListener('input', (event) => input.setSensitivity(event.target.value));
document.querySelectorAll('[data-quality]').forEach((button) => button.addEventListener('click', () => setQuality(button.dataset.quality)));
canvas.addEventListener('click', () => { if (started && !pauseOpen && !mapOpen) input.requestPointerLock(); });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
});

window.addEventListener('keydown', (event) => {
  if (!started) return;
  if (event.code === 'Escape' && escapeCooldown <= 0) {
    escapeCooldown = .25;
    if (mapOpen) setMap(false);
    else setPause(!pauseOpen);
  }
});

window.addEventListener('pagehide', () => { if (started && autosaveReady) saves.save(getState()); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && started && autosaveReady) saves.save(getState());
});

function processActions() {
  if (input.consume('KeyM')) { setMap(!mapOpen); return; }
  if (input.consume('F3')) hud.toggleDebug();
  if (input.consume('F6')) { saves.save(getState()); hud.toast('Quick save complete'); }
  if (input.consume('KeyK')) document.body.classList.toggle('cinematic');
  if (pauseOpen || mapOpen) return;
  if (input.consume('KeyV')) {
    const mode = cameraRig.toggleMode();
    player.object.visible = !inVehicle && mode === 0;
    vehicle.object.userData.visual.visible = !(inVehicle && mode === 1);
    hud.toast(mode === 1 ? 'First-person camera' : 'Third-person camera', 1.7);
  }
  if (input.consume('KeyT')) {
    const weather = world.atmosphere.cycleWeather();
    hud.toast(`Weather: ${weather.label}`, 2.2);
  }
  if (input.consume('Backspace')) resetActive();
  if (input.consume('KeyE')) {
    if (inVehicle) {
      if (vehicle.speedKmh <= 5) exitVehicle();
      else hud.toast('Slow down before exiting');
    } else if (vehicle.distanceTo(player.object.position) < 7.5) enterVehicle();
  }
}

function update(dt) {
  escapeCooldown = Math.max(0, escapeCooldown - dt);
  processActions();
  const blocked = pauseOpen || mapOpen;
  input.enabled = true;
  if (!started || blocked) return;

  player.update(input, cameraRig.yaw, dt);
  vehicle.update(input, dt, inVehicle);
  const target = inVehicle ? vehicle.getTarget(cameraTarget) : player.getTarget(cameraTarget);
  cameraRig.update(input, target, inVehicle ? 'vehicle' : 'player', inVehicle ? vehicle.yaw : player.facing, inVehicle ? vehicle.speed : player.speed, dt);
  currentFocus();
  world.update(dt, elapsed, focus);
  const nearVehicle = !inVehicle && vehicle.distanceTo(player.object.position) < 7.5;
  hud.setPrompt(nearVehicle || inVehicle, inVehicle ? (vehicle.speedKmh <= 5 ? 'Exit Island Runner' : 'Slow down to exit') : 'Enter Island Runner');
  hud.update(getState(), dt);
  audio.update({
    inVehicle, vehicle, player, weather: world.atmosphere.weather,
    coastDistance: world.coastDistanceAt(focus.x, focus.z),
  }, dt);
  saves.update(dt, getState());
}

function animate(now) {
  requestAnimationFrame(animate);
  const rawDt = (now - lastTime) / 1000;
  lastTime = now;
  const dt = Math.min(.05, Math.max(0, rawDt));
  fps += ((rawDt > 0 ? 1 / rawDt : 60) - fps) * Math.min(1, dt * 3);
  if (started && !pauseOpen && !mapOpen) elapsed += dt;
  update(dt);
  if (!started) {
    // Keep the pre-built world alive behind the title screen without simulating gameplay.
    world.ocean.update(now / 1000);
  }
  renderer.render(scene, camera);
  hud.updateDebug(renderer, focus, world.stats, fps);
  input.endFrame();
}

cameraRig.snap(player.getTarget(cameraTarget), 'player');
currentFocus();
world.environment.update(player.object.position, 1, true);
requestAnimationFrame(animate);
