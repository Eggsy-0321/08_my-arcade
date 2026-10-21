'use strict';

const LightsOut = (() => {
  const SIZE = 5, COUNT = SIZE * SIZE;
  const solved = board => board.length === COUNT && board.every(value => value === true);
  function flip(board, index) {
    if (!Number.isInteger(index) || index < 0 || index >= COUNT) return;
    const row = Math.floor(index / SIZE), col = index % SIZE;
    for (const [dr, dc] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) board[r * SIZE + c] = !board[r * SIZE + c];
    }
  }
  function generate(random = Math.random, previous = []) {
    const build = selected => {
      const board = Array(COUNT).fill(true);
      selected.forEach(index => flip(board, index));
      return { board, selected };
    };
    const valid = board => !solved(board) && board.some((v, i) => v !== previous[i]);
    for (let attempt = 0; attempt < 100; attempt++) {
      const pool = Array.from({ length: COUNT }, (_, i) => i), selected = [];
      const count = 6 + Math.floor(random() * 5);
      for (let n = 0; n < count; n++) selected.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
      const puzzle = build(selected);
      if (valid(puzzle.board)) return puzzle;
    }
    // Bounded fallback also supports a constant random source without repeating RETRY.
    for (let offset = 0; offset < COUNT; offset++) {
      const puzzle = build(Array.from({ length: 6 }, (_, i) => (i + offset) % COUNT));
      if (valid(puzzle.board)) return puzzle;
    }
  }
  const format = ms => {
    const cs = Math.floor(ms / 10);
    return `${String(Math.floor(cs / 6000)).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
  };
  function record(raw, integer = false) {
    if (typeof raw !== 'string' || !/^\d+(\.\d+)?$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 && (!integer || Number.isSafeInteger(value)) ? value : null;
  }
  class Game {
    constructor({ now = () => performance.now(), random = Math.random } = {}) {
      this.now = now; this.random = random; this.state = 'START';
      this.board = Array(COUNT).fill(false); this.initial = []; this.moves = 0;
      this.elapsed = 0; this.since = null;
    }
    time() { return this.elapsed + (this.since === null ? 0 : this.now() - this.since); }
    start() {
      if (!['START', 'CLEAR'].includes(this.state)) return false;
      const puzzle = generate(this.random, this.initial);
      this.initial = puzzle.board.slice(); this.selected = puzzle.selected;
      this.restart(); return true;
    }
    restart() {
      this.board = this.initial.slice(); this.moves = 0; this.elapsed = 0;
      this.since = this.now(); this.state = 'PLAYING';
    }
    reset() { if (this.state !== 'PLAYING') return false; this.restart(); return true; }
    stop(state) { this.elapsed = this.time(); this.since = null; this.state = state; }
    move(index) {
      if (this.state !== 'PLAYING' || !Number.isInteger(index) || index < 0 || index >= COUNT) return false;
      flip(this.board, index); this.moves++;
      if (solved(this.board)) { this.stop('WAVE'); this.waveSince = this.now(); }
      return true;
    }
    pause() { if (this.state !== 'PLAYING') return false; this.stop('PAUSED'); return true; }
    resume() { if (this.state !== 'PAUSED') return false; this.since = this.now(); this.state = 'PLAYING'; return true; }
    update() { if (this.state === 'WAVE' && this.now() - this.waveSince >= 1000) this.state = 'CLEAR'; }
  }
  return { Game, flip, solved, generate, format, record };
})();
