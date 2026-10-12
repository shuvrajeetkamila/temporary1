import { clamp, wrapAngle } from '../core/math.js';

const DEFAULT_ARRIVAL_RADIUS = 42;

export function headingFromVector(x, z) {
  const degrees = Math.round((Math.atan2(x, z) * 180 / Math.PI + 360) % 360);
  return degrees === 360 ? 0 : degrees;
}

export function formatNavigationDistance(distance) {
  if (!Number.isFinite(distance)) return '—';
  if (distance < 1_000) return `${Math.round(distance)} m`;
  return `${(distance / 1_000).toFixed(distance < 10_000 ? 1 : 0)} km`;
}

/**
 * A deliberately lightweight GPS layer. It keeps map markers independent from the
 * renderer and is suitable for future road-routing without changing the HUD/save API.
 */
export class Navigation {
  constructor({ arrivalRadius = DEFAULT_ARRIVAL_RADIUS } = {}) {
    this.arrivalRadius = arrivalRadius;
    this.waypoint = null;
    this.status = { active: false, justArrived: false };
  }

  get active() { return this.waypoint !== null; }

  setWaypoint({ x, z, name = 'Custom waypoint', detail = 'Player waypoint', landmarkId = null } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    this.waypoint = { x, z, name: String(name).slice(0, 64), detail: String(detail).slice(0, 96), landmarkId };
    this.status = { active: true, justArrived: false, arrived: false, distance: Infinity, bearing: 0, relativeBearing: 0, heading: 0, waypoint: this.waypoint };
    return true;
  }

  clear() {
    this.waypoint = null;
    this.status = { active: false, justArrived: false };
  }

  update(position, facing = 0) {
    if (!this.waypoint || !position) {
      this.status = { active: false, justArrived: false };
      return this.status;
    }
    const dx = this.waypoint.x - position.x;
    const dz = this.waypoint.z - position.z;
    const distance = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, dz);
    const wasArrived = Boolean(this.status.arrived);
    const arrived = distance <= this.arrivalRadius;
    this.status = {
      active: true,
      waypoint: this.waypoint,
      distance,
      bearing,
      relativeBearing: wrapAngle(bearing - facing),
      heading: headingFromVector(dx, dz),
      arrived,
      justArrived: arrived && !wasArrived,
    };
    return this.status;
  }

  serialize() {
    return this.waypoint ? { ...this.waypoint } : null;
  }

  restore(data) {
    if (!data) {
      this.clear();
      return false;
    }
    return this.setWaypoint(data);
  }
}
