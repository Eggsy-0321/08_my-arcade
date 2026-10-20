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
test('8×5内の24〜32個・重複なし、複数のランダム配置', () => {
  const layouts = new Set();
  for (let i = 0; i < 100; i++) {
    const { g } = setup(); assert.ok(g.blocks.length >= 24 && g.blocks.length <= 32);
    const cells = g.blocks.map(b => `${b.x},${b.y}`); assert.equal(new Set(cells).size, g.blocks.length);
    g.blocks.forEach(b => { assert.ok(b.x >= 17 && b.x + b.w <= 381 && b.y >= 64 && b.y + b.h <= 186); });
    layouts.add(cells.join('|'));
  }
  assert.ok(layouts.size > 1);
  for (const [random, count] of [[() => 0, 24], [() => .999999, 32]]) {
    const g = new Game({ random }); g.reset(); assert.equal(g.blocks.length, count);
  }
});
test('初回・再発射の速度319は旧版比10%増、RETRYで配置を再生成', () => {
  const { g, tick } = setup(); const previous = g.blocks;
  assert.equal(speed(), 319); assert.equal(speed() / 290, 1.1);
  g.launch(); assert.ok(Math.abs(Math.hypot(g.ball.vx, g.ball.vy) - 319) < 1e-9);
  tick(1000); g.miss(); g.launch(); assert.ok(Math.abs(Math.hypot(g.ball.vx, g.ball.vy) - 319) < 1e-9);
  g.reset(); assert.notEqual(g.blocks, previous); assert.equal(g.time(), 0);
  assert.equal(g.life, 3); assert.equal(g.state, 'READY'); assert.equal(g.stage, 1);
});
test('最後の衝突と同フレームにALL CLEAR、追加生成やステージ2・3へ進まず時計停止', () => {
  const { g, tick, events } = setup(); g.launch(); tick(1000);
  let generated = 0; g.generate = () => { generated++; };
  g.ball = { x: 100, y: 205, vx: 0, vy: -speed() };
  g.blocks = [{ x: 90, y: 180, w: 42, h: 18, row: 0 }];
  g.update(.01);
  assert.equal(g.state, 'ALL CLEAR'); assert.equal(g.stage, 1);
  assert.equal(g.blocks.length, 0); assert.equal(generated, 0);
  assert.equal(events.filter(e => e[0] === 'stage').length, 0);
  assert.equal(events.filter(e => e[0] === 'clear').length, 1);
  const ball = { ...g.ball }; tick(500); g.update(.05); g.launch();
  assert.equal(g.time(), 1000); assert.deepEqual({ ...g.ball }, ball); assert.equal(g.stage, 1);
});
test('生成時の重なりを離れるまで無視し、再進入時は衝突する', () => {
  const { g } = setup(); g.launch(); g.ball = { x: 38, y: 73, vx: 0, vy: 319 }; g.generate();
  const b = g.blocks.find(b => overlaps(g.ball, b));
  // Select a known overlapping cell even when random generation omits it.
  g.blocks = [b || { x: 17, y: 64, w: 42, h: 18, row: 0, ignored: true }, { x: 300, y: 64, w: 42, h: 18, row: 0 }];
  const target = g.blocks[0]; assert.equal(target.ignored, true);
  g.update(.05); g.update(.01); assert.equal(g.blocks.length, 2); assert.equal(target.ignored, false);
  g.ball.vy = -319; g.update(.05); assert.equal(g.blocks.length, 1); assert.ok(g.ball.vy > 0);
});
test('壁・天井・パドル中央/端の反射、極大dtの制限、落下が1回だけ', () => {
  const { g } = setup(); g.launch(); g.blocks = [];
  for (const [x, vx] of [[6, -319], [394, 319]]) { g.ball = { x, y: 300, vx, vy: -150 }; g.update(.016); assert.ok(g.ball.x >= R && g.ball.x <= 400 - R); assert.equal(Math.sign(g.ball.vx), -Math.sign(vx)); }
  g.ball = { x: 200, y: 6, vx: 0, vy: -319 }; g.update(.016); assert.ok(g.ball.vy > 0);
  for (const offset of [0, 40, -40]) {
    g.ball = { x: 200 + offset, y: PY - R - 1, vx: 0, vy: 319 }; g.update(.016);
    assert.ok(g.ball.vy < 0); assert.ok(Math.abs(Math.hypot(g.ball.vx, g.ball.vy) - 319) < 1e-9);
    assert.ok(Math.abs(g.ball.vy) >= 159.5 - 1e-9); assert.equal(Math.sign(g.ball.vx), Math.sign(offset));
  }
  g.ball = { x: 200, y: 300, vx: 0, vy: 319 }; g.update(100); assert.ok(g.ball.y <= 316);
  g.ball = { x: 20, y: 585, vx: 0, vy: 319 }; g.update(.05); g.update(.05); assert.equal(g.misses, 1); assert.equal(g.life, 2);
  g.launch(); assert.ok(Math.abs(Math.hypot(g.ball.vx, g.ball.vy) - speed()) < 1e-9);
});
test('薄いブロックを最大速度で貫通せず、側面も反射', () => {
  for (const side of [false, true]) {
    const { g } = setup(); g.launch();
    g.blocks = [{ x: 100, y: 100, w: 42, h: 18, row: 0 }, { x: 300, y: 100, w: 42, h: 18, row: 0 }];
    g.ball = side ? { x: 92, y: 109, vx: speed(), vy: 0 } : { x: 120, y: 126, vx: 0, vy: -speed() };
    g.update(.05); assert.equal(g.blocks.length, 1); assert.ok(side ? g.ball.vx < 0 : g.ball.vy > 0);
  }
});

