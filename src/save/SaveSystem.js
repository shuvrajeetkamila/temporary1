const SAVE_KEY = 'nauru.save.v1';
const SAVE_VERSION = 2;

export class SaveSystem {
  constructor() {
    this.timer = 0;
    this.interval = 8;
  }

  get hasSave() { return localStorage.getItem(SAVE_KEY) !== null; }

  save({ player, vehicle, world, hud, inVehicle }) {
    const payload = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      player: player.serialize(),
      vehicle: vehicle.serialize(),
      world: { timeHours: world.atmosphere.timeHours, weather: world.atmosphere.weather.id, navigation: world.navigation.serialize() },
      hud: hud.serialize(),
      inVehicle: Boolean(inVehicle),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    this.timer = this.interval;
    return payload;
  }

  load() {
    try {
      const payload = JSON.parse(localStorage.getItem(SAVE_KEY));
      return payload?.version >= 1 && payload.version <= SAVE_VERSION ? payload : null;
    } catch {
      return null;
    }
  }

  restore(payload, { player, vehicle, world, hud }) {
    if (!payload) return false;
    player.restore(payload.player);
    vehicle.restore(payload.vehicle);
    if (Number.isFinite(payload.world?.timeHours)) world.atmosphere.timeHours = payload.world.timeHours;
    if (payload.world?.weather) world.atmosphere.setWeather(payload.world.weather);
    world.navigation.restore(payload.world?.navigation);
    hud.restore(payload.hud);
    return Boolean(payload.inVehicle);
  }

  update(dt, state) {
    this.timer -= dt;
    if (this.timer <= 0) this.save(state);
  }

  clear() { localStorage.removeItem(SAVE_KEY); }
}

export { SAVE_KEY };
