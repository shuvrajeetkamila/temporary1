import { COASTLINE, ISLAND_BOUNDS } from '../data/nauruCoastline.js';
import { LANDMARKS } from '../data/landmarks.js';
import { clamp } from '../core/math.js';

const byId = (id) => document.getElementById(id);

export class HUD {
  constructor(world) {
    this.world = world;
    this.locationName = byId('location-name');
    this.locationDetail = byId('location-detail');
    this.clock = byId('clock');
    this.weatherIcon = byId('weather-icon');
    this.weatherLabel = byId('weather-label');
    this.speed = byId('speed');
    this.gear = byId('gear');
    this.rpm = byId('rpm-bar');
    this.surface = byId('surface-label');
    this.prompt = byId('interaction-prompt');
    this.promptText = byId('interaction-text');
    this.toastElement = byId('toast');
    this.discoveryBanner = byId('discovery-banner');
    this.discoveryName = byId('discovery-name');
    this.objectiveTitle = byId('objective-title');
    this.objectiveCopy = byId('objective-copy');
    this.missionCard = byId('mission-card');
    this.mapPanel = byId('world-map');
    this.pausePanel = byId('pause-menu');
    this.minimap = byId('minimap');
    this.bigMap = byId('big-map');
    this.debugPanel = byId('debug-panel');
    this.discovered = new Set(JSON.parse(localStorage.getItem('nauru.discovered') || '[]'));
    this.lastLocationId = '';
    this.mapTimer = 0;
    this.toastTimer = 0;
    this.discoveryTimer = 0;
    this.objectiveComplete = false;
    this.mapOpen = false;
    this.pauseOpen = false;
    this.debugOpen = false;
  }