// Execute the production UI with minimal DOM/Canvas stubs to exercise storage
// and input wiring without requiring a browser or adding a game debug API.
function ui(initial = {}, blocked = false) {
  const storage = new Map(Object.entries(initial)), nodes = new Map(), documentEvents = {}, windowEvents = {};
  let now = 0, frame;
  const drawing = new Proxy({}, { get: () => () => {}, set: () => true });
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', handlers: {},
      addEventListener(type, cb) { this.handlers[type] = cb; }, setAttribute() {}, focus() {}, setPointerCapture() {},
      getContext: () => drawing, getBoundingClientRect: () => ({ left: 0, width: 400, height: 580 }) });
    return nodes.get(id);
  };
  const context = vm.createContext({ performance: { now: () => now }, devicePixelRatio: 1,
    document: { getElementById: node, addEventListener: (t, cb) => documentEvents[t] = cb, hidden: false },
    window: { addEventListener: (t, cb) => windowEvents[t] = cb },
    localStorage: { getItem(k) { if (blocked) throw Error('blocked'); return storage.get(k) ?? null; },
      setItem(k, v) { if (blocked) throw Error('blocked'); storage.set(k, String(v)); } },
    ResizeObserver: class { observe() {} }, requestAnimationFrame: cb => frame = cb });
  vm.runInContext(fs.readFileSync('games/block-breaker/model.js', 'utf8') + `
    const OriginalGame = BlockBreaker.Game;
    BlockBreaker.Game = class extends OriginalGame { constructor(options) { super(options); globalThis.g = this; } };
  `, context);
  vm.runInContext(fs.readFileSync('games/block-breaker/game.js', 'utf8'), context);
  return { g: context.g, storage, node, documentEvents, context,
    click: id => node(id).handlers.click(), tick(ms) { now += ms; frame(now); } };
}
test('旧BESTを保持・比較せず、新キーの最速クリアのみ保存、GAME OVER・RETRY・ミュートを分離', () => {
  const old = 'my-arcade:block-breaker:best', key = 'my-arcade:block-breaker:v1.1:best';
  const u = ui({ [old]: '100', 'my-arcade:block-breaker:muted': 'true' });
  assert.equal(u.node('best').textContent, '--:--.--'); assert.equal(u.node('stage').textContent, '1/1');
  u.click('action'); u.click('launch'); u.tick(500);
  for (let i = 0; i < 3; i++) { u.g.miss(); u.g.launch(); }
  u.tick(0); assert.equal(u.g.state, 'GAME OVER'); assert.equal(u.storage.has(key), false);
  const clear = ms => {
    u.click('retry'); u.click('launch'); u.tick(ms);
    u.g.blocks = [{ x: 20, y: 64, w: 42, h: 18, row: 0 }]; u.g.destroy(0); u.tick(0);
    assert.equal(u.node('screen-title').textContent, 'ALL CLEAR');
  };
  clear(500); assert.equal(u.storage.get(key), '500'); assert.equal(u.node('best').textContent, '00:00.50');
  clear(1000); assert.equal(u.storage.get(key), '500');
  clear(250); assert.equal(u.storage.get(key), '250'); assert.equal(u.storage.get(old), '100');
  assert.equal(u.storage.get('my-arcade:block-breaker:muted'), 'true');
  assert.equal(ui(Object.fromEntries(u.storage)).node('best').textContent, '00:00.25');
});
test('localStorage使用不可でも開始・発射・クリア・RETRYが動作', () => {
  const u = ui({}, true); assert.equal(u.node('best').textContent, '--:--.--');
  u.click('action'); u.click('launch'); u.tick(100);
  u.g.blocks = [{ x: 20, y: 64, w: 42, h: 18, row: 0 }]; u.g.destroy(0); u.tick(0);
  assert.equal(u.g.state, 'ALL CLEAR'); u.click('retry'); assert.equal(u.g.state, 'READY');
});
test('PCキー・マウスとAndroid相当pointer入力、自動停止の配線を維持', () => {
  const u = ui(); u.click('action');
  const target = { closest: () => null }, key = code => ({ code, target, preventDefault() {} });
  u.documentEvents.keydown(key('ArrowRight')); u.tick(16); u.documentEvents.keyup(key('ArrowRight'));
  assert.ok(u.g.paddle > 200);
  const canvas = u.node('game'), pointer = { pointerType: 'touch', pointerId: 1, clientX: 30, preventDefault() {} };
  const x = u.g.paddle; canvas.handlers.pointerdown(pointer); assert.equal(u.g.paddle, x);
  canvas.handlers.pointermove({ ...pointer, clientX: 80 }); assert.equal(u.g.paddle, x + 50);
  canvas.handlers.pointerup(pointer); assert.equal(u.g.state, 'READY');
  u.documentEvents.keydown(key('Space')); assert.equal(u.g.state, 'PLAYING');
  u.tick(100); u.documentEvents.keydown(key('KeyP')); const time = u.g.time(); u.tick(1000);
  assert.equal(u.g.time(), time); u.documentEvents.keydown(key('KeyP')); assert.equal(u.g.state, 'PLAYING');
  u.context.document.hidden = true; u.documentEvents.visibilitychange(); u.tick(1000); assert.equal(u.g.time(), time);
  u.click('retry'); canvas.handlers.pointerdown({ ...pointer, pointerType: 'mouse', button: 0, clientX: 150 });
  assert.equal(u.g.paddle, 150); assert.equal(u.g.state, 'PLAYING');
});
