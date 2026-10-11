import * as THREE from 'three';
import { clamp, lerp } from '../core/math.js';

const WEATHER = [
  { id: 'clear', label: 'CLEAR', icon: '☀', cloud: 0, rain: 0, visibility: 1 },
  { id: 'cloudy', label: 'CLOUDY', icon: '◒', cloud: .55, rain: 0, visibility: .82 },
  { id: 'rain', label: 'TROPICAL RAIN', icon: '☂', cloud: .82, rain: .55, visibility: .57 },
  { id: 'storm', label: 'HEAVY RAIN', icon: 'ϟ', cloud: 1, rain: 1, visibility: .36 },
];

export class Atmosphere {
  constructor(scene, quality, ocean) {
    this.scene = scene;
    this.quality = quality;
    this.ocean = ocean;
    this.timeHours = 8.35;
    this.weatherIndex = 0;
    this.weather = WEATHER[0];
    this.timeScale = 1 / 60;
    this.sunDirection = new THREE.Vector3();
    this.skyColor = new THREE.Color();
    this.fogColor = new THREE.Color();
    this.tmpColor = new THREE.Color();
    this.elapsed = 0;

    this.hemisphere = new THREE.HemisphereLight(0xb8e5ea, 0x263521, 1.05);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(0xffedce, 1.9);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    this.sun.shadow.camera.left = -700;
    this.sun.shadow.camera.right = 700;
    this.sun.shadow.camera.top = 700;
    this.sun.shadow.camera.bottom = -700;
    this.sun.shadow.camera.near = 40;
    this.sun.shadow.camera.far = 2200;
    this.sun.shadow.bias = -0.00018;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.sky = this.#createSky();
    this.scene.add(this.sky);
    this.clouds = this.#createClouds();
    this.scene.add(this.clouds);
    this.rain = this.#createRain(quality.rainCount);
    this.scene.add(this.rain);
    this.scene.fog = new THREE.Fog(0x9bc6c5, 1800, quality.far * .84);
  }

