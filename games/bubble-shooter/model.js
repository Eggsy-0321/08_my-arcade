'use strict';
const BubbleShooter = (() => {
  const W = 360, H = 560, R = 18, DY = Math.sqrt(3) * R, LIMIT = 450, LAUNCH = 518;
  const key = b => `${b.row},${b.col}`;
  const parity = (row, offset = 0) => (row + offset) & 1;
  const columns = (row, offset = 0) => 10 - parity(row, offset);
  const position = (b, offset = 0) => ({ x: R + b.col * R * 2 + parity(b.row, offset) * R, y: R + b.row * DY });
  function neighbors(b, offset = 0) {
    const shift = parity(b.row, offset) ? 0 : -1;
    return [[0,-1],[0,1],[-1,shift],[-1,shift+1],[1,shift],[1,shift+1]]
      .map(([dr,dc]) => ({ row: b.row + dr, col: b.col + dc }))
      .filter(n => n.row >= 0 && n.col >= 0 && n.col < columns(n.row, offset));
  }
  function flood(board, seeds, offset, color) {
    const cells = new Map(board.map(b => [key(b), b])), seen = new Set(), found = [], queue = seeds.slice();
    for (let i = 0; i < queue.length; i++) {
      const b = cells.get(key(queue[i]));
      if (!b || seen.has(key(b)) || (color !== undefined && b.color !== color)) continue;
      seen.add(key(b)); found.push(b); queue.push(...neighbors(b, offset));
    }
    return found;
  }
  // Continuous swept-circle collision: a shot cannot tunnel through a bubble,
  // even when the caller advances it by a large distance. The guide uses this too.
  function travel(board, offset, shot, distance) {
    const points = [{ x: shot.x, y: shot.y }];
    while (distance > 1e-7) {
      const wall = shot.vx > 0 ? (W-R-shot.x)/shot.vx : shot.vx < 0 ? (R-shot.x)/shot.vx : Infinity;
      const ceiling = shot.vy < 0 ? (R-shot.y)/shot.vy : Infinity;
      let length = Math.min(distance, Math.max(0, wall), Math.max(0, ceiling));
      let hit = ceiling <= length + 1e-7 ? { ceiling: true } : null;
      for (const b of board) {
        const p = position(b, offset), dx = shot.x-p.x, dy = shot.y-p.y;
        const dot = dx*shot.vx+dy*shot.vy, c = dx*dx+dy*dy-4*R*R;
        const disc = dot*dot-c;
        if (dot >= 0 || disc < 0) continue;
        const t = Math.max(0, -dot-Math.sqrt(disc));
        if (t <= length + 1e-7) { length = t; hit = { bubble: b }; }
      }
      shot.x += shot.vx*length; shot.y += shot.vy*length; distance -= length;
      points.push({ x: shot.x, y: shot.y });
      if (hit) return { hit, points };
      if (wall <= length + 1e-7) shot.vx *= -1;
    }
    return { hit: null, points };
  }
  function snap(board, offset, point, hit) {
    const occupied = new Set(board.map(key));
    const candidates = hit.bubble ? neighbors(hit.bubble, offset) :
      Array.from({ length: columns(0, offset) }, (_, col) => ({ row: 0, col }));
    return candidates.filter(b => !occupied.has(key(b))).sort((a,b) => {
      const pa = position(a, offset), pb = position(b, offset);
      return Math.hypot(pa.x-point.x, pa.y-point.y)-Math.hypot(pb.x-point.x, pb.y-point.y);
    })[0] || null;
  }
  const missLimit = score => score >= 1500 ? 1 : score >= 500 ? 2 : 3;
  class Game {
    constructor({ random = Math.random } = {}) {
      this.random = random; this.state = 'START'; this.board = []; this.offset = 0;
      this.score = 0; this.misses = 0; this.angle = 0; this.shot = null; this.effects = []; this.current = 0; this.next = 0;
    }
    pick(colors) { return colors[Math.floor(this.random()*colors.length)]; }
    generate() {
      this.offset = 0; this.board = [];
      for (let row = 0; row < 5; row++) for (let col = 0; col < columns(row); col++)
        this.board.push({ row, col, color: Math.floor(this.random()*5) });
    }
    colors() { return [...new Set(this.board.map(b => b.color))]; }
    refreshAmmo() {
      const colors = this.colors();
      if (!colors.includes(this.current)) this.current = this.pick(colors);
      if (!colors.includes(this.next)) this.next = this.pick(colors);
    }
    start() {
      this.score = 0; this.misses = 0; this.angle = 0; this.shot = null; this.effects = []; this.remaining = 0;
      this.generate(); this.current = this.pick(this.colors()); this.next = this.pick(this.colors()); this.state = 'PLAYING';
    }
    aim(delta) { if (this.state === 'PLAYING') this.angle = Math.max(-70, Math.min(70, this.angle+delta)); }
    projectile() { const rad = this.angle*Math.PI/180; return { x: W/2, y: LAUNCH, vx: Math.sin(rad), vy: -Math.cos(rad), color: this.current }; }
    guide() { return travel(this.board, this.offset, this.projectile(), 2000).points; }
    shoot() {
      if (this.state !== 'PLAYING' || this.shot) return false;
      this.refreshAmmo(); this.shot = this.projectile(); return true;
    }
    addRow() {
      // Flip the origin parity as rows move: every existing x and adjacency survives.
      this.offset ^= 1; this.board.forEach(b => b.row++);
      const colors = this.colors();
      for (let col = 0; col < columns(0, this.offset); col++) this.board.push({ row: 0, col, color: this.pick(colors) });
      this.misses = 0;
    }
    settle(cell, color) {
      this.shot = null;
      if (!cell) { this.state = 'GAME OVER'; return; }
      const bubble = { ...cell, color }; this.board.push(bubble);
      const same = flood(this.board, [bubble], this.offset, color);
      this.effects = [];
      if (same.length >= 3) {
        const removed = new Set(same.map(key));
        this.board = this.board.filter(b => !removed.has(key(b)));
        const attached = new Set(flood(this.board, this.board.filter(b => b.row === 0), this.offset).map(key));
        const fallen = this.board.filter(b => !attached.has(key(b)));
        this.board = this.board.filter(b => attached.has(key(b)));
        this.score += same.length*10 + fallen.length*20; this.misses = 0;
        this.effects = [...same.map(b => ({ ...position(b,this.offset), color:b.color, falling:false })),
          ...fallen.map(b => ({ ...position(b,this.offset), color:b.color, falling:true }))];
      } else if (++this.misses >= missLimit(this.score)) this.addRow();
      this.current = this.next;
      if (!this.board.length) this.generate();
      this.next = this.pick(this.colors()); this.refreshAmmo();
      this.remaining = .32; this.state = 'RESOLVING';
    }
    finishResolution() {
      this.effects = []; this.remaining = 0;
      this.state = this.board.some(b => position(b,this.offset).y+R >= LIMIT) ? 'GAME OVER' : 'PLAYING';
    }
    update(dt) {
      if (this.state === 'RESOLVING') { this.remaining -= dt; if (this.remaining <= 0) this.finishResolution(); return; }
      if (this.state !== 'PLAYING' || !this.shot) return;
      const { hit } = travel(this.board, this.offset, this.shot, dt*650);
      if (hit) this.settle(snap(this.board,this.offset,this.shot,hit),this.shot.color);
    }
  }
  return { Game, W, H, R, DY, LIMIT, LAUNCH, position, neighbors, columns, flood, travel, snap, missLimit };
})();
