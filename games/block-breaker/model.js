'use strict';

// Fixed logical coordinates keep physics unchanged across resize/orientation.
const BlockBreaker = (() => {
  const W = 400, H = 580, R = 6, PW = 80, PY = 536;
  const speed = stage => 290 * (1 + (stage - 1) * .05);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function overlaps(ball, b) {
    return Math.hypot(ball.x - clamp(ball.x, b.x, b.x + b.w),
      ball.y - clamp(ball.y, b.y, b.y + b.h)) < R;
  }
  class Game {
    constructor({ now = () => performance.now(), random = Math.random, event = () => {} } = {}) {
      this.now = now; this.random = random; this.event = event;
      this.state = 'START'; this.stage = 1; this.life = 3; this.misses = 0;
      this.elapsed = 0; this.since = null; this.started = false;
      this.paddle = W / 2; this.ball = { x: W / 2, y: PY - R, vx: 0, vy: 0 }; this.blocks = [];
    }
    time() { return this.elapsed + (this.since === null ? 0 : this.now() - this.since) + this.misses * 10000; }
    stopClock() { if (this.since !== null) this.elapsed += this.now() - this.since; this.since = null; }
    reset() {
      this.stage = 1; this.life = 3; this.misses = 0; this.elapsed = 0; this.since = null;
      this.started = false; this.state = 'READY'; this.paddle = W / 2;
      this.dock(); this.generate();
    }
    dock() { this.ball = { x: this.paddle, y: PY - R, vx: 0, vy: 0 }; }
    move(x) {
      if (!['READY', 'PLAYING'].includes(this.state)) return;
      this.paddle = clamp(x, PW / 2, W - PW / 2);
      if (this.state === 'READY') this.dock();
    }
    launch() {
      if (this.state !== 'READY') return;
      if (!this.started) { this.started = true; this.since = this.now(); }
      this.state = 'PLAYING';
      this.ball.vx = speed(this.stage) * .22;
      this.ball.vy = -Math.sqrt(speed(this.stage) ** 2 - this.ball.vx ** 2);
    }
    pause() {
      if (!['READY', 'PLAYING'].includes(this.state)) return;
      this.previous = this.state; this.stopClock(); this.state = 'PAUSED';
    }
    resume() {
      if (this.state !== 'PAUSED') return;
      this.state = this.previous; if (this.started) this.since = this.now();
    }
    generate() {
      const cells = Array.from({ length: 40 }, (_, i) => i);
      for (let i = 39; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
      const count = 28 + Math.floor(this.random() * 13);
      this.blocks = cells.slice(0, count).map(i => {
        const b = { x: 17 + i % 8 * 46, y: 64 + Math.floor(i / 8) * 26, w: 42, h: 18, row: Math.floor(i / 8) };
        b.ignored = overlaps(this.ball, b); return b;
      });
    }
    destroy(index) {
      const b = this.blocks.splice(index, 1)[0]; this.event('brick', b);
      if (this.blocks.length) return;
      if (this.stage === 3) {
        this.stopClock(); this.state = 'ALL CLEAR'; this.event('clear', this.time()); return;
      }
      this.stage++;
      const magnitude = Math.hypot(this.ball.vx, this.ball.vy);
      if (magnitude) { this.ball.vx *= speed(this.stage) / magnitude; this.ball.vy *= speed(this.stage) / magnitude; }
      this.generate(); this.event('stage', this.stage);
    }
    miss() {
      if (this.state !== 'PLAYING') return;
      this.life--; this.misses++; this.event('miss');
      if (!this.life) { this.stopClock(); this.state = 'GAME OVER'; }
      else { this.state = 'READY'; this.dock(); }
    }
    update(seconds) {
      if (this.state !== 'PLAYING') return;
      // At most 2 logical pixels per step, below radius and minimum obstacle thickness.
      const dt = clamp(seconds, 0, .05), steps = Math.max(1, Math.ceil(speed(this.stage) * dt / 2));
      for (let i = 0; i < steps && this.state === 'PLAYING'; i++) this.step(dt / steps);
    }
    step(dt) {
      const ball = this.ball, oldX = ball.x, oldY = ball.y;
      ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); this.event('wall'); }
      if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); this.event('wall'); }
      if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy); this.event('wall'); }
      if (ball.vy > 0 && oldY + R <= PY && ball.y + R >= PY &&
          Math.abs(ball.x - this.paddle) <= PW / 2 + R) {
        const angle = clamp((ball.x - this.paddle) / (PW / 2), -1, 1) * Math.PI / 3;
        ball.vx = Math.sin(angle) * speed(this.stage); ball.vy = -Math.cos(angle) * speed(this.stage);
        ball.y = PY - R; this.event('paddle');
      }
      if (ball.y - R > H) { this.miss(); return; }
      for (let i = 0; i < this.blocks.length; i++) {
        const b = this.blocks[i];
        if (b.ignored) { if (!overlaps(ball, b)) b.ignored = false; continue; }
        if (!overlaps(ball, b)) continue;
        // Resolve the entering face, then remove it; only one reflection per substep.
        if (oldY + R <= b.y) { ball.y = b.y - R; ball.vy = -Math.abs(ball.vy); }
        else if (oldY - R >= b.y + b.h) { ball.y = b.y + b.h + R; ball.vy = Math.abs(ball.vy); }
        else if (oldX < b.x) { ball.x = b.x - R; ball.vx = -Math.abs(ball.vx); }
        else { ball.x = b.x + b.w + R; ball.vx = Math.abs(ball.vx); }
        this.destroy(i); break;
      }
    }
  }
  return { Game, W, H, R, PW, PY, speed, overlaps };
})();
