import { clamp, damp } from '../core/math.js';

export class AudioSystem {
  constructor() {
    this.context = null;
    this.master = null;
    this.started = false;
    this.engineGain = null;
    this.engineOscillators = [];
    this.oceanGain = null;
    this.windGain = null;
    this.rainGain = null;
    this.stepTimer = 0;
    this.currentEngineGain = 0;
  }

  async start() {
    if (this.started) {
      await this.context?.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = .42;
    this.master.connect(this.context.destination);

    const engineFilter = this.context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 1100;
    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(engineFilter).connect(this.master);
    for (const [type, frequency, gain] of [['sawtooth', 45, .38], ['triangle', 91, .18]]) {
      const oscillator = this.context.createOscillator();
      const oscillatorGain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillatorGain.gain.value = gain;
      oscillator.connect(oscillatorGain).connect(this.engineGain);
      oscillator.start();
      this.engineOscillators.push({ oscillator, base: frequency });
    }

    this.oceanGain = this.#noiseBed('lowpass', 620, .07);
    this.windGain = this.#noiseBed('bandpass', 1150, .025);
    this.rainGain = this.#noiseBed('highpass', 1700, 0);
    this.started = true;
  }

  #noiseBed(type, frequency, initialGain) {
    const length = this.context.sampleRate * 3;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * .72 + white * .28;
      channel[i] = previous;
    }
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = this.context.createGain();
    gain.gain.value = initialGain;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    return gain;
  }

  update({ inVehicle, vehicle, player, weather, coastDistance }, dt) {
    if (!this.started || this.context.state === 'suspended') return;
    const engineTarget = inVehicle ? .045 + vehicle.throttle * .09 + clamp(Math.abs(vehicle.speed) / 43, 0, 1) * .055 : 0;
    this.currentEngineGain = damp(this.currentEngineGain, engineTarget, 8, dt);
    this.engineGain.gain.setTargetAtTime(this.currentEngineGain, this.context.currentTime, .06);
    const rpm = 1 + vehicle.rpm * 3.2;
    this.engineOscillators.forEach(({ oscillator, base }, index) => oscillator.frequency.setTargetAtTime(base * rpm * (index ? 1.04 : 1), this.context.currentTime, .05));

    const shore = clamp(1 - Math.abs(coastDistance - 35) / 900, .05, 1);
    this.oceanGain.gain.setTargetAtTime(.018 + shore * .065, this.context.currentTime, .4);
    this.windGain.gain.setTargetAtTime(.012 + weather.cloud * .035 + clamp(player.object.position.y / 60, 0, 1) * .02, this.context.currentTime, .35);
    this.rainGain.gain.setTargetAtTime(weather.rain * .16, this.context.currentTime, .18);

    if (!inVehicle && !player.swimming && player.grounded && player.speed > 1) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.#footstep(player.speed);
        this.stepTimer = player.speed > 6 ? .26 : .43;
      }
    } else this.stepTimer = 0;
  }

  #footstep(speed) {
    const duration = .055;
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 650;
    const gain = this.context.createGain(); gain.gain.value = .035 + clamp(speed / 10, 0, 1) * .02;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  cue(frequency = 420, duration = .1) {
    if (!this.started) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.045, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(); oscillator.stop(this.context.currentTime + duration);
  }
}
