import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math.js';

function standard(color, roughness = .7, metalness = .08) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function addMesh(parent, geometry, material, position, name, cast = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createIslandRunner() {
  const root = new THREE.Group();
  root.name = 'Island Runner — original compact utility car';
  const visual = new THREE.Group();
  root.add(visual);
  const paint = standard(0xe2a742, .38, .28);
  const darkPaint = standard(0x263637, .52, .22);
  const glass = new THREE.MeshStandardMaterial({ color: 0x78aeb7, roughness: .12, metalness: .18, transparent: true, opacity: .72 });
  const rubber = standard(0x15191a, .92, .03);
  const rim = standard(0xa9b2ae, .3, .65);
  const light = new THREE.MeshStandardMaterial({ color: 0xffe8ba, emissive: 0xffd487, emissiveIntensity: 1.4, roughness: .25 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xa6241c, emissive: 0x5f0804, emissiveIntensity: .8, roughness: .3 });

  addMesh(visual, new THREE.BoxGeometry(1.86, .5, 4.05), paint, [0, .72, 0], 'Lower body');
  addMesh(visual, new THREE.BoxGeometry(1.72, .32, 2.7), paint, [0, 1.02, -.25], 'Shoulder line');
  const cabin = addMesh(visual, new THREE.BoxGeometry(1.58, .72, 1.82), glass, [0, 1.43, -.32], 'Cabin glazing');
  cabin.geometry.translate(0, 0, 0);
  addMesh(visual, new THREE.BoxGeometry(1.66, .12, 2.02), darkPaint, [0, 1.82, -.35], 'Floating roof');
  addMesh(visual, new THREE.BoxGeometry(1.45, .1, .5), darkPaint, [0, .55, 2.05], 'Front bumper');
  addMesh(visual, new THREE.BoxGeometry(1.5, .11, .36), darkPaint, [0, .54, -2.08], 'Rear bumper');
  addMesh(visual, new THREE.BoxGeometry(.36, .18, .08), light, [-.58, .84, 2.045], 'Left headlamp', false);
  addMesh(visual, new THREE.BoxGeometry(.36, .18, .08), light, [.58, .84, 2.045], 'Right headlamp', false);
  addMesh(visual, new THREE.BoxGeometry(.3, .2, .08), tail, [-.59, .85, -2.045], 'Left tail lamp', false);
  addMesh(visual, new THREE.BoxGeometry(.3, .2, .08), tail, [.59, .85, -2.045], 'Right tail lamp', false);
  addMesh(visual, new THREE.BoxGeometry(.55, .16, .05), darkPaint, [0, .77, 2.08], 'Original grille');

  const wheels = [];
  const wheelPositions = [[-.96, .47, 1.32], [.96, .47, 1.32], [-.96, .47, -1.32], [.96, .47, -1.32]];
  wheelPositions.forEach(([x, y, z], index) => {
    const steerPivot = new THREE.Group();
    steerPivot.position.set(x, y, z);
    visual.add(steerPivot);
    const wheel = new THREE.Group();
    const tyre = addMesh(wheel, new THREE.CylinderGeometry(.43, .43, .25, 14), rubber, [0, 0, 0], `Tyre ${index}`);
    tyre.rotation.z = Math.PI / 2;
    const hub = addMesh(wheel, new THREE.CylinderGeometry(.2, .2, .27, 10), rim, [0, 0, 0], `Wheel hub ${index}`);
    hub.rotation.z = Math.PI / 2;
    steerPivot.add(wheel);
    wheels.push({ pivot: steerPivot, wheel, tyre, hub, front: index < 2 });
  });

  root.userData.visual = visual;
  root.userData.wheels = wheels;
  root.userData.paint = paint;
  return root;
}

export class IslandRunner {
  constructor(scene, world) {
    this.world = world;
    this.object = createIslandRunner();
    this.position = this.object.position;
    this.yaw = 1.4;
    this.speed = 0;
    this.steering = 0;
    this.wheelSpin = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.controlled = false;
    this.distanceTravelled = 0;
    this.surface = 'OFF ROAD';
    this.reset();
    scene.add(this.object);
  }

  update(input, dt, controlled) {
    this.controlled = controlled;
    const accelerating = controlled && input.down('KeyW', 'ArrowUp');
    const reversing = controlled && input.down('KeyS', 'ArrowDown');
    const steerInput = controlled ? ((input.down('KeyA', 'ArrowLeft') ? 1 : 0) - (input.down('KeyD', 'ArrowRight') ? 1 : 0)) : 0;
    this.handbrake = controlled && input.down('Space');
    this.surface = this.world.surfaceAt(this.position.x, this.position.z);
    const onRoad = this.surface !== 'OFF ROAD';
    const traction = onRoad ? 1 : .54;
    const maxForward = onRoad ? 43 : 19;
    const maxReverse = onRoad ? -13 : -8;
    let force = 0;
    this.throttle = 0;
    this.brake = 0;

    if (accelerating) {
      if (this.speed > -1.2) {
        const powerFalloff = 1 - clamp(this.speed / maxForward, 0, 1) * .72;
        force += 7.8 * powerFalloff * traction;
        this.throttle = 1;
      } else {
        force += 15;
        this.brake = 1;
      }
    }
    if (reversing) {
      if (this.speed > 1.1) {
        force -= 14;
        this.brake = 1;
      } else {
        force -= 5.4 * traction;
        this.throttle = .65;
      }
    }

    const rolling = .24 + (onRoad ? .08 : 1.35);
    const aero = .009 * this.speed * Math.abs(this.speed);
    if (Math.abs(this.speed) > .01) force -= Math.sign(this.speed) * rolling;
    force -= aero;
    if (this.handbrake) force -= Math.sign(this.speed || 1) * Math.min(Math.abs(this.speed) / Math.max(dt, .001), 24);
    if (!controlled && Math.abs(this.speed) < .22) this.speed = 0;
    else this.speed += force * dt;
    this.speed = clamp(this.speed, maxReverse, maxForward);
    if (!accelerating && !reversing && Math.abs(this.speed) < .08) this.speed = 0;

    const steerLimit = .56 * (1 - clamp(Math.abs(this.speed) / 62, 0, .52));
    this.steering = damp(this.steering, steerInput * steerLimit, this.handbrake ? 12 : 7, dt);
    if (Math.abs(this.speed) > .08) {
      const slip = this.handbrake ? 1.45 : 1;
      this.yaw += Math.tan(this.steering) * (this.speed / 2.55) * dt * slip;
    }

    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    const oldX = this.position.x;
    const oldZ = this.position.z;
    this.position.x += forwardX * this.speed * dt;
    this.position.z += forwardZ * this.speed * dt;
    this.distanceTravelled += Math.hypot(this.position.x - oldX, this.position.z - oldZ);

    const coast = this.world.coastDistanceAt(this.position.x, this.position.z);
    if (coast < -5) this.speed *= Math.exp(-dt * (coast < -25 ? 5 : 1.5));
    if (coast < -85) this.reset();

    this.#updatePose(dt);
  }

  #updatePose(dt) {
    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    const ground = this.world.heightAt(this.position.x, this.position.z);
    const front = this.world.heightAt(this.position.x + forwardX * 1.25, this.position.z + forwardZ * 1.25);
    const rear = this.world.heightAt(this.position.x - forwardX * 1.25, this.position.z - forwardZ * 1.25);
    const left = this.world.heightAt(this.position.x - rightX * .8, this.position.z - rightZ * .8);
    const right = this.world.heightAt(this.position.x + rightX * .8, this.position.z + rightZ * .8);
    this.position.y = damp(this.position.y, ground + .03, 14, dt);
    this.object.rotation.y = this.yaw;
    const visual = this.object.userData.visual;
    const pitch = Math.atan2(rear - front, 2.5);
    const terrainRoll = Math.atan2(left - right, 1.6);
    const bodyRoll = -this.steering * clamp(Math.abs(this.speed) / 24, 0, 1) * .18;
    visual.rotation.x = damp(visual.rotation.x, pitch, 9, dt);
    visual.rotation.z = damp(visual.rotation.z, terrainRoll + bodyRoll, 8, dt);
    visual.position.y = damp(visual.position.y, this.handbrake ? -.025 : 0, 10, dt);

    this.wheelSpin += this.speed * dt / .43;
    for (const wheel of this.object.userData.wheels) {
      wheel.pivot.rotation.y = wheel.front ? this.steering : 0;
      wheel.tyre.rotation.y = this.wheelSpin;
      wheel.hub.rotation.y = this.wheelSpin;
    }
  }

  distanceTo(position) { return Math.hypot(this.position.x - position.x, this.position.y - position.y, this.position.z - position.z); }

  getTarget(out = new THREE.Vector3()) { return out.set(this.position.x, this.position.y + 1.3, this.position.z); }
  get speedKmh() { return Math.abs(this.speed) * 3.6; }
  get gear() { return this.speed < -.5 ? 'R' : this.speed > .5 ? (this.speedKmh > 90 ? '4' : this.speedKmh > 60 ? '3' : this.speedKmh > 28 ? '2' : '1') : 'P'; }
  get rpm() { return clamp((Math.abs(this.speed) / 43) * .72 + this.throttle * .3, .05, 1); }

  exitPosition() {
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    let x = this.position.x + rightX * 2.3;
    let z = this.position.z + rightZ * 2.3;
    if (this.world.coastDistanceAt(x, z) < 0) { x = this.position.x - rightX * 2.3; z = this.position.z - rightZ * 2.3; }
    return { x, z, yaw: this.yaw + Math.PI * .5 };
  }

  reset() {
    this.position.set(-632, this.world.heightAt(-632, 1764) + .03, 1764);
    this.yaw = 1.4;
    this.speed = 0;
    this.steering = 0;
    this.object.rotation.y = this.yaw;
  }

  serialize() { return { x: this.position.x, z: this.position.z, yaw: this.yaw, speed: this.speed, distance: this.distanceTravelled }; }
  restore(data) {
    if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return false;
    this.position.set(data.x, this.world.heightAt(data.x, data.z) + .03, data.z);
    this.yaw = Number.isFinite(data.yaw) ? data.yaw : 0;
    this.speed = clamp(Number(data.speed || 0), -13, 43);
    this.distanceTravelled = Number(data.distance || 0);
    return true;
  }
}
