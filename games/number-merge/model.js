'use strict';

const NumberMerge = (() => {
  const format = ms => {
    const cs = Math.floor(ms / 10);
    return `${String(Math.floor(cs / 6000)).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
  };
  function canMove(board) {
    return board.some((value, i) => !value ||
      (i % 4 < 3 && value === board[i + 1]) || (i < 12 && value === board[i + 4]));
  }
  // Traverse each line from its destination edge; merged results are never read again.
  function slide(board, direction) {
    if (!['left', 'right', 'up', 'down'].includes(direction)) return { board: board.slice(), changed: false, motions: [] };
    const next = Array(16).fill(0), motions = [];
    for (let line = 0; line < 4; line++) {
      const indices = Array.from({ length: 4 }, (_, n) =>
        direction === 'left' ? line * 4 + n : direction === 'right' ? line * 4 + 3 - n :
          direction === 'up' ? n * 4 + line : (3 - n) * 4 + line);
      const filled = indices.filter(i => board[i]);
      let destination = 0;
      for (let n = 0; n < filled.length; n++) {
        const from = filled[n], to = indices[destination++];
        const merged = n + 1 < filled.length && board[from] === board[filled[n + 1]];
        next[to] = board[from] * (merged ? 2 : 1);
        motions.push({ from, to, value: board[from], merged, consumed: false });
        if (merged) motions.push({ from: filled[++n], to, value: board[from], merged, consumed: true });
      }
    }
    return { board: next, changed: next.some((v, i) => v !== board[i]), motions };
  }
  class Game {
    constructor({ now = () => performance.now(), random = Math.random } = {}) {
      this.now = now; this.random = random; this.state = 'START';
      this.board = Array(16).fill(0); this.elapsed = 0; this.since = null;
    }
    time() { return this.since === null ? this.elapsed : this.now() - this.since; }
    spawn() {
      const empty = this.board.flatMap((v, i) => v ? [] : [i]);
      if (!empty.length) return null;
      const index = empty[Math.floor(this.random() * empty.length)];
      this.board[index] = this.random() < .9 ? 2 : 4;
      return index;
    }
    start() {
      this.since = this.now(); this.elapsed = 0; this.state = 'PLAYING';
      this.board = Array(16).fill(0); this.spawn(); this.spawn();
    }
    finish(state) { this.elapsed = this.time(); this.since = null; this.state = state; }
    move(direction) {
      if (this.state !== 'PLAYING') return { changed: false };
      const result = slide(this.board, direction);
      if (!result.changed) return result;
      this.board = result.board;
      if (this.board.includes(2048)) this.finish('GAME CLEAR');
      else {
        result.spawned = this.spawn();
        if (!canMove(this.board)) this.finish('GAME OVER');
      }
      return result;
    }
  }
  return { Game, slide, canMove, format };
})();
