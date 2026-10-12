import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math.js';

function shadow(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }

function limb(material, length, radius = .11) {
  const pivot = new THREE.Group();
  const mesh = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(.05, length - radius * 2), 3, 6), material));
  mesh.position.y = -length * .5;
  pivot.add(mesh);
  return pivot;
}

function createPlayerModel() {
  const root = new THREE.Group();
  root.name = 'Player — island explorer';
  const skin = new THREE.MeshStandardMaterial({ color: 0x9b6548, roughness: .82 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x18a99e, roughness: .9 });
  const shorts = new THREE.MeshStandardMaterial({ color: 0x273f48, roughness: .92 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x172024, roughness: .96 });
  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(.42, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .22, depthWrite: false }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = .02;
  root.add(contactShadow);

  const torso = shadow(new THREE.Mesh(new THREE.CapsuleGeometry(.32, .58, 5, 8), shirt));
  torso.position.y = 1.34;
  torso.scale.set(1, 1, .7);
  root.add(torso);
  const head = shadow(new THREE.Mesh(new THREE.SphereGeometry(.22, 12, 8), skin));
  head.position.set(0, 1.98, .015);
  root.add(head);
  const hair = shadow(new THREE.Mesh(new THREE.SphereGeometry(.225, 10, 6, 0, Math.PI * 2, 0, Math.PI * .48), shoe));
  hair.position.set(0, 2.02, .005);
  root.add(hair);

  const leftArm = limb(skin, .72, .105); leftArm.position.set(-.39, 1.62, 0); root.add(leftArm);
  const rightArm = limb(skin, .72, .105); rightArm.position.set(.39, 1.62, 0); root.add(rightArm);
  const leftLeg = limb(shorts, .84, .14); leftLeg.position.set(-.17, .93, 0); root.add(leftLeg);
  const rightLeg = limb(shorts, .84, .14); rightLeg.position.set(.17, .93, 0); root.add(rightLeg);
  const leftShoe = shadow(new THREE.Mesh(new THREE.BoxGeometry(.22, .15, .42), shoe)); leftShoe.position.set(-.17, .1, .09); root.add(leftShoe);
  const rightShoe = leftShoe.clone(); rightShoe.position.x = .17; root.add(rightShoe);

  root.userData.rig = { torso, head, leftArm, rightArm, leftLeg, rightLeg, leftShoe, rightShoe };
  return root;
}

export class PlayerController {
  constructor(scene, world) {
    this.world = world;
    this.object = createPlayerModel();
    this.object.position.set(-1204, world.heightAt(-1204, 1831), 1831);
    this.object.rotation.y = 1.4;
    scene.add(this.object);
    this.velocity = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.facing = 1.4;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.swimming = false;
    this.crouched = false;
    this.inVehicle = false;
    this.distanceTravelled = 0;
    this.stepPhase = 0;
    this.speed = 0;
    this.cameraTarget = new THREE.Vector3();
  }

  update(input, cameraYaw, dt) {
    if (this.inVehicle) return;
    const moveX = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    const moveZ = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0);
    const inputLength = Math.hypot(moveX, moveZ);
    const forwardX = Math.sin(cameraYaw);
    const forwardZ = Math.cos(cameraYaw);
    const rightX = Math.cos(cameraYaw);
    const rightZ = -Math.sin(cameraYaw);
    this.desired.set(forwardX * moveZ + rightX * moveX, 0, forwardZ * moveZ + rightZ * moveX);
    if (inputLength > 0) this.desired.normalize();

    const coast = this.world.coastDistanceAt(this.object.position.x, this.object.position.z);
    const ground = this.world.heightAt(this.object.position.x, this.object.position.z);
    this.swimming = coast < -3 && this.object.position.y < 1.1;
    this.crouched = !this.swimming && input.down('KeyC');
    const sprinting = input.down('ShiftLeft', 'ShiftRight') && !this.crouched && !this.swimming;
    const maxSpeed = this.swimming ? 3.1 : this.crouched ? 2.2 : sprinting ? 8.4 : 4.7;
    const acceleration = this.swimming ? 4 : this.grounded ? 13 : 3.5;
    const targetVX = this.desired.x * maxSpeed;
    const targetVZ = this.desired.z * maxSpeed;
    this.velocity.x = damp(this.velocity.x, targetVX, acceleration, dt);
    this.velocity.z = damp(this.velocity.z, targetVZ, acceleration, dt);

