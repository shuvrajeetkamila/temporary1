// Environment: clock, sun/moon arc (lat 19N), seasons, monsoon, tides, wind
"use strict";
(function () {
  const G = window.G;
  const DAY = 86400;
  // t = seconds; 0 => 2026-06-15 06:00 IST-ish (a monsoon morning) unless saved
  const W = G.ENV = {
    t: 0, scale: 60,           // 1 game-sec per real-sec * 60 (1 day ≈ 24 min)
    rain: 0, rainTarget: 0, windDir: Math.PI * 0.9, windSpd: 4,
    lightning: 0, started: false,
    epoch0: Date.UTC(2026, 5, 15, 6, 0, 0) / 1000,
    baseReal: 0,
    startRealClock() { this.baseReal = Date.now() / 1000; this.t = (Date.now() / 1000 + 19800 - this.epoch0) % (86400 * 365); }, // real IST clock, day-of-year phase
    date() {
      const d = new Date((this.epoch0 + this.t) * 1000);
      return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
    },
    hourFrac() { const d = this.date(); return d.h + d.mi / 60; },
    update(dt) {
      this.t += dt * this.scale;
      // monsoon rain model by month
      const mo = this.date().mo;
      const p = { 1: .02, 2: .02, 3: .05, 4: .10, 5: .25, 6: .72, 7: .88, 8: .85, 9: .60, 10: .22, 11: .04, 12: .02 }[mo];
      if (!this._nextCheck || this.t > this._nextCheck) {
        this._nextCheck = this.t + 600 * 20; // every ~20 game-min decide target
        this.rainTarget = Math.random() < p ? (0.3 + Math.random() * 0.7) : 0;
      }
      this.rain = G.smooth(this.rain, this.rainTarget, dt, 0.02);
      // lightning in monsoon
      if (this.rain > 0.5 && Math.random() < dt * 0.008 * this.rain) { this.lightning = 1; G.emit("thunder"); }
      this.lightning = Math.max(0, this.lightning - dt * 2.2);
      // wind: strong SW monsoon
      const target = mo >= 6 && mo <= 9 ? 9 : mo === 5 || mo === 10 ? 6 : 3.5;
      this.windSpd = G.smooth(this.windSpd, target, dt, 0.01);
    },
    season() {
      const mo = this.date().mo, d = this.date().d;
      if ((mo === 6 && d >= 5) || mo === 7 || mo === 8 || (mo === 9 && d <= 30)) return "monsoon";
      if (mo === 10 || mo === 11) return "post-monsoon";
      if (mo === 12 || mo === 1 || mo === 2) return "winter";
      return "summer";
    },
    // semi-diurnal tide, M2+S2, ~4 m range in Ulhas estuary (spec Part E)
    tide() {
      const hr = this.t / 3600;
      const m2 = Math.sin(hr / 12.4206 * 2 * Math.PI);
      const s2 = Math.sin(hr / 12.0 * 2 * Math.PI);
      const syn = Math.sin((this.t / 86400) / 29.53 * 2 * Math.PI); // spring/neap
      const amp = 1.55 + 0.45 * syn;
      return G.clamp(2.0 + amp * m2 + 0.35 * amp * s2 * 0.6, 0.2, 4.2);
    },
    // sun altitude/radiance
    sun() {
      const { mo, d, h } = this.date();
      const dayOfYear = Math.floor((Date.UTC(2026, mo - 1, d) - Date.UTC(2026, 0, 1)) / 86400000);
      const decl = -23.44 * Math.cos(2 * Math.PI * (dayOfYear + 10) / 365) * Math.PI / 180;
      const H = (h - 12) / 24 * 2 * Math.PI;
      const lat = 19.1 * Math.PI / 180;
      const alt = Math.asin(Math.sin(decl) * Math.sin(lat) + Math.cos(decl) * Math.cos(lat) * Math.cos(H));
      return { alt, day: G.clamp(alt * 6, 0, 1), golden: Math.max(0, 1 - Math.abs(alt) / 0.22) * (alt > -0.22 ? 1 : 0) };
    },
    seasonTint() {
      switch (this.season()) {
        case "monsoon": return { land: "#5e7d4a", land2: "#516e40", dry: "#8ba06a", for: "#3d5c34" };
        case "post-monsoon": return { land: "#7a8a55", land2: "#6b7a4a", dry: "#9aa36a", for: "#4a6338" };
        case "winter": return { land: "#8a8a5e", land2: "#7a7a52", dry: "#a8a06e", for: "#4d6038" };
        default: return { land: "#9a8f5e", land2: "#8a8054", dry: "#b8a878", for: "#5a6a3c" };
      }
    },
    tempC() {
      const h = this.hourFrac(); const s = this.season();
      const base = { monsoon: 27, "post-monsoon": 29, winter: 25, summer: 33 }[s];
      return Math.round(base + 5 * Math.sin((h - 9) / 24 * 2 * Math.PI) - this.rain * 3);
    }
  };
})();
