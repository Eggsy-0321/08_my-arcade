'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { C, Game, Hold, generate, path, start, goal, directions, record, format } = vm.runInNewContext(fs.readFileSync('games/flashlight-maze/model.js', 'utf8') + '\nFlashlightMaze;');
function setup() { let now = 0; const g = new Game({ now: () => now }); return { g, tick: ms => { now += ms; g.update(); } }; }
function solve(g) { const route = path(g.board); for (const p of route.slice(1)) { const d = Object.entries(directions).find(([, [x,y]]) => p.x - g.player.x === x && p.y - g.player.y === y); assert.ok(g.move(d[0])); } }
test('1000 seeded mazes: 17×17, closed borders, connected floors, diagonal endpoints, >=60-step path', t => {
  assert.equal(C.size, 17); assert.equal(C.minPath, 60); assert.equal(C.memoryMs, 10000); assert.equal(C.lightRadius, 3);
  // Mulberry32: keep the balance sample reproducible without changing gameplay RNG.
  let seed = 0x081100, calls = 0;
  const random = () => {
    calls++; seed = (seed + 0x6D2B79F5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const unique = new Set(), lengths = [], attempts = [];

  for (let n = 0; n < 1000; n++) {
    const before = calls, b = generate(random), route = path(b); unique.add(JSON.stringify(b));
    lengths.push(route.length - 1); attempts.push((calls - before) / 63);
    assert.ok(attempts.at(-1) <= C.generationAttempts);
    assert.equal(b.length, 17); assert.ok(b.every(r => r.length === 17 && r.every(v => v === 0 || v === 1)));
    assert.ok(b[0].every(Boolean) && b[16].every(Boolean) && b.every(r => r[0] && r[16]));
    assert.equal(route[0].x, 1); assert.equal(route[0].y, 1); assert.equal(route.at(-1).x, 15); assert.equal(route.at(-1).y, 15);
    assert.ok(route.length - 1 >= C.minPath);
    const queue = [start], seen = new Set(['1,1']);
    for (let i = 0; i < queue.length; i++) for (const [dx,dy] of Object.values(directions)) {
      const x = queue[i].x + dx, y = queue[i].y + dy, k = `${x},${y}`;
      if (b[y]?.[x] === 0 && !seen.has(k)) { seen.add(k); queue.push({x,y}); }
    }
    assert.equal(seen.size, 127); assert.equal(seen.size, b.flat().filter(v => v === 0).length);
    let branches = 0, deadEnds = 0;
    for (const { x, y } of queue) {
      const exits = Object.values(directions).filter(([dx,dy]) => b[y+dy]?.[x+dx] === 0).length;
      if (exits >= 3) branches++; if (exits === 1) deadEnds++;
    }
    assert.ok(branches >= 2); assert.ok(deadEnds >= 4);
  }
  assert.ok(unique.size > 990);
  const stats = values => `min=${Math.min(...values)}, mean=${values.reduce((a,b)=>a+b,0)/values.length}, max=${Math.max(...values)}`;
  t.diagnostic(`seed=0x081100; shortest paths: ${stats(lengths)}; generation attempts: ${stats(attempts)}`);
});
test('fixed RNG terminates within bounded attempts and avoids the previous maze', () => {
  for (const r of [0, .5, .999999, 1]) {
    let calls=0; const rng=()=>{calls++;return r;};
    const a=generate(rng), b=generate(rng,a), c=generate(rng,b);
    assert.notDeepEqual(a,b);assert.notDeepEqual(b,c);
    for (const board of [a,b,c]) assert.ok(path(board).length-1>=C.minPath);
    assert.ok(calls<=3*C.generationAttempts*63);
  }
});
test('rejected short routes exhaust 24 attempts; both 17×17 fallback orientations meet the minimum', () => {
  // Always descend to the bottom, then head right to the goal: a 28-step candidate.
  // Repeat the same 63 choices for every complete DFS candidate.
  let calls = 0;
  const shortRoute = () => { const i = calls++ % 63; return i >= 7 && i < 14 ? .999999 : 0; };
  const a = generate(shortRoute);
  assert.equal(calls, C.generationAttempts * 63);
  const b = generate(shortRoute, a);
  assert.equal(calls, 2 * C.generationAttempts * 63);
  assert.notDeepEqual(a,b);
  for (const board of [a,b]) {
    assert.equal(board.length,17); assert.ok(board.every(row=>row.length===17));
    assert.equal(board.flat().filter(v=>v===0).length,127);
    assert.equal(path(board).length-1,112); assert.ok(path(board).length-1>=C.minPath);
  }
});
test('title waits; memory is exactly 10 seconds, blocks moves, automatically darkens', () => {
  const {g,tick}=setup();tick(99999);assert.equal(g.state,'TITLE');assert.equal(g.move('down'),false);
  g.start();assert.equal(g.state,'MEMORY');assert.equal(g.memory,10000);assert.ok(g.visible(15,15));
  tick(9999);assert.equal(g.move('down'),false);assert.equal(g.player.x,1);assert.equal(g.memory,1);
  tick(1);assert.equal(g.state,'ESCAPE');assert.equal(g.elapsed,0);assert.equal(g.visible(15,15),false);
});
test('phase boundary accounts only escape time, with no escape time limit', () => {
  const {g,tick}=setup();g.start();tick(10500);assert.equal(g.elapsed,500);tick(3600000);assert.equal(g.state,'ESCAPE');assert.equal(g.elapsed,3600500);
});
test('each valid move is one cell; walls, invalid directions and out-of-bounds are blocked', () => {
  const {g,tick}=setup();g.start();tick(10000);assert.equal(g.move('up'),false);assert.equal(g.move('left'),false);assert.equal(g.move('bogus'),false);
  const p=path(g.board)[1], d=Object.entries(directions).find(([, [x,y]])=>p.x-1===x&&p.y-1===y)[0];
  assert.ok(g.move(d));assert.equal(g.player.x,p.x);assert.equal(g.player.y,p.y);
});
test('hold taps immediately, repeats at delay/interval and clears without catch-up bursts', () => {
  const moves=[],h=new Hold(d=>moves.push(d));h.press('up',0);assert.equal(moves.length,1);
  h.update(279);assert.equal(moves.length,1);h.update(280);assert.equal(moves.length,2);h.update(409);assert.equal(moves.length,2);
  h.update(410);assert.equal(moves.length,3);h.update(10000);assert.equal(moves.length,4);h.clear();h.update(99999);assert.equal(moves.length,4);
});
test('circular three-cell visibility crosses walls and hides visited cells and goal outside range', () => {
  const {g,tick}=setup();g.start();tick(10000);g.player={x:5,y:5};
  assert.ok(g.visible(8,5));assert.ok(g.visible(7,7));assert.equal(g.visible(8,6),false);assert.equal(g.visible(1,1),false);
  g.player={x:12,y:15};assert.ok(g.visible(goal.x,goal.y));g.player={x:11,y:15};assert.equal(g.visible(goal.x,goal.y),false);
});
test('memory pause hides maze, stops countdown and movement, resumes remaining memory', () => {
  const {g,tick}=setup();g.start();tick(3000);assert.ok(g.pause());tick(90000);assert.equal(g.memory,7000);assert.equal(g.visible(1,1),false);assert.equal(g.move('down'),false);
  assert.ok(g.resume());tick(6999);assert.equal(g.state,'MEMORY');tick(1);assert.equal(g.state,'ESCAPE');assert.equal(g.elapsed,0);
});
test('escape pause excludes paused time, resumes without time jump and can freeze at last frame', () => {
  const {g,tick}=setup();g.start();tick(11000);g.pause();tick(90000);assert.equal(g.elapsed,1000);g.resume();tick(250);assert.equal(g.elapsed,1250);
  tick(200);g.pause(g.last);tick(99999);assert.equal(g.elapsed,1450);assert.equal(g.pause(),false);
});
test('restart/retry generate new maze and reset both clocks from active, paused and clear', () => {
  const {g,tick}=setup();g.start();let before=g.board;tick(11000);g.pause();g.start();assert.notDeepEqual(g.board,before);assert.equal(g.state,'MEMORY');assert.equal(g.elapsed,0);assert.equal(g.memory,10000);
  tick(10000);solve(g);before=g.board;g.start();assert.notDeepEqual(g.board,before);assert.equal(g.state,'MEMORY');
});
test('goal clears, freezes record, reveals whole maze; CLEAR ignores moves/pause/resume', () => {
  const {g,tick}=setup();g.start();tick(11234);solve(g);assert.equal(g.state,'CLEAR');assert.equal(g.elapsed,1234);assert.ok(g.visible(0,0));
  tick(99999);assert.equal(g.elapsed,1234);assert.equal(g.move('up'),false);assert.equal(g.pause(),false);assert.equal(g.resume(),false);
});
test('BEST parsing, time formatting, eighth registration and subpath HOME', () => {
  for(const v of [null,undefined,'',' ','-1','NaN','Infinity','{}'])assert.equal(record(v),null);
  assert.equal(record('1234.5'),1234.5);assert.equal(record('0'),0);assert.equal(format(61234),'01:01.23');
  const games=JSON.parse(fs.readFileSync('data/games.json'));assert.equal(games.length,9);assert.equal(games[7].id,'flashlight-maze');assert.equal(games[7].status,'published');
  const html=fs.readFileSync('games/flashlight-maze/index.html','utf8');for(const id of ['start','pause','resume','restart','retry','home'])assert.ok(html.includes(`id="${id}"`));
  const home=html.match(/id="home" href="([^"]+)"/)[1];assert.equal(new URL(home,'https://example.com/08_my-arcade/games/flashlight-maze/').pathname,'/08_my-arcade/index.html');
});
