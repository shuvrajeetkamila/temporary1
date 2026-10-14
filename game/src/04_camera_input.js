// Camera + pointer/touch/keyboard input
"use strict";
(function () {
  const G = window.G;
  const CAM = G.CAM = {
    x: 0, y: 0, zoom: 0.5, minZ: 0.028, maxZ: 28, follow: true,
    w: 0, h: 0,
    s2w(sx, sy) { return [this.x + (sx - this.w / 2) / this.zoom, this.y + (sy - this.h / 2) / this.zoom]; },
    w2s(wx, wy) { return [(wx - this.x) * this.zoom + this.w / 2, (wy - this.y) * this.zoom + this.h / 2]; },
    jumpTo(x, y, z) { this.x = x; this.y = y; if (z) this.zoom = G.clamp(z, this.minZ, this.maxZ); },
    // keep camera near player when following
    update(px, py, dt) { if (this.follow) { this.x = G.smooth(this.x, px, dt, 8); this.y = G.smooth(this.y, py, dt, 8); } }
  };
  const IN = G.IN = { keys: {}, joy: { x: 0, y: 0, active: false }, btn: {}, pointer: null, pinch: 0 };

  window.addEventListener("keydown", e => {
    IN.keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    G.emit("key", e.code);
  });
  window.addEventListener("keyup", e => { IN.keys[e.code] = false; });
  window.addEventListener("blur", () => { IN.keys = {}; });

  function initCanvas(cv) {
    let dragging = false, lastX = 0, lastY = 0, pinchD = 0;
    const rect = () => cv.getBoundingClientRect();
    cv.addEventListener("pointerdown", e => {
      cv.setPointerCapture(e.pointerId);
      IN.pointers = IN.pointers || {};
      IN.pointers[e.pointerId] = [e.clientX, e.clientY];
      const n = Object.keys(IN.pointers).length;
      if (n === 1) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
      if (n === 2) { const p = Object.values(IN.pointers); pinchD = G.dist(p[0][0], p[0][1], p[1][0], p[1][1]); dragging = false; }
    });
    cv.addEventListener("pointermove", e => {
      if (!IN.pointers || !IN.pointers[e.pointerId]) return;
      IN.pointers[e.pointerId] = [e.clientX, e.clientY];
      const n = Object.keys(IN.pointers).length;
      if (n === 2) {
        const p = Object.values(IN.pointers);
        const d = G.dist(p[0][0], p[0][1], p[1][0], p[1][1]);
        if (pinchD > 0) {
          const f = d / pinchD;
          const cx = (p[0][0] + p[1][0]) / 2, cy = (p[0][1] + p[1][1]) / 2;
          zoomAt(cx - rect().left, cy - rect().top, f);
        }
        pinchD = d;
      } else if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 0 && CAM.zoom > 0) {
          CAM.x -= dx / CAM.zoom; CAM.y -= dy / CAM.zoom;
          if (CAM.follow) { CAM.follow = false; G.emit("followoff"); }
        }
      }
    });
    const up = e => {
      if (IN.pointers) delete IN.pointers[e.pointerId];
      if (Object.keys(IN.pointers || {}).length < 2) pinchD = 0;
      if (Object.keys(IN.pointers || {}).length === 0) dragging = false;
    };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", e => {
      e.preventDefault();
      const r = rect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0012));
    }, { passive: false });
  }
  function zoomAt(sx, sy, f) {
    const nz = G.clamp(CAM.zoom * f, CAM.minZ, CAM.maxZ);
    const w = CAM.s2w(sx, sy);
    CAM.zoom = nz;
    if (!CAM.follow) {
      const w2 = CAM.s2w(sx, sy);
      CAM.x += w[0] - w2[0]; CAM.y += w[1] - w2[1];
    }
  }
  G.initCamera = initCanvas;
  G.zoomAt = zoomAt;
})();
