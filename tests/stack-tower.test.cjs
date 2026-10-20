'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const rules = vm.runInNewContext(fs.readFileSync('games/stack-tower/model.js', 'utf8') + '\nStackTowerRules;');
const below = { x: 100, width: 100, y: 0 };

test('完全一致と±4px以内は位置・幅を補正', () => {
  for (const offset of [0, -4, 4, -3.99, 3.99]) {
    const result = rules.overlap({ x: 100 + offset, width: 100 }, below);
    assert.equal(result.success, true);
    assert.equal(result.perfect, true);
    assert.equal(result.x, 100);
    assert.equal(result.width, 100);
    assert.equal(result.cut, null);
  }
});
test('4pxを超えたら実際の重なりと左右の切れ端を使う', () => {
  for (const offset of [-4.01, 4.01, -30, 30]) {
    const result = rules.overlap({ x: 100 + offset, width: 100 }, below);
    assert.equal(result.perfect, false);
    assert.ok(Math.abs(result.width - (100 - Math.abs(offset))) < 1e-10);
    assert.equal(result.x, Math.max(100, 100 + offset));
    assert.ok(Math.abs(result.cut.width - Math.abs(offset)) < 1e-10);
    assert.equal(result.cut.x, offset < 0 ? 100 + offset : 200);
  }
});
test('非接触・端の接触・幅が4px未満で重なりなしは失敗', () => {
  for (const x of [0, -10, 200, 201]) assert.equal(rules.overlap({ x, width: 100 }, below).success, false);
  for (const x of [98, 102, 103]) assert.equal(rules.overlap({ x, width: 2 }, { x: 100, width: 2 }).success, false);
});
test('極小の正の重なりも実寸を保持（判定を広げない）', () => {
  const result = rules.overlap({ x: 199.9, width: 100 }, below);
  assert.equal(result.perfect, false);
  assert.ok(Math.abs(result.width - 0.1) < 1e-10);
});
test('次段の幅、左右交互の出現、段の高さ', () => {
  for (const score of [0, 1, 2, 19]) {
    const block = rules.spawn({ x: 75, y: 44, width: 57.5 }, score, 360);
    assert.equal(block.width, 57.5);
    assert.equal(block.x, score % 2 ? 302.5 : 0);
    assert.equal(block.direction, score % 2 ? -1 : 1);
    assert.equal(block.y, 66);
  }
});
test('速度が段階的に増加し上限で止まる', () => {
  assert.ok(rules.speed(1) > rules.speed(0));
  assert.equal(rules.speed(100), 310);
  assert.equal(rules.speed(10000), 310);
});
test('経過時間に依存した往復移動（フレームレート非依存）', () => {
  const a = { x: 0, width: 100, direction: 1 };
  const b = { ...a };
  rules.advance(a, 4, 125, 360);
  for (let i = 0; i < 240; i++) rules.advance(b, 1 / 60, 125, 360);
  assert.ok(Math.abs(a.x - b.x) < 1e-9);
  assert.equal(a.direction, -1);
  assert.ok(a.x >= 0 && a.x <= 260);
});
