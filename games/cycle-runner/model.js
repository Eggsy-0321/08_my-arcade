'use strict';
const CycleRunner = (() => {
  const C = Object.freeze({ width: 360, height: 360, playerX: 72, halfWidth: 16, bodyHeight: 48,
    gravity: 1000, jump: 400, baseSpeed: 110, maxSpeed: 180, acceleration: .004,
    countdown: 3.35, step: 1 / 240, lookahead: 720, recovery: 1.8 });
  const speedAt = distance => Math.min(C.maxSpeed, C.baseSpeed + distance * C.acceleration);
  function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // Groups fit inside a double-jump envelope. A max-speed recovery strip separates groups.
  function group(x, random = Math.random) {
    const difficulty = Math.min(1, x / 14000), v = speedAt(x), r = random();
    const type = x < 1400 ? (r < .5 ? 'cone' : 'crate') : r < .36 ? 'hole' : r < .68 ? 'crate' : 'cone';
    const hazards = [];
    if (type === 'hole') hazards.push({ x, w: v * (.32 + random() * (.12 + difficulty * .08)), h: 0, type });
    else {
      hazards.push({ x, w: 22 + random() * 8, h: 22 + random() * (10 + difficulty * 8), type });
      if (x > 2200 && random() < .25 + difficulty * .35) hazards.push({ x: x + v * .30, w: 22, h: 24 + random() * 10, type: 'cone' });
    }
    const end = Math.max(...hazards.map(h => h.x + h.w));
    return { x, end, hazards, next: end + C.maxSpeed * (C.recovery + random() * (.9 - difficulty * .5)) };
  }
  class Game {
    constructor({ random = Math.random, onEvent = () => {} } = {}) { this.random = random; this.onEvent = onEvent; this.state = 'TITLE'; this.distance = 0; this.y = 0; this.vy = 0; this.jumps = 0; this.speed = C.baseSpeed; this.elapsed = 0; this.groups = []; }
    start() {
      this.distance = 0; this.elapsed = 0; this.speed = C.baseSpeed; this.y = 0; this.vy = 0; this.jumps = 0;
      this.groups = []; this.next = 440 + this.random() * 120; this.fill(); this.count = C.countdown; this.state = 'COUNTDOWN';
    }
    fill() { while (this.next < this.distance + C.lookahead) { const g = group(this.next, this.random); this.groups.push(g); this.next = g.next; } }
    jump() {
      if (this.state !== 'RUNNING' || this.jumps >= 2 || this.y < 0) return false;
      this.vy = C.jump; this.jumps++; this.onEvent(this.jumps === 1 ? 'jump' : 'double'); return true;
    }
    pause() { if (!['RUNNING', 'COUNTDOWN'].includes(this.state)) return false; this.state = 'PAUSED'; return true; }
    resume() { if (this.state !== 'PAUSED') return false; this.count = C.countdown; this.state = 'COUNTDOWN'; return true; }
    over(reason) { if (this.state !== 'RUNNING') return; this.state = 'GAME_OVER'; this.reason = reason; this.onEvent('crash'); }
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      if (this.state === 'COUNTDOWN') { this.count = Math.max(0, this.count - dt); if (this.count < 1e-9) this.state = 'RUNNING'; return; }
      if (this.state !== 'RUNNING') return;
      // Small bounded substeps prevent tunneling at all supported speeds/frame rates.
      while (dt > 1e-9 && this.state === 'RUNNING') { const t = Math.min(dt, C.step); this.step(t); dt -= t; }
    }
    step(dt) {
      this.speed = speedAt(this.distance); this.distance += this.speed * dt; this.elapsed += dt;
      const oldY = this.y; this.y += this.vy * dt - C.gravity * dt * dt / 2; this.vy -= C.gravity * dt;
      const hazards = this.groups.flatMap(g => g.hazards);
      const hole = hazards.some(h => h.type === 'hole' && this.distance > h.x && this.distance < h.x + h.w);
      if (this.y <= 0) {
        if (hole) { this.over('hole'); return; }
        this.y = 0; this.vy = 0; if (oldY > 0) this.onEvent('land'); this.jumps = 0;
      }
      if (hazards.some(h => h.type !== 'hole' && this.distance + C.halfWidth > h.x && this.distance - C.halfWidth < h.x + h.w && this.y < h.h)) this.over('obstacle');
      this.groups = this.groups.filter(g => g.end > this.distance - 120); this.fill();
    }
  }
  function record(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0; }
  return { C, Game, seeded, group, speedAt, record };
})();
if (typeof module !== 'undefined') module.exports = CycleRunner;
