// Procedural ambience (spec Part E "soundscape"): sea, city hum, rain, wind,
// honks, thunder. All synthesized — no assets, fully offline.
"use strict";
(function () {
  const G = window.G;
  const A = G.AUDIO = { on: false, ready: false };

  function makeNoise(len) {
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.98 * b0 + w * 0.02; d[i] = b0 * 3.5; }
    return buf;
  }
  function loopNoise(filterType, freq) {
    const src = A.ctx.createBufferSource();
    src.buffer = A.noise; src.loop = true;
    const f = A.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
    const g = A.ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start();
    return { src, f, g };
  }

  A.init = function () {
    if (A.ready) return;
    try { A.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    A.master = A.ctx.createGain(); A.master.gain.value = 0; A.master.connect(A.ctx.destination);
    A.noise = makeNoise(A.ctx.sampleRate * 2);
    A.sea = loopNoise("lowpass", 400);
    A.city = loopNoise("lowpass", 180);
    A.rain = loopNoise("highpass", 2600);
    A.wind = loopNoise("bandpass", 700);
    A.ready = true;
  };

  G.on("sound", on => {
    A.on = on;
    if (on) { A.init(); if (A.ctx && A.ctx.state === "suspended") A.ctx.resume(); }
  });
  G.on("thunder", () => {
    if (!A.ready || !A.on) return;
    const src = A.ctx.createBufferSource(); src.buffer = A.noise;
    const f = A.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 120;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0.8, A.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + 2.5);
    src.connect(f); f.connect(g); g.connect(A.master);
    src.start(); src.stop(A.ctx.currentTime + 2.6);
  });

  // local-train horn: two-tone, flat-characteristic like a WR/CR EMU
  G.on("trainstop", t => {
    if (!A.ready || !A.on) return;
    const d = G.dist(t.x, t.y, G.PL.x, G.PL.y);
    if (d > 600) return;
    const vol = 0.14 * (1 - d / 600);
    const now = A.ctx.currentTime;
    [440, 554].forEach(f0 => {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = f0;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(vol, now + 0.05);
      g.gain.setValueAtTime(vol, now + 0.55);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      o.connect(g); g.connect(A.master);
      o.start(now); o.stop(now + 0.85);
    });
  });

  // dawn chorus near parks/beaches/water (5–8 h)
  let birdT = 0;
  function chirp() {
    const now = A.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = A.ctx.createOscillator(), g = A.ctx.createGain();
      o.type = "sine";
      const t0 = now + i * 0.14 + Math.random() * 0.05;
      o.frequency.setValueAtTime(2100 + Math.random() * 1400, t0);
      o.frequency.exponentialRampToValueAtTime(1400 + Math.random() * 900, t0 + 0.09);
      g.gain.setValueAtTime(0.05, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      o.connect(g); g.connect(A.master);
      o.start(t0); o.stop(t0 + 0.14);
    }
  }

  A.update = function (dt) {
    if (!A.ready || !A.on) return;
    const pl = G.PL, env = G.ENV, t = G.ENV.t;
    // distance to water
    const k = G.TERRAIN.kindAt(pl.x, pl.y, env.tide());
    const seaG = k.water ? 0.16 : 0.05;
    A.sea.g.gain.value += (seaG * (1 + env.windSpd * 0.03) - A.sea.g.gain.value) * Math.min(1, dt * 2);
    const near = G.POI.nearest(pl.x, pl.y, 2500);
    const cityG = near ? 0.10 * (1 - near._d / 2500) : 0.02;
    A.city.g.gain.value += (cityG - A.city.g.gain.value) * Math.min(1, dt * 2);
    A.rain.g.gain.value += (env.rain * 0.22 - A.rain.g.gain.value) * Math.min(1, dt);
    A.wind.g.gain.value += ((env.windSpd / 30 + (G.VEHTYPES[pl.mode].air ? pl.alt / 800 : 0)) * 0.3 - A.wind.g.gain.value) * Math.min(1, dt);
    // honks near traffic
    if (Math.random() < dt * 0.25) {
      const c = G.TRAFFIC.cars.find(c => c.honk > 0 && G.dist(c.x, c.y, pl.x, pl.y) < 400);
      if (c) honk();
    }
    // dawn birdsong near green/water edges
    birdT -= dt;
    if (birdT <= 0) {
      birdT = 4 + Math.random() * 6;
      const h = env.hourFrac();
      if (h >= 5 && h <= 8) {
        const p = G.POI.nearest(pl.x, pl.y, 1400);
        if (p && (p.cat === "nature" || p.cat === "beach" || p.cat === "lake" || p.cat === "water")) chirp();
      }
    }
  };
  function honk() {
    if (!A.ready || !A.on) return;
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = "square"; o.frequency.value = 380 + Math.random() * 260;
    g.gain.setValueAtTime(0.05, A.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, A.ctx.currentTime + 0.35);
    o.connect(g); g.connect(A.master); o.start(); o.stop(A.ctx.currentTime + 0.4);
  }
})();
