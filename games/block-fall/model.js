'use strict';
const BlockFall = (() => {
  const C = Object.freeze({ cols: 10, rows: 20, countdown: 3, lockDelay: .5, lockResets: 15,
    softInterval: .035, repeatDelay: .17, repeatInterval: .05, step: 1 / 120 });
  const SHAPES = Object.freeze({ I: ['0000','1111','0000','0000'], O: ['11','11'],
    T: ['010','111','000'], L: ['001','111','000'], J: ['100','111','000'], S: ['011','110','000'], Z: ['110','011','000'] });
  const TYPES = Object.freeze(Object.keys(SHAPES));
  const KICKS = [ [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    [[0,0],[1,0],[1,-1],[0,2],[1,2]], [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]] ];
  const I_KICKS = [ [[0,0],[-2,0],[1,0],[-2,1],[1,-2]], [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
    [[0,0],[2,0],[-1,0],[2,-1],[-1,2]], [[0,0],[1,0],[-2,0],[1,2],[-2,-1]] ];
  function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function matrix(type, rotation = 0) {
    let m = SHAPES[type].map(row => [...row].map(Number));
    for (let r = 0; r < rotation % 4; r++) m = m[0].map((_, x) => m.map(row => row[x]).reverse());
    return m;
  }
  function cells(piece) {
    const result = [];
    matrix(piece.type, piece.rotation).forEach((row,y) => row.forEach((value,x) => { if (value) result.push([piece.x+x,piece.y+y]); }));
    return result;
  }
  const emptyBoard = () => Array.from({ length: C.rows }, () => Array(C.cols).fill(null));
  const levelAt = lines => 1 + Math.floor(lines / 10);
  const intervalAt = level => Math.max(.08, .8 * .85 ** (level - 1));
  const lineScore = (lines, level) => [0,100,300,500,800][lines] * level;
  class Bag {
    constructor(random = Math.random) { this.random = random; this.queue = []; }
    take() {
      if (!this.queue.length) {
        this.queue = [...TYPES];
        for (let i = this.queue.length - 1; i > 0; i--) {
          const j = Math.min(i, Math.max(0, Math.floor(this.random() * (i+1))));
          [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
      }
      return this.queue.pop();
    }
  }
  class Game {
    constructor({ random = Math.random, onEvent = () => {} } = {}) {
      this.random = random; this.onEvent = onEvent; this.state = 'START'; this.board = emptyBoard();
      this.score = 0; this.lines = 0; this.level = 1; this.active = null; this.next = null; this.count = 0;
    }
    start() {
      this.board = emptyBoard(); this.score = 0; this.lines = 0; this.level = 1;
      this.softHeld = false; this.bag = new Bag(this.random); this.next = this.bag.take(); this.spawn();
      this.count = C.countdown; this.state = 'COUNTDOWN';
    }
    spawn() {
      this.active = { type: this.next, rotation: 0, x: this.next === 'O' ? 4 : 3, y: 0 };
      this.next = this.bag.take(); this.fallTime = 0; this.lockTime = 0; this.resets = 0;
      if (!this.fits(this.active)) this.over();
    }
    fits(piece) { return cells(piece).every(([x,y]) => x >= 0 && x < C.cols && y < C.rows && (y >= 0 ? !this.board[y][x] : y >= -4)); }
    grounded() { return !!this.active && !this.fits({ ...this.active, y: this.active.y+1 }); }
    adjust(piece, event) {
      if (this.state !== 'PLAYING' || !this.fits(piece)) return false;
      if (this.grounded() && this.resets < C.lockResets) { this.lockTime = 0; this.resets++; }
      this.active = piece; this.onEvent(event); return true;
    }
    move(dx) { return (dx === -1 || dx === 1) && this.active ? this.adjust({ ...this.active, x: this.active.x+dx }, 'move') : false; }
    rotate() {
      if (this.state !== 'PLAYING') return false;
      const p = this.active, rotation = (p.rotation+1)%4;
      const kicks = p.type === 'O' ? [[0,0]] : (p.type === 'I' ? I_KICKS : KICKS)[p.rotation];
      for (const [dx,dy] of kicks) if (this.adjust({ ...p, rotation, x: p.x+dx, y: p.y+dy }, 'rotate')) return true;
      return false;
    }
    down(soft = false) {
      if (this.state !== 'PLAYING' || !this.fits({ ...this.active, y: this.active.y+1 })) return false;
      this.active.y++; if (soft) this.score++; return true;
    }
    ghost() {
      if (!this.active) return null;
      const p = { ...this.active }; while (this.fits({ ...p, y: p.y+1 })) p.y++; return p;
    }
    hard() {
      if (this.state !== 'PLAYING') return false;
      const p = this.ghost(); this.score += (p.y-this.active.y)*2; this.active = p; this.lock(); return true;
    }
    lock() {
      if (this.state !== 'PLAYING') return;
      const occupied = cells(this.active);
      if (occupied.some(([,y]) => y < 0)) { this.over(); return; }
      for (const [x,y] of occupied) this.board[y][x] = this.active.type;
      this.onEvent('land');
      const remaining = this.board.filter(row => !row.every(Boolean)), cleared = C.rows-remaining.length;
      if (cleared) {
        this.score += lineScore(cleared, this.level); this.lines += cleared; this.level = levelAt(this.lines);
        this.board = [...Array.from({ length: cleared }, () => Array(C.cols).fill(null)), ...remaining];
        this.onEvent('clear');
      }
      this.spawn();
    }
    over() { this.state = 'GAME OVER'; this.onEvent('over'); }
    pause() { if (!['PLAYING','COUNTDOWN'].includes(this.state)) return false; this.state = 'PAUSED'; return true; }
    resume() { if (this.state !== 'PAUSED') return false; this.count = C.countdown; this.state = 'COUNTDOWN'; return true; }
    update(dt, soft = false) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      if (this.state === 'COUNTDOWN') { this.count = Math.max(0, this.count-dt); if (this.count < 1e-9) this.state = 'PLAYING'; return; }
      if (this.state !== 'PLAYING') return;
      // Switching speeds starts a fresh interval, without carrying a gravity backlog.
      if (soft !== this.softHeld) { this.fallTime = 0; this.softHeld = soft; }
      while (dt > 1e-9 && this.state === 'PLAYING') {
        const t = Math.min(dt, C.step); dt -= t;
        this.fallTime += t;
        const interval = soft ? Math.min(C.softInterval, intervalAt(this.level)) : intervalAt(this.level);
        if (this.fallTime + 1e-9 >= interval) { this.fallTime = Math.max(0, this.fallTime-interval); this.down(soft); }
        if (this.grounded()) { this.lockTime += t; if (this.lockTime + 1e-9 >= C.lockDelay) this.lock(); }
      }
    }
  }
  // Independent input sources allow keyboard + multiple pointers without stuck keys.
  class Input {
    constructor() { this.clear(); }
    clear() { this.sources = new Map(); this.order = 0; this.direction = null; this.time = 0; }
    has(action) { return [...this.sources.values()].some(v => v.action === action); }
    press(source, action) {
      if (this.sources.has(source)) return false;
      const first = !this.has(action); this.sources.set(source, { action, order: ++this.order }); this.refresh(); return first;
    }
    release(source) { this.sources.delete(source); this.refresh(); }
    refresh() {
      const latest = [...this.sources.values()].filter(v => ['left','right'].includes(v.action)).sort((a,b) => b.order-a.order)[0]?.action || null;
      if (latest !== this.direction) { this.direction = latest; this.time = C.repeatDelay; }
    }
    update(dt) {
      if (!this.direction) return [];
      this.time -= dt; const actions = [];
      while (this.time <= 1e-9) { actions.push(this.direction); this.time += C.repeatInterval; }
      return actions;
    }
  }
  function record(value) { const n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : 0; }
  class Records {
    constructor(storage) {
      this.storage = storage; this.prefix = 'my-arcade:block-fall:';
      this.best = record(this.read('best')); this.sound = this.read('sound') !== 'off';
    }
    read(key) { try { return this.storage?.getItem(this.prefix+key); } catch { return null; } }
    save(key, value) { try { this.storage?.setItem(this.prefix+key, String(value)); } catch { /* Retain in memory. */ } }
    update(score) { if (score > this.best) { this.best = score; this.save('best', score); } }
    toggle() { this.sound = !this.sound; this.save('sound', this.sound ? 'on' : 'off'); }
  }
  return { C, SHAPES, TYPES, matrix, cells, emptyBoard, seeded, Bag, Game, Input, Records, record, lineScore, levelAt, intervalAt };
})();
if (typeof module !== 'undefined') module.exports = BlockFall;