  #createSky() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x286f91) },
        uHorizon: { value: new THREE.Color(0xbed6ce) },
        uBottom: { value: new THREE.Color(0x718f8b) },
        uSunColor: { value: new THREE.Color(0xffe0a1) },
        uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
        uNight: { value: 0 },
        uCloud: { value: 0 },
      },
      vertexShader: `varying vec3 vLocal; void main(){ vLocal = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec3 vLocal;
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunColor; uniform vec3 uSunDirection;
        uniform float uNight; uniform float uCloud;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main(){
          float h = vLocal.y;
          vec3 sky = h > 0.0 ? mix(uHorizon, uTop, pow(h, .55)) : mix(uHorizon, uBottom, min(1.0, -h * 4.0));
          float sun = pow(max(dot(vLocal, normalize(uSunDirection)), 0.0), 900.0);
          float glow = pow(max(dot(vLocal, normalize(uSunDirection)), 0.0), 18.0);
          vec3 stars = vec3(step(.9975, hash(floor(vLocal.xz * 520.0)))) * uNight * max(h, 0.0);
          sky += uSunColor * (sun * 2.5 + glow * .22) * (1.0 - uCloud * .7);
          sky = mix(sky, vec3(.22,.28,.3), uCloud * .42);
          gl_FragColor = vec4(sky + stars, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(7200, 32, 20), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -20;
    mesh.name = 'Atmospheric sky';
    return mesh;
  }

  #createClouds() {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .28, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geometry, material, 34);
    const random = (i, n) => ((Math.sin(i * 928.31 + n * 71.9) * 43758.54) % 1 + 1) % 1;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 34; i += 1) {
      const angle = random(i, 1) * Math.PI * 2;
      const distance = 1300 + random(i, 2) * 4200;
      const position = new THREE.Vector3(Math.cos(angle) * distance, 420 + random(i, 3) * 430, Math.sin(angle) * distance);
      const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0));
      const scale = new THREE.Vector3(120 + random(i, 4) * 250, 20 + random(i, 5) * 50, 80 + random(i, 6) * 170);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.name = 'Procedural cloud bank';
    mesh.frustumCulled = false;
    return mesh;
  }

  #createRain(count) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - .5) * 280;
      positions[i * 3 + 1] = Math.random() * 150;
      positions[i * 3 + 2] = (Math.random() - .5) * 280;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xbde6eb, size: .42, transparent: true, opacity: .58, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    points.frustumCulled = false;
    points.name = 'Rain field';
    return points;
  }

  cycleWeather() {
    this.weatherIndex = (this.weatherIndex + 1) % WEATHER.length;
    this.weather = WEATHER[this.weatherIndex];
    return this.weather;
  }

  setWeather(id) {
    const index = WEATHER.findIndex((weather) => weather.id === id);
    if (index >= 0) {
      this.weatherIndex = index;
      this.weather = WEATHER[index];
    }
  }

  update(dt, target, elapsed) {
    this.elapsed = elapsed;
    this.timeHours = (this.timeHours + dt * this.timeScale) % 24;
    const solarAngle = ((this.timeHours - 6) / 24) * Math.PI * 2;
    const sunHeight = Math.sin(solarAngle);
    const sunHorizontal = Math.cos(solarAngle);
    this.sunDirection.set(sunHorizontal * .62, sunHeight, -.62 * sunHorizontal).normalize();
    const daylight = clamp(sunHeight * 2.2 + .18, 0, 1);
    const twilight = clamp(1 - Math.abs(sunHeight) * 4.5, 0, 1);
    const cloud = this.weather.cloud;

    const dayTop = this.tmpColor.set(0x277ca6);
    const nightTop = new THREE.Color(0x06111e);
    this.sky.material.uniforms.uTop.value.copy(nightTop).lerp(dayTop, daylight).lerp(new THREE.Color(0x56666b), cloud * .45);
    const horizon = new THREE.Color(0x9bc9c6).lerp(new THREE.Color(0xe6a06c), twilight * (1 - cloud * .6)).multiplyScalar(.22 + daylight * .78);
    this.sky.material.uniforms.uHorizon.value.copy(horizon);
    this.sky.material.uniforms.uBottom.value.copy(new THREE.Color(0x15363b).multiplyScalar(.35 + daylight * .65));
    this.sky.material.uniforms.uSunDirection.value.copy(this.sunDirection);
    this.sky.material.uniforms.uSunColor.value.set(twilight > .2 ? 0xffb06c : 0xfff0ca);
    this.sky.material.uniforms.uNight.value = 1 - daylight;
    this.sky.material.uniforms.uCloud.value = cloud;
    this.sky.position.copy(target);

    this.sun.intensity = (0.04 + daylight * 1.86) * (1 - cloud * .68);
    this.sun.color.set(twilight > .2 ? 0xffbd81 : 0xffefd1);
    this.sun.position.set(target.x + this.sunDirection.x * 800, target.y + Math.max(120, this.sunDirection.y * 850), target.z + this.sunDirection.z * 800);
    this.sun.target.position.set(target.x, target.y, target.z);
    this.sun.target.updateMatrixWorld();
    this.hemisphere.intensity = .16 + daylight * .92 * (1 - cloud * .35);
    this.hemisphere.color.set(daylight > .15 ? 0xb8e5ea : 0x466184);

    const visibility = this.weather.visibility;
    const fogNear = lerp(520, 2100, visibility);
    const fogFar = lerp(2300, this.quality.far * .84, visibility);
    this.fogColor.copy(horizon).lerp(new THREE.Color(0x66777a), cloud * .42);
    this.scene.fog.color.copy(this.fogColor);
    this.scene.fog.near = fogNear;
    this.scene.fog.far = fogFar;
    this.scene.background = this.fogColor;
    this.skyColor.copy(this.sky.material.uniforms.uTop.value);

    this.clouds.position.set(target.x + elapsed * 2.5, 0, target.z + Math.sin(elapsed * .003) * 100);
    this.clouds.material.opacity = .08 + cloud * .42;
    this.clouds.visible = cloud > .08;

    this.rain.visible = this.weather.rain > 0;
    if (this.rain.visible) {
      this.rain.position.set(target.x, target.y, target.z);
      this.rain.material.opacity = .36 + this.weather.rain * .38;
      const positions = this.rain.geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i + 1] -= dt * (65 + this.weather.rain * 45);
        positions[i] += dt * 4.5;
        if (positions[i + 1] < -8) positions[i + 1] += 155;
        if (positions[i] > 140) positions[i] -= 280;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    this.ocean.setAtmosphere({ fogColor: this.fogColor, fogNear, fogFar, skyColor: this.skyColor, sunDirection: this.sunDirection });
  }

  setQuality(quality) {
    this.quality = quality;
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  get clockLabel() {
    const hours = Math.floor(this.timeHours);
    const minutes = Math.floor((this.timeHours - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
}

export { WEATHER };
