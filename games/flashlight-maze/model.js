'use strict';
const FlashlightMaze = (() => {
  const C = Object.freeze({ size: 17, memoryMs: 10000, lightRadius: 3, minPath: 60, generationAttempts: 24, repeatDelay: 280, repeatMs: 130, sleepGap: 2000 });
  const directions = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });
  const start = { x: 1, y: 1 }, goal = { x: C.size - 2, y: C.size - 2 };
  function path(board) {
    const queue = [[start]], seen = new Set(['1,1']);
    for (let i = 0; i < queue.length; i++) {
      const route = queue[i], p = route[route.length - 1];
      if (p.x === goal.x && p.y === goal.y) return route;
      for (const [dx, dy] of Object.values(directions)) {
        const x = p.x + dx, y = p.y + dy, key = `${x},${y}`;
        if (board[y]?.[x] === 0 && !seen.has(key)) { seen.add(key); queue.push([...route, { x, y }]); }
      }
    }
    return [];
  }
  function carve(random) {
    const board = Array.from({ length: C.size }, () => Array(C.size).fill(1)), stack = [{ ...start }];
    board[1][1] = 0;
    while (stack.length) {
      const p = stack[stack.length - 1];
      const options = Object.values(directions).filter(([dx, dy]) => {
        const x = p.x + dx * 2, y = p.y + dy * 2;
        return x > 0 && x < C.size - 1 && y > 0 && y < C.size - 1 && board[y][x] === 1;
      });
      if (!options.length) { stack.pop(); continue; }
      const [dx, dy] = options[Math.min(options.length - 1, Math.max(0, Math.floor(random() * options.length)))];
      board[p.y + dy][p.x + dx] = board[p.y + dy * 2][p.x + dx * 2] = 0;
      stack.push({ x: p.x + dx * 2, y: p.y + dy * 2 });
    }
    return board;
  }
  function fallback(transpose = false) {
    const board = Array.from({ length: C.size }, () => Array(C.size).fill(1));
    for (let row = 0; row < (C.size - 1) / 2; row++) {
      for (let x = 1; x <= C.size - 2; x++) board[row * 2 + 1][x] = 0;
      if (row < (C.size - 3) / 2) board[row * 2 + 2][row % 2 ? 1 : C.size - 2] = 0;
    }
    return transpose ? board.map((row, y) => row.map((_, x) => board[x][y])) : board;
  }
  function generate(random = Math.random, previous = null) {
    const different = board => JSON.stringify(board) !== JSON.stringify(previous);
    for (let i = 0; i < C.generationAttempts; i++) {
      const board = carve(random);
      if (path(board).length - 1 >= C.minPath && different(board)) return board;
    }
    const board = fallback();
    return different(board) ? board : fallback(true);
  }
  class Game {
    constructor({ now = () => performance.now(), random = Math.random } = {}) {
      this.now = now; this.random = random; this.state = 'TITLE'; this.board = null;
      this.elapsed = 0; this.memory = C.memoryMs; this.player = { ...start };
    }
    start() {
      this.board = generate(this.random, this.board); this.player = { ...start };
      this.elapsed = 0; this.memory = C.memoryMs; this.state = 'MEMORY'; this.last = this.now();
    }
    update(at = this.now()) {
      if (!['MEMORY', 'ESCAPE'].includes(this.state)) return;
      let dt = Math.max(0, at - this.last); this.last = at;
      if (this.state === 'MEMORY') {
        const used = Math.min(dt, this.memory); this.memory -= used; dt -= used;
        if (!this.memory) this.state = 'ESCAPE';
      }
      if (this.state === 'ESCAPE') this.elapsed += dt;
    }
    move(direction) {
      this.update();
      if (this.state !== 'ESCAPE' || !Object.hasOwn(directions, direction)) return false;
      const [dx, dy] = directions[direction], x = this.player.x + dx, y = this.player.y + dy;
      if (this.board[y]?.[x] !== 0) return false;
      this.player = { x, y };
      if (x === goal.x && y === goal.y) this.state = 'CLEAR';
      return true;
    }
    pause(at = this.now()) {
      if (!['MEMORY', 'ESCAPE'].includes(this.state)) return false;
      this.update(at); this.phase = this.state; this.state = 'PAUSED'; return true;
    }
    resume() {
      if (this.state !== 'PAUSED') return false;
      this.state = this.phase; this.last = this.now(); return true;
    }
    visible(x, y) {
      return ['MEMORY', 'CLEAR'].includes(this.state) || (this.state === 'ESCAPE' && Math.hypot(x - this.player.x, y - this.player.y) <= C.lightRadius);
    }
  }
  class Hold {
    constructor(move) { this.move = move; this.clear(); }
    press(direction, now) { this.direction = direction; this.next = now + C.repeatDelay; this.move(direction); }
    update(now) { if (this.direction && now >= this.next) { this.next = now + C.repeatMs; this.move(this.direction); } }
    clear() { this.direction = null; this.next = Infinity; }
  }
  function record(raw) { return raw !== null && String(raw).trim() !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : null; }
  function format(ms) { const n = Math.floor(ms / 10); return `${String(Math.floor(n / 6000)).padStart(2, '0')}:${String(Math.floor(n / 100) % 60).padStart(2, '0')}.${String(n % 100).padStart(2, '0')}`; }
  return { C, directions, start, goal, path, generate, Game, Hold, record, format };
})();
