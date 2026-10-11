import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math.js';

export class ThirdPersonCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 2.38;
    this.pitch = .26;
    this.distanceOffset = 0;
    this.mode = 0;
    this.manualTimer = 0;
    this.position = new THREE.Vector3(278, 12, 1504);
    this.lookTarget = new THREE.Vector3(285, 2, 1515);
    this.desiredPosition = new THREE.Vector3();
    this.desiredLook = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.camera.position.copy(this.position);
  }

  update(input, target, targetType, targetYaw, targetSpeed, dt) {
    const mouseScale = .00205 * input.sensitivity;
    if (Math.abs(input.mouseDX) + Math.abs(input.mouseDY) > 0) this.manualTimer = 2.4;
    else this.manualTimer = Math.max(0, this.manualTimer - dt);
    this.yaw -= input.mouseDX * mouseScale;
    this.pitch = clamp(this.pitch - input.mouseDY * mouseScale * .74, -.22, 1.03);
    if (input.wheel !== 0 && this.mode === 0) this.distanceOffset = clamp(this.distanceOffset + input.wheel * 1.2, -2.5, 8);

    if (targetType === 'vehicle' && this.manualTimer <= 0 && Math.abs(targetSpeed) > 2.5) {
      const followYaw = targetSpeed < 0 ? targetYaw + Math.PI : targetYaw;
      this.yaw = dampAngle(this.yaw, followYaw, 1.35, dt);
    }
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    if (this.mode === 1) {
      this.#updateFirstPerson(target, targetType, dt);
    } else {
      this.#updateThirdPerson(target, targetType, targetSpeed, dt);
    }

    const desiredFov = this.mode === 1 ? 71 : (targetType === 'vehicle' ? 63 + clamp(Math.abs(targetSpeed) / 43, 0, 1) * 8 : 62);
    this.camera.fov = damp(this.camera.fov, desiredFov, 4, dt);
    this.camera.updateProjectionMatrix();
  }

  #updateThirdPerson(target, targetType, targetSpeed, dt) {
    const baseDistance = targetType === 'vehicle' ? 10.5 : 6.3;
    const speedDistance = targetType === 'vehicle' ? clamp(Math.abs(targetSpeed) * .08, 0, 3.3) : 0;
    const distance = baseDistance + this.distanceOffset + speedDistance;
    const horizontal = Math.cos(this.pitch) * distance;
    const vertical = Math.sin(this.pitch) * distance + (targetType === 'vehicle' ? 1 : .45);
    this.desiredPosition.set(
      target.x - this.forward.x * horizontal,
      target.y + vertical,
      target.z - this.forward.z * horizontal,
    );
    this.#avoidTerrain(target, this.desiredPosition);
    const smoothing = targetType === 'vehicle' ? 6.5 : 10;
    this.position.lerp(this.desiredPosition, 1 - Math.exp(-smoothing * dt));
    this.desiredLook.copy(target);
    if (targetType === 'vehicle') this.desiredLook.y += .22;
    this.lookTarget.lerp(this.desiredLook, 1 - Math.exp(-11 * dt));
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookTarget);
  }

  #updateFirstPerson(target, targetType, dt) {
    const eyeHeight = targetType === 'vehicle' ? .28 : .42;
    this.desiredPosition.copy(target).addScaledVector(this.forward, targetType === 'vehicle' ? .38 : .08);
    this.desiredPosition.y += eyeHeight;
    this.position.lerp(this.desiredPosition, 1 - Math.exp(-18 * dt));
    const horizontal = Math.cos(this.pitch);
    this.desiredLook.set(
      this.position.x + this.forward.x * horizontal * 20,
      this.position.y + Math.sin(this.pitch) * 20,
      this.position.z + this.forward.z * horizontal * 20,
    );
    this.lookTarget.copy(this.desiredLook);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookTarget);
  }

  #avoidTerrain(target, desired) {
    let safeT = 1;
    for (let i = 2; i <= 12; i += 1) {
      const t = i / 12;
      const x = target.x + (desired.x - target.x) * t;
      const y = target.y + (desired.y - target.y) * t;
      const z = target.z + (desired.z - target.z) * t;
      const terrain = this.world.heightAt(x, z) + .58;
      if (terrain > y) { safeT = Math.max(.12, (i - 2) / 12); break; }
    }
    if (safeT < 1) desired.lerpVectors(target, desired, safeT);
    desired.y = Math.max(desired.y, this.world.heightAt(desired.x, desired.z) + .55);
  }

  toggleMode() { this.mode = (this.mode + 1) % 2; return this.mode; }
  alignTo(yaw) { this.yaw = yaw; this.manualTimer = 0; }
  snap(target, targetType = 'player') {
    const distance = targetType === 'vehicle' ? 10.5 : 6.3;
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.position.set(target.x - this.forward.x * distance, target.y + 3, target.z - this.forward.z * distance);
    this.lookTarget.copy(target);
    this.camera.position.copy(this.position);
    this.camera.lookAt(target);
  }
}
