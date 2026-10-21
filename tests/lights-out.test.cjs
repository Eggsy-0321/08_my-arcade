'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { Game, flip, solved, generate, format, record } = vm.runInNewContext(fs.readFileSync('games/lights-out/model.js', 'utf8') + '\nLightsOut;');
function setup(random = Math.random) { let now = 0; const g = new Game({ now: () => now, random }); return { g, tick: ms => now += ms }; }
test('5×5の中央・上下左右の辺・四隅だけを十字反転し、2回で元に戻る', () => {
  for (let i = 0; i < 25; i++) {
    const board = Array(25).fill(true); flip(board, i);
    for (let j = 0; j < 25; j++) assert.equal(board[j], !(Math.abs(Math.floor(i / 5) - Math.floor(j / 5)) + Math.abs(i % 5 - j % 5) <= 1));
    flip(board, i); assert.ok(solved(board));
  }
});
test('25個すべてがtrueの場合のみクリア', () => {
  assert.ok(solved(Array(25).fill(true)));
  for (let i = 0; i < 25; i++) { const b = Array(25).fill(true); b[i] = false; assert.equal(solved(b), false); }
  for (const b of [[], Array(24).fill(true), Array(26).fill(true), Array(25).fill(1)]) assert.equal(solved(b), false);
});
test('1000問が6〜10個の重複なし・範囲内の選択で生成され、逆操作で必ず全ON', () => {
  const counts = new Set(), boards = new Set();
  for (let i = 0; i < 1000; i++) {
    const { board, selected } = generate();
    assert.equal(board.length, 25); assert.equal(solved(board), false);
    assert.ok(selected.length >= 6 && selected.length <= 10); assert.equal(new Set(selected).size, selected.length);
    selected.forEach(index => { assert.ok(Number.isInteger(index) && index >= 0 && index < 25); });
    counts.add(selected.length); boards.add(board.join(','));
    selected.forEach(index => flip(board, index)); assert.ok(solved(board));
  }
  assert.equal(counts.size, 5); assert.ok(boards.size > 900);
});
test('START待機・MOVES・TIME、RESETは同じ問題で0から即時計測', () => {
  const { g, tick } = setup(); tick(3000); assert.equal(g.time(), 0); assert.equal(g.state, 'START');
  assert.equal(g.move(0), false); assert.equal(g.reset(), false); g.start(); const initial = g.board.slice();
  tick(1234); g.move(12); assert.equal(g.moves, 1); assert.equal(g.time(), 1234);
  assert.equal(g.move(-1), false); assert.equal(g.move(25), false); assert.equal(g.move(1.2), false); assert.equal(g.moves, 1);
  g.reset(); assert.deepEqual(g.board, initial); assert.equal(g.moves, 0); assert.equal(g.time(), 0);
  tick(200); assert.equal(g.time(), 200);
});
test('PAUSE中は時間・操作・RESET・STARTを止め、RESUMEでのみ再開', () => {
  const { g, tick } = setup(); g.start(); tick(500); g.pause(); const board = g.board.slice();
  tick(9000); assert.equal(g.time(), 500); assert.equal(g.move(2), false); assert.equal(g.reset(), false); assert.equal(g.start(), false);
  assert.deepEqual(g.board, board); assert.equal(g.moves, 0); g.update(); assert.equal(g.state, 'PAUSED');
  g.resume(); tick(300); assert.equal(g.time(), 800); assert.equal(g.resume(), false);
});
test('クリア時刻で停止、WAVEの1秒中は状態変更不可、RETRYは別問題', () => {
  const { g, tick } = setup(() => 0); g.start(); const initial = g.initial.slice(); tick(2500);
  g.selected.forEach(i => g.move(i)); assert.equal(g.state, 'WAVE'); assert.equal(g.time(), 2500);
  const moves = g.moves, board = g.board.slice();
  for (const method of ['pause', 'resume', 'reset', 'start']) assert.equal(g[method](), false);
  assert.equal(g.move(1), false); assert.equal(g.moves, moves); assert.deepEqual(g.board, board);
  tick(999); g.update(); assert.equal(g.state, 'WAVE'); tick(1); g.update(); assert.equal(g.state, 'CLEAR'); assert.equal(g.time(), 2500);
  g.start(); assert.equal(g.state, 'PLAYING'); assert.notDeepEqual(g.initial, initial); assert.equal(g.moves, 0); assert.equal(g.time(), 0);
});
test('乱数端値と固定乱数でもRETRYが同一問題でループしない', () => {
  for (const random of [() => 0, () => .999999]) {
    const a = generate(random), b = generate(random, a.board);
    assert.notDeepEqual(a.board, b.board); assert.equal(solved(b.board), false);
    b.selected.forEach(i => flip(b.board, i)); assert.ok(solved(b.board));
  }
});
test('保存値の欠損・空白・負数・非数・無限・手数の小数や過大値を拒否', () => {
  for (const raw of [null, undefined, '', ' ', '-1', 'NaN', 'Infinity', 'abc', '{}']) assert.equal(record(raw), null);
  assert.equal(record('12', true), 12); assert.equal(record('1234.5'), 1234.5);
  assert.equal(record('1.5', true), null); assert.equal(record('9007199254740992', true), null);
  assert.equal(record('0', true), null);
  assert.equal(format(12345), '00:12.34'); assert.equal(format(60000), '01:00.00');
});
test('登録・サブパス・必要な画面操作を持つ', () => {
  const games = JSON.parse(fs.readFileSync('data/games.json', 'utf8'));
  assert.equal(games.at(-1).id, 'lights-out'); assert.equal(games.at(-1).status, 'published');
  const html = fs.readFileSync('games/lights-out/index.html', 'utf8');
  for (const id of ['start', 'retry', 'home', 'reset', 'pause', 'resume', 'sound']) assert.ok(html.includes(`id="${id}"`));
  assert.match(html, /id="home" href="\.\.\/\.\.\/index.html"/);
});
