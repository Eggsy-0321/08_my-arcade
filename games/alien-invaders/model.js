'use strict';

const AlienInvaders = (() => {
  // All distances are logical pixels, all durations are seconds.
  const C = Object.freeze({
    width: 360, height: 480, shipY: 446, shipWidth: 30, shipHeight: 21,
    hitWidth: 22, hitHeight: 15, shipSpeed: 210, laserSpeed: 360,
    enemyBulletSpeed: 145, formationSpeed: 14, acceleration: 1.5,
    maxFormationSpeed: 42, drop: 22, enemyWidth: 28, enemyHeight: 22,
    columnGap: 48, rowGap: 36, formationWidth: 220, defenseY: 416,
    fireInterval: .35, maxLasers: 3, enemyFireMin: 1, enemyFireMax: 2,
    invulnerability: 1, penalty: 3, explosion: .2, step: 1 / 120
  });
  const cents = seconds => Math.round(seconds * 100);
  const format = seconds => `${(cents(seconds) / 100).toFixed(2)}s`;
  function record(value) {
    if (value === null || !/^\d+$/.test(value)) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  class Game {
    constructor({ random = Math.random } = {}) { this.random = random; this.state = 'START'; }
    start() {
      this.state = 'PLAYING'; this.elapsed = 0; this.hits = 0; this.lives = 3;
      this.ship = C.width / 2; this.invincible = 0; this.direction = 0;
      this.firing = false; this.cooldown = 0; this.lasers = []; this.bullets = []; this.effects = []; this.events = [];
      this.formation = { x: (C.width - C.formationWidth) / 2, y: 40, direction: 1 };
      this.enemies = Array.from({ length: 20 }, (_, i) => ({ col: i % 5, row: Math.floor(i / 5), hp: i < 10 ? 2 : 1, armored: i < 10 }));
      this.enemyClock = this.interval();
    }
    interval() { return C.enemyFireMin + this.random() * (C.enemyFireMax - C.enemyFireMin); }
    speed() { return Math.min(C.maxFormationSpeed, C.formationSpeed + (20 - this.enemies.length) * C.acceleration); }
    rect(enemy) { return { x: this.formation.x + enemy.col * C.columnGap, y: this.formation.y + enemy.row * C.rowGap, w: C.enemyWidth, h: C.enemyHeight }; }
    shipRect(small = false) { const w = small ? C.hitWidth : C.shipWidth, h = small ? C.hitHeight : C.shipHeight; return { x: this.ship - w / 2, y: C.shipY - h / 2, w, h }; }
    cancelInput() { this.direction = 0; this.firing = false; }
    pause() { if (this.state !== 'PLAYING') return false; this.state = 'PAUSED'; this.cancelInput(); return true; }
    resume() { if (this.state !== 'PAUSED') return false; this.cancelInput(); this.state = 'PLAYING'; return true; }
    setFiring(value) {
      if (this.state !== 'PLAYING') return;
      this.firing = value;
      if (value && this.cooldown <= 1e-9) this.shoot();
    }
    shoot() {
      // A full magazine still consumes this repeat slot; it never queues a burst.
      this.cooldown = C.fireInterval;
      if (this.lasers.length >= C.maxLasers) return;
      this.lasers.push({ x: this.ship, y: C.shipY - C.shipHeight / 2 }); this.events.push('shoot');
    }
    fireEnemy() {
      const candidates = [];
      for (let col = 0; col < 5; col++) {
        const bottom = this.enemies.filter(e => e.col === col).sort((a, b) => b.row - a.row)[0];
        if (bottom) candidates.push(bottom);
      }
      if (!candidates.length) return;
      const e = candidates[Math.min(candidates.length - 1, Math.floor(this.random() * candidates.length))], r = this.rect(e);
      this.bullets.push({ x: r.x + r.w / 2, y: r.y + r.h });
    }
    finish(state) { if (this.state !== 'PLAYING') return; this.state = state; this.cancelInput(); if (state === 'CLEAR') this.events.push('clear'); }
    finalCents() { return cents(this.elapsed) + this.hits * C.penalty * 100; }
    update(dt) {
      if (this.state !== 'PLAYING' || !Number.isFinite(dt) || dt <= 0) return;
      const before = { hits: this.hits, lives: this.lives, invincible: this.invincible, events: this.events.length };
      this.pendingLoss = false;
      // Small physics steps prevent tunnelling; paused wall time is never passed here.
      while (dt > 1e-9 && this.state === 'PLAYING') { const step = Math.min(C.step, dt); this.step(step); dt -= step; }
      if (this.state === 'CLEAR') {
        // Even with physics substeps, a render update has one clear-first result.
        this.hits = before.hits; this.lives = before.lives; this.invincible = before.invincible;
        this.events = this.events.filter((event, i) => i < before.events || event !== 'hit');
      } else if (this.pendingLoss) this.finish('GAME OVER');
    }
    step(dt) {
      this.elapsed += dt;
      this.effects = this.effects.filter(e => (e.remaining -= dt) > 0);
      this.invincible = Math.max(0, this.invincible - dt);
      this.ship = Math.max(C.shipWidth / 2, Math.min(C.width - C.shipWidth / 2, this.ship + this.direction * C.shipSpeed * dt));
      this.cooldown = Math.max(0, this.cooldown - dt);
      if (this.firing && this.cooldown <= 1e-9) this.shoot();
      const f = this.formation;
      f.x += f.direction * this.speed() * dt;
      // Always use the ORIGINAL five-column rectangle, including destroyed columns.
      if (f.x <= 8 || f.x + C.formationWidth >= C.width - 8) {
        f.x = Math.max(8, Math.min(C.width - 8 - C.formationWidth, f.x)); f.direction *= -1; f.y += C.drop;
      }
      const remaining = [];
      for (const laser of this.lasers) {
        const oldY = laser.y; laser.y -= C.laserSpeed * dt;
        const swept = { x: laser.x - 1.5, y: laser.y - 10, w: 3, h: oldY - laser.y + 10 };
        const target = this.enemies.filter(e => overlaps(swept, this.rect(e))).sort((a, b) => b.row - a.row)[0];
        if (target) {
          target.hp--;
          if (!target.hp) {
            const r = this.rect(target); this.enemies.splice(this.enemies.indexOf(target), 1);
            this.effects.push({ x: r.x, y: r.y, remaining: C.explosion }); this.events.push('destroy');
          }
        } else if (laser.y > 0) remaining.push(laser);
      }
      this.lasers = remaining;
      // Clear is resolved before EVERY hazard in this update, including existing bullets.
      if (!this.enemies.length) { this.finish('CLEAR'); return; }
      this.enemyClock -= dt;
      if (this.enemyClock <= 1e-9) { this.fireEnemy(); this.enemyClock += this.interval(); }
      for (const bullet of this.bullets) {
        const oldY = bullet.y; bullet.y += C.enemyBulletSpeed * dt;
        if (this.invincible <= 1e-9 && overlaps({ x: bullet.x - 3, y: oldY, w: 6, h: bullet.y - oldY + 12 }, this.shipRect(true))) {
          bullet.y = C.height + 20; this.lives--; this.hits++; this.invincible = C.invulnerability; this.events.push('hit');
        }
      }
      this.bullets = this.bullets.filter(b => b.y < C.height);
      if (this.lives <= 0 || this.enemies.some(e => { const r = this.rect(e); return r.y + r.h >= C.defenseY || overlaps(r, this.shipRect()); })) this.pendingLoss = true;
    }
  }
  return { C, Game, cents, format, record, overlaps };
})();
