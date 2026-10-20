'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync('games/number-merge/model.js', 'utf8') + '\nglobalThis.api = NumberMerge;', context);
const { Game, slide, canMove, format } = context.api;
const plain = v => JSON.parse(JSON.stringify(v));
const row = values => [...values, ...Array(16 - values.length).fill(0)];
test('4方向の圧縮・合体、元盤面を変更しない', () => {
  for (const direction of ['left', 'right', 'up', 'down']) {
    const vertical = ['up', 'down'].includes(direction), reverse = ['right', 'down'].includes(direction);
    const indices = [0, 1, 2, 3].map(n => vertical ? n * 4 : n);
    const board = Array(16).fill(0); [2, 0, 2, 4].forEach((v, i) => board[indices[i]] = v);
    const original = board.slice(), result = slide(board, direction);
    assert.deepEqual(board, original);
    assert.deepEqual(indices.map(i => result.board[i]), reverse ? [0, 0, 4, 4] : [4, 4, 0, 0]);
    assert.equal(result.changed, true);
  }
});
test('連続合体・二重合体防止・隙間・合体順', () => {
  for (const [input, expected] of [
    [[2, 2, 2, 2], [4, 4, 0, 0]], [[2, 2, 4, 0], [4, 4, 0, 0]],
    [[4, 4, 8, 8], [8, 16, 0, 0]], [[2, 0, 2, 2], [4, 2, 0, 0]],
    [[2, 2, 2, 0], [4, 2, 0, 0]], [[4, 2, 2, 0], [4, 4, 0, 0]]]) {
    assert.deepEqual(plain(slide(row(input), 'left').board), row(expected));
  }
  assert.deepEqual(plain(slide(row([2, 2, 2, 0]), 'right').board), row([0, 0, 2, 4]));
});
test('初期2枚、90/10境界、空きマスだけに生成', () => {
  for (const [random, value] of [[() => 0, 2], [() => .899999, 2], [() => .9, 4], [() => .99999, 4]]) {
    const g = new Game({ now: () => 0, random }); g.start();
    assert.equal(g.board.filter(Boolean).length, 2); assert.ok(g.board.filter(Boolean).every(v => v === value));
    g.board = Array(16).fill(8); g.board[6] = 0; assert.equal(g.spawn(), 6); assert.equal(g.board[6], value);
    assert.equal(g.spawn(), null);
  }
});
test('無効操作で盤面・乱数を維持、有効操作で1枚のみ追加', () => {
  let calls = 0; const g = new Game({ now: () => 0, random: () => { calls++; return 0; } });
  g.start(); g.board = row([2, 4]); const before = g.board.slice(), previous = calls;
  assert.equal(g.move('left').changed, false); assert.deepEqual(plain(g.board), before); assert.equal(calls, previous);
  assert.equal(g.move('bad').changed, false); assert.equal(calls, previous);
  g.move('right'); assert.equal(g.board.filter(Boolean).length, 3); assert.equal(calls, previous + 2);
});
test('STARTから計測、2048で即停止・追加生成なし・終了後操作無効・RETRYで再計測', () => {
  let now = 500; const g = new Game({ now: () => now, random: () => 0 });
  assert.equal(g.time(), 0); g.start(); now += 12345; assert.equal(g.time(), 12345);
  g.board = row([1024, 1024]); g.move('left'); assert.equal(g.state, 'GAME CLEAR');
  assert.equal(g.board.filter(Boolean).length, 1); now += 2000; assert.equal(g.time(), 12345);
  assert.equal(g.move('right').changed, false); g.start(); assert.equal(g.time(), 0); now += 10; assert.equal(g.time(), 10);
});
test('移動不能判定、満杯でも隣接合体可能なら継続、最後の生成でゲームオーバー・時計停止', () => {
  const dead = [2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2];
  assert.equal(canMove(dead), false); assert.equal(canMove(row([2])), true);
  for (const index of [1,4]) { const b = dead.slice(); b[index] = 2; assert.equal(canMove(b), true); }
  let now = 0; const g = new Game({ now: () => now, random: () => 0 }); g.start();
  g.board = [2,4,8,16,32,64,128,256,512,2,4,8,16,32,64,0]; now = 400; g.move('right');
  assert.equal(g.state, 'GAME OVER'); now = 900; assert.equal(g.time(), 400);
});
test('タイム表記は100分の1秒、60分・100分以上も正しく表示', () => {
  for (const [ms, expected] of [[0,'00:00.00'],[9,'00:00.00'],[10,'00:00.01'],[59999,'00:59.99'],[60000,'01:00.00'],[3600000,'60:00.00'],[6000000,'100:00.00']]) assert.equal(format(ms), expected);
});
test('ランダム盤面1000件×4方向の総和維持・入力不変・出力サイズ', () => {
  for (let n = 0; n < 1000; n++) {
    const board = Array.from({ length: 16 }, () => Math.random() < .4 ? 0 : 2 ** (1 + Math.floor(Math.random() * 6)));
    for (const dir of ['left','right','up','down']) {
      const original = board.slice(), result = slide(board, dir);
      assert.deepEqual(board, original); assert.equal(result.board.length, 16);
      assert.equal(result.board.reduce((a,b) => a+b), board.reduce((a,b) => a+b));
      assert.equal(result.changed, result.board.some((v,i) => v !== board[i]));
    }
  }
});