  update(state, dt) {
    const { focus, player, vehicle, inVehicle, cameraYaw, atmosphere } = state;
    const location = this.world.locationAt(focus.x, focus.z);
    this.locationName.textContent = location.name;
    this.locationDetail.textContent = location.detail;
    this.clock.textContent = atmosphere.clockLabel;
    this.weatherIcon.textContent = atmosphere.weather.icon;
    this.weatherLabel.textContent = atmosphere.weather.label;

    this.speed.textContent = String(Math.round(vehicle.speedKmh)).padStart(3, '0');
    this.gear.textContent = vehicle.gear;
    this.rpm.style.width = `${Math.round(vehicle.rpm * 100)}%`;
    this.surface.textContent = vehicle.surface;

    if (location.landmark && location.id !== this.lastLocationId && !this.discovered.has(location.id)) {
      this.discovered.add(location.id);
      localStorage.setItem('nauru.discovered', JSON.stringify([...this.discovered]));
      this.showDiscovery(location.landmark.name);
    }
    this.lastLocationId = location.id;

    if (inVehicle && !this.objectiveComplete) {
      this.objectiveComplete = true;
      this.objectiveTitle.textContent = 'Island Runner acquired';
      this.objectiveCopy.innerHTML = 'Follow the ring road, or press <kbd>M</kbd> to choose a landmark.';
      this.missionCard.classList.add('completed');
      this.toast('Vehicle controls: W/S throttle · A/D steer · Space handbrake');
    }

    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = .1;
      this.drawMinimap(focus, cameraYaw, player, vehicle, inVehicle);
      if (this.mapOpen) this.drawBigMap(focus, player, vehicle, inVehicle);
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastElement.classList.remove('visible');
    }
    if (this.discoveryTimer > 0) {
      this.discoveryTimer -= dt;
      if (this.discoveryTimer <= 0) this.discoveryBanner.classList.remove('visible');
    }
  }

  drawMinimap(focus, cameraYaw, player, vehicle, inVehicle) {
    const canvas = this.minimap;
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const scale = width / 2250;
    const project = ([x, z]) => [width * .5 + (x - focus.x) * scale, height * .5 + (z - focus.z) * scale];
    context.clearRect(0, 0, width, height);
    const gradient = context.createRadialGradient(width * .5, height * .5, 0, width * .5, height * .5, width * .65);
    gradient.addColorStop(0, 'rgba(13,62,67,.94)');
    gradient.addColorStop(1, 'rgba(3,20,24,.98)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    this.#drawIsland(context, project, false);
    this.#drawRoads(context, project, 1.8);
    for (const landmark of LANDMARKS) {
      if (!this.discovered.has(landmark.id)) continue;
      const [x, y] = project([landmark.x, landmark.z]);
      if (x < -10 || x > width + 10 || y < -10 || y > height + 10) continue;
      context.strokeStyle = 'rgba(86,235,207,.85)';
      context.lineWidth = 1;
      context.beginPath(); context.arc(x, y, 3.5, 0, Math.PI * 2); context.stroke();
    }
    const other = inVehicle ? player.object : vehicle.object;
    const [otherX, otherY] = project([other.position.x, other.position.z]);
    context.fillStyle = '#e6c775';
    context.beginPath(); context.arc(otherX, otherY, 3, 0, Math.PI * 2); context.fill();
    this.#drawMarker(context, width * .5, height * .5, inVehicle ? vehicle.yaw : player.facing, '#f6fffc', '#56ebcf', 7);

    context.save();
    context.translate(width * .5, height * .5);
    context.rotate(-cameraYaw);
    context.strokeStyle = 'rgba(255,255,255,.16)';
    context.fillStyle = 'rgba(255,255,255,.035)';
    context.beginPath(); context.moveTo(0, 0); context.lineTo(-34, -76); context.lineTo(34, -76); context.closePath(); context.fill(); context.stroke();
    context.restore();
  }

  drawBigMap(focus, player, vehicle, inVehicle) {
    const canvas = this.bigMap;
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#071d22';
    context.fillRect(0, 0, width, height);
    for (let x = 0; x < width; x += 55) { context.strokeStyle = 'rgba(104,190,183,.055)'; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
    for (let y = 0; y < height; y += 55) { context.strokeStyle = 'rgba(104,190,183,.055)'; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    const pad = 56;
    const spanX = ISLAND_BOUNDS.maxX - ISLAND_BOUNDS.minX;
    const spanZ = ISLAND_BOUNDS.maxZ - ISLAND_BOUNDS.minZ;
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanZ);
    const centreX = (ISLAND_BOUNDS.minX + ISLAND_BOUNDS.maxX) * .5;
    const centreZ = (ISLAND_BOUNDS.minZ + ISLAND_BOUNDS.maxZ) * .5;
    const project = ([x, z]) => [width * .5 + (x - centreX) * scale, height * .5 + (z - centreZ) * scale];
    this.#drawIsland(context, project, true);
    this.#drawRoads(context, project, 3.2);

    for (const landmark of LANDMARKS) {
      const [x, y] = project([landmark.x, landmark.z]);
      const known = this.discovered.has(landmark.id);
      context.strokeStyle = known ? '#56ebcf' : 'rgba(155,188,183,.35)';
      context.fillStyle = known ? '#dffcf5' : 'rgba(185,205,201,.45)';
      context.lineWidth = 1.6;
      context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.stroke();
      context.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      context.textAlign = x > width * .66 ? 'right' : 'left';
      context.fillText(known ? landmark.name : 'UNDISCOVERED', x + (x > width * .66 ? -10 : 10), y + 4);
    }
    const [carX, carY] = project([vehicle.position.x, vehicle.position.z]);
    context.fillStyle = '#e6c775'; context.beginPath(); context.arc(carX, carY, 5, 0, Math.PI * 2); context.fill();
    const actor = inVehicle ? vehicle : player;
    const yaw = inVehicle ? vehicle.yaw : player.facing;
    const [px, py] = project([actor.object.position.x, actor.object.position.z]);
    this.#drawMarker(context, px, py, yaw, '#ffffff', '#56ebcf', 10);

    context.fillStyle = 'rgba(255,255,255,.45)';
    context.font = '700 9px ui-sans-serif, system-ui, sans-serif';
    context.textAlign = 'left';
    context.fillText('N', 30, 31);
    context.strokeStyle = '#56ebcf'; context.lineWidth = 2; context.beginPath(); context.moveTo(33, 67); context.lineTo(33, 39); context.stroke();
    const scalePixels = 1000 * scale;
    context.strokeStyle = 'rgba(255,255,255,.6)'; context.lineWidth = 2; context.beginPath(); context.moveTo(28, height - 30); context.lineTo(28 + scalePixels, height - 30); context.stroke();
    context.fillText('1 KM', 28, height - 38);
  }

  #drawIsland(context, project, full) {
    context.beginPath();
    COASTLINE.forEach((point, index) => {
      const [x, y] = project(point);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.closePath();
    context.fillStyle = full ? '#324b32' : 'rgba(65,91,55,.92)';
    context.strokeStyle = full ? 'rgba(180,222,190,.65)' : 'rgba(196,232,203,.5)';
    context.lineWidth = full ? 2 : 1;
    context.fill(); context.stroke();
  }

  #drawRoads(context, project, width) {
    context.strokeStyle = 'rgba(214,222,210,.7)';
    context.lineWidth = width;
    context.lineJoin = 'round';
    const drawPath = (path, closed) => {
      context.beginPath();
      path.forEach((point, index) => { const [x, y] = project(point); if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); });
      if (closed) context.closePath();
      context.stroke();
    };
    drawPath(this.world.roads.ringPath, true);
    for (const path of this.world.roads.sidePaths) drawPath(path, false);
  }

  #drawMarker(context, x, y, yaw, fill, stroke, size) {
    context.save(); context.translate(x, y); context.rotate(-yaw + Math.PI);
    context.fillStyle = fill; context.strokeStyle = stroke; context.lineWidth = 2;
    context.beginPath(); context.moveTo(0, -size); context.lineTo(size * .72, size * .75); context.lineTo(0, size * .42); context.lineTo(-size * .72, size * .75); context.closePath(); context.fill(); context.stroke();
    context.restore();
  }

  setPrompt(show, text = 'Enter Island Runner') {
    this.prompt.classList.toggle('visible', show);
    this.promptText.textContent = text;
  }

  showDiscovery(name) {
    this.discoveryName.textContent = name;
    this.discoveryBanner.classList.add('visible');
    this.discoveryTimer = 4.2;
  }

  toast(message, duration = 3.4) {
    this.toastElement.textContent = message;
    this.toastElement.classList.add('visible');
    this.toastTimer = duration;
  }

  setMap(open, state) {
    this.mapOpen = open;
    this.mapPanel.classList.toggle('open', open);
    this.mapPanel.setAttribute('aria-hidden', String(!open));
    if (open && state) this.drawBigMap(state.focus, state.player, state.vehicle, state.inVehicle);
  }

  setPause(open) {
    this.pauseOpen = open;
    this.pausePanel.classList.toggle('open', open);
    this.pausePanel.setAttribute('aria-hidden', String(!open));
  }

  toggleDebug() { this.debugOpen = !this.debugOpen; this.debugPanel.classList.toggle('visible', this.debugOpen); }
  updateDebug(renderer, focus, worldStats, fps) {
    if (!this.debugOpen) return;
    byId('debug-fps').textContent = `${Math.round(fps)} FPS`;
    byId('debug-sectors').textContent = `${worldStats.activeSectors} active / ${worldStats.loadedSectors} loaded / ${worldStats.totalSectors} total`;
    byId('debug-position').textContent = `${focus.x.toFixed(1)}, ${focus.y.toFixed(1)}, ${focus.z.toFixed(1)}`;
    byId('debug-tris').textContent = `${renderer.info.render.triangles.toLocaleString()} triangles · terrain ${Math.round(worldStats.terrainTriangles).toLocaleString()}`;
  }

  serialize() { return { discovered: [...this.discovered], objectiveComplete: this.objectiveComplete }; }
  restore(data) {
    if (!data) return;
    if (Array.isArray(data.discovered)) {
      this.discovered = new Set(data.discovered);
      localStorage.setItem('nauru.discovered', JSON.stringify([...this.discovered]));
    }
    if (data.objectiveComplete) {
      this.objectiveComplete = true;
      this.objectiveTitle.textContent = 'Island Runner acquired';
      this.objectiveCopy.innerHTML = 'Follow the ring road, or press <kbd>M</kbd> to choose a landmark.';
      this.missionCard.classList.add('completed');
    }
  }
}