    if (this.swimming) {
      this.verticalVelocity = 0;
      this.object.position.y = damp(this.object.position.y, .58, 7, dt);
      if (input.down('Space')) this.object.position.y = damp(this.object.position.y, .85, 5, dt);
      this.grounded = false;
    } else {
      if (this.grounded && input.justPressed('Space') && !this.crouched) {
        this.verticalVelocity = 6.2;
        this.grounded = false;
      }
      this.verticalVelocity -= 17.5 * dt;
      this.object.position.y += this.verticalVelocity * dt;
      const nextGround = this.world.heightAt(this.object.position.x, this.object.position.z);
      if (this.object.position.y <= nextGround) {
        this.object.position.y = nextGround;
        this.verticalVelocity = 0;
        this.grounded = true;
      }
    }

    const previousX = this.object.position.x;
    const previousZ = this.object.position.z;
    this.object.position.x += this.velocity.x * dt;
    this.object.position.z += this.velocity.z * dt;
    this.distanceTravelled += Math.hypot(this.object.position.x - previousX, this.object.position.z - previousZ);
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);

    if (this.speed > .18) {
      const targetFacing = Math.atan2(this.velocity.x, this.velocity.z);
      this.facing = dampAngle(this.facing, targetFacing, this.swimming ? 4 : 11, dt);
    }
    this.object.rotation.y = this.facing;
    this.#animate(dt, sprinting);

    if (coast < -900 || this.object.position.y < -15) this.resetToAirport();
  }

  #animate(dt, sprinting) {
    const rig = this.object.userData.rig;
    const motion = clamp(this.speed / 4.5, 0, 1.6);
    this.stepPhase += dt * (3.8 + this.speed * 1.25);
    const swing = Math.sin(this.stepPhase) * .72 * motion;
    if (this.swimming) {
      rig.leftArm.rotation.x = Math.sin(this.stepPhase * .65) * 1.05;
      rig.rightArm.rotation.x = Math.sin(this.stepPhase * .65 + Math.PI) * 1.05;
      rig.leftLeg.rotation.x = Math.sin(this.stepPhase * .9) * .34;
      rig.rightLeg.rotation.x = -rig.leftLeg.rotation.x;
      rig.torso.rotation.x = .55;
    } else {
      rig.leftArm.rotation.x = -swing * .75;
      rig.rightArm.rotation.x = swing * .75;
      rig.leftLeg.rotation.x = swing;
      rig.rightLeg.rotation.x = -swing;
      rig.torso.rotation.x = 0;
    }
    const crouch = this.crouched ? .48 : 0;
    rig.torso.position.y = 1.34 - crouch;
    rig.head.position.y = 1.98 - crouch;
    rig.head.rotation.x = sprinting ? -.08 : 0;
    const bob = this.grounded && this.speed > .3 ? Math.abs(Math.sin(this.stepPhase * 2)) * .028 * motion : 0;
    rig.torso.position.y += bob;
    this.object.scale.y = damp(this.object.scale.y, this.crouched ? .88 : 1, 12, dt);
  }

  getTarget(out = this.cameraTarget) {
    return out.set(this.object.position.x, this.object.position.y + (this.crouched ? 1.25 : 1.55), this.object.position.z);
  }

  setInVehicle(value) {
    this.inVehicle = value;
    this.object.visible = !value;
    if (value) this.velocity.set(0, 0, 0);
  }

  placeAt(x, z, yaw = this.facing) {
    this.object.position.set(x, this.world.heightAt(x, z), z);
    this.facing = yaw;
    this.object.rotation.y = yaw;
    this.verticalVelocity = 0;
    this.velocity.set(0, 0, 0);
  }

  resetToAirport() { this.placeAt(-1204, 1831, 1.4); }

  serialize() {
    return { x: this.object.position.x, y: this.object.position.y, z: this.object.position.z, yaw: this.facing, distance: this.distanceTravelled };
  }

  restore(data) {
    if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.z)) return false;
    this.placeAt(data.x, data.z, Number.isFinite(data.yaw) ? data.yaw : 0);
    this.distanceTravelled = Number(data.distance || 0);
    return true;
  }
}
