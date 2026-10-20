'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { Game, speed, R, PY, overlaps } = vm.runInNewContext(fs.readFileSync('games/block-breaker/model.js', 'utf8') + '\nBlockBreaker;');
function setup() { let now = 0; const events = []; const g = new Game({ now: () => now, event: (...e) => events.push(e) }); g.reset(); return { g, events, tick: ms => now += ms }; }
test('START → READY、初回待機0、初回発射・ペナルティ・待機・pauseを実時間で計測', () => {
  const { g, tick } = setup(); tick(9000); assert.equal(g.time(), 0);
  g.launch(); tick(1234); assert.equal(g.time(), 1234);
  const blocks = g.blocks; g.miss(); assert.equal(g.time(), 11234); assert.equal(g.life, 2); assert.equal(g.blocks, blocks);
  g.miss(); assert.equal(g.life, 2); tick(2000); assert.equal(g.time(), 13234);
  g.pause(); tick(5000); assert.equal(g.time(), 13234); g.resume(); assert.equal(g.state, 'READY');
  tick(100); g.launch(); assert.equal(g.time(), 13334); g.pause(); tick(200); g.resume(); assert.equal(g.state, 'PLAYING');
  g.miss(); g.launch(); g.miss(); assert.equal(g.state, 'GAME OVER'); const final = g.time(); tick(500); assert.equal(g.time(), final);
  g.reset(); assert.equal(g.time(), 0); assert.equal(g.stage, 1); assert.equal(g.life, 3); assert.equal(g.misses, 0);
});
test('全ステージが8×5内の28〜40個・重複なし、複数のランダム配置', () => {
  const layouts = new Set();
  for (let i = 0; i < 100; i++) {
    const { g } = setup(); assert.ok(g.blocks.length >= 28 && g.blocks.length <= 40);
    const cells = g.blocks.map(b => `${b.x},${b.y}`); assert.equal(new Set(cells).size, g.blocks.length);
    g.blocks.forEach(b => { assert.ok(b.x >= 17 && b.x + b.w <= 381 && b.y >= 64 && b.y + b.h <= 186); });
    layouts.add(cells.join('|'));
  }
  assert.ok(layouts.size > 1);
});
test('最後の衝突と同フレームに生成、位置・方向を継承、速度105/110%、3クリアで終了', () => {
  const { g, tick, events } = setup(); g.launch(); tick(1000);
  let generated = 0; const generate = g.generate.bind(g); g.generate = () => { generated++; generate(); };
  for (let stage = 1; stage <= 3; stage++) {
    g.ball = { x: 100, y: 205, vx: 0, vy: -speed(stage) };
    g.blocks = [{ x: 90, y: 180, w: 42, h: 18, row: 0 }];
    g.step(.01);
    if (stage < 3) {
      assert.equal(g.stage, stage + 1); assert.equal(g.state, 'PLAYING');
      assert.equal(g.ball.y, 204); assert.equal(g.ball.vy, speed(stage + 1));
      const y = g.ball.y; g.update(.016); assert.ok(g.ball.y > y); assert.equal(g.time(), 1000);
    }
  }
  assert.equal(generated, 2); assert.equal(g.state, 'ALL CLEAR'); assert.equal(events.filter(e => e[0] === 'clear').length, 1);
  tick(500); assert.equal(g.time(), 1000); assert.equal(speed(2) / speed(1), 1.05); assert.equal(speed(3) / speed(1), 1.1);
});
test('生成時の重なりを離れるまで無視し、再進入時は衝突する', () => {
  const { g } = setup(); g.launch(); g.ball = { x: 38, y: 73, vx: 0, vy: 290 }; g.generate();
  const b = g.blocks.find(b => overlaps(g.ball, b));
  // Select a known overlapping cell even when random generation omits it.
  g.blocks = [b || { x: 17, y: 64, w: 42, h: 18, row: 0, ignored: true }, { x: 300, y: 64, w: 42, h: 18, row: 0 }];
  const target = g.blocks[0]; assert.equal(target.ignored, true);
  g.update(.05); g.update(.01); assert.equal(g.blocks.length, 2); assert.equal(target.ignored, false);
  g.ball.vy = -290; g.update(.05); assert.equal(g.blocks.length, 1); assert.ok(g.ball.vy > 0);
});
test('壁・天井・パドル中央/端の反射、極大dtの制限、落下が1回だけ', () => {
  const { g } = setup(); g.launch(); g.blocks = [];
  for (const [x, vx] of [[6, -290], [394, 290]]) { g.ball = { x, y: 300, vx, vy: -150 }; g.update(.016); assert.ok(g.ball.x >= R && g.ball.x <= 400 - R); assert.equal(Math.sign(g.ball.vx), -Math.sign(vx)); }
  g.ball = { x: 200, y: 6, vx: 0, vy: -290 }; g.update(.016); assert.ok(g.ball.vy > 0);
  for (const offset of [0, 40, -40]) {
    g.ball = { x: 200 + offset, y: PY - R - 1, vx: 0, vy: 290 }; g.update(.016);
    assert.ok(g.ball.vy < 0); assert.ok(Math.abs(Math.hypot(g.ball.vx, g.ball.vy) - 290) < 1e-9);
    assert.ok(Math.abs(g.ball.vy) >= 145 - 1e-9); assert.equal(Math.sign(g.ball.vx), Math.sign(offset));
  }
  g.ball = { x: 200, y: 300, vx: 0, vy: 290 }; g.update(100); assert.ok(g.ball.y <= 315);
  g.ball = { x: 20, y: 585, vx: 0, vy: 290 }; g.update(.05); g.update(.05); assert.equal(g.misses, 1); assert.equal(g.life, 2);
  g.stage = 3; g.launch(); assert.ok(Math.abs(Math.hypot(g.ball.vx, g.ball.vy) - speed(3)) < 1e-9);
});
test('薄いブロックを最大速度で貫通せず、側面も反射', () => {
  for (const side of [false, true]) {
    const { g } = setup(); g.stage = 3; g.launch();
    g.blocks = [{ x: 100, y: 100, w: 42, h: 18, row: 0 }, { x: 300, y: 100, w: 42, h: 18, row: 0 }];
    g.ball = side ? { x: 92, y: 109, vx: speed(3), vy: 0 } : { x: 120, y: 126, vx: 0, vy: -speed(3) };
    g.update(.05); assert.equal(g.blocks.length, 1); assert.ok(side ? g.ball.vx < 0 : g.ball.vy > 0);
  }
});
