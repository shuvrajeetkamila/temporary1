export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.pointerLocked = false;
    this.enabled = true;
    this.sensitivity = Number(localStorage.getItem('nauru.sensitivity') || 1);

    window.addEventListener('keydown', (event) => {
      if (!this.enabled) return;
      if (!this.keys.has(event.code)) this.pressed.add(event.code);
      this.keys.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
      this.released.add(event.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (event) => {
      if (!this.pointerLocked || !this.enabled) return;
      this.mouseDX += event.movementX;
      this.mouseDY += event.movementY;
    });
    this.canvas.addEventListener('wheel', (event) => {
      this.wheel += Math.sign(event.deltaY);
      event.preventDefault();
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
  }

  down(...codes) { return codes.some((code) => this.keys.has(code)); }
  justPressed(code) { return this.pressed.has(code); }
  justReleased(code) { return this.released.has(code); }
  consume(code) {
    const value = this.pressed.has(code);
    this.pressed.delete(code);
    return value;
  }

  requestPointerLock() {
    if (this.enabled && document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  setSensitivity(value) {
    this.sensitivity = Number(value);
    localStorage.setItem('nauru.sensitivity', String(this.sensitivity));
  }
}
