'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { C, Game, cents, format, record } = vm.runInNewContext(fs.readFileSync('games/alien-invaders/model.js', 'utf8') + '\nAlienInvaders;');
const game = (random = () => 0) => { const g = new Game({ random }); g.start(); return g; };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function hit(g, enemy) { const r = g.rect(enemy); g.lasers = [{ x: r.x + r.w / 2, y: r.y + r.h + 1 }]; g.update(.001); }
function lastEnemy(g) { g.enemies = [{ col: 2, row: 0, hp: 1, armored: false }]; return g.enemies[0]; }
test('20体5列4行、上10体HP2・下10体HP1、右から開始、START初期化', () => {
  const g = game(); assert.equal(g.enemies.length, 20);
  g.enemies.forEach((e, i) => { assert.equal(e.col, i % 5); assert.equal(e.row, Math.floor(i / 5)); assert.equal(e.hp, i < 10 ? 2 : 1); });
  assert.equal(g.formation.direction, 1); assert.equal(g.ship, 180); assert.equal(g.lives, 3); assert.equal(g.enemyClock, 1);
  g.hits = 2; g.elapsed = 99; g.bullets.push({}); g.start(); assert.equal(g.elapsed, 0); assert.equal(g.hits, 0); assert.equal(g.bullets.length, 0);
});
test('即時射撃、0.35秒連射、最大3発、連打で周期を迂回しない', () => {
  const g = game(); g.setFiring(true); assert.equal(g.lasers.length, 1);
  g.update(.349); assert.equal(g.lasers.length, 1); g.update(.001); assert.equal(g.lasers.length, 2);
  g.update(.35); assert.equal(g.lasers.length, 3); g.lasers.forEach(b => b.x = 1);
  g.update(.35); assert.equal(g.lasers.length, 3);
  g.setFiring(false); g.setFiring(true); assert.equal(g.lasers.length, 3);
  g.lasers = []; g.setFiring(false); g.update(.35); assert.equal(g.lasers.length, 0);
});
test('左右速度・移動限界・レーザーは独立直進・画面外削除', () => {
  const g = game(); g.setFiring(true); g.setFiring(false); const x = g.lasers[0].x, y = g.lasers[0].y;
  g.direction = 1; g.update(.1); near(g.ship, 180 + C.shipSpeed * .1); near(g.lasers[0].y, y - C.laserSpeed * .1); assert.equal(g.lasers[0].x, x);
  g.update(1); assert.equal(g.ship, C.width - C.shipWidth / 2); g.direction = -1; g.update(2); assert.equal(g.ship, C.shipWidth / 2); assert.equal(g.lasers.length, 0);
});
test('上段1発目で装甲破損、2発目で撃破、下段は1発、爆発0.2秒', () => {
  const g = game(), upper = g.enemies[0], lower = g.enemies[19]; hit(g, upper);
  assert.equal(upper.hp, 1); assert.equal(upper.armored, true); assert.equal(g.enemies.length, 20);
  hit(g, upper); assert.equal(g.enemies.length, 19); assert.equal(g.effects.length, 1); near(g.effects[0].remaining, .2);
  hit(g, lower); assert.equal(g.enemies.length, 18); g.update(.201); assert.equal(g.effects.length, 0);
});
test('撃破済み列を含む初期5列の仮想矩形で両端反転・下降', () => {
  const g = game(); g.enemies = [g.enemies[2]]; g.formation.x = C.width - 8 - C.formationWidth - .01; const y = g.formation.y;
  g.update(.01); assert.equal(g.formation.direction, -1); near(g.formation.y, y + C.drop);
  assert.ok(g.rect(g.enemies[0]).x + C.enemyWidth < C.width - 8);
  g.formation.x = 8.01; g.update(.01); assert.equal(g.formation.direction, 1); near(g.formation.y, y + C.drop * 2);
});
test('撃破数で加速、最高速度を保持', () => {
  const g = game(); near(g.speed(), C.formationSpeed); g.enemies.pop(); near(g.speed(), C.formationSpeed + C.acceleration);
  g.enemies = [g.enemies[0]]; near(g.speed(), C.maxFormationSpeed);
});
test('最下段候補の列からランダム射撃、初回も1〜2秒、同時弾上限なし', () => {
  for (const r of [0, .5, .999999]) {
    const g = game(() => r); near(g.enemyClock, 1 + r); g.update(g.enemyClock - .001); assert.equal(g.bullets.length, 0); g.update(.001); assert.equal(g.bullets.length, 1);
    const e = g.enemies[15 + Math.floor(r * 5)], rect = g.rect(e); near(g.bullets[0].x, rect.x + rect.w / 2);
    assert.ok(g.bullets[0].y >= rect.y + rect.h); near(g.enemyClock, 1 + r);
  }
  const g = game(); g.enemies = g.enemies.filter(e => e.col === 0 && e.row < 2); g.fireEnemy(); near(g.bullets[0].y, g.rect(g.enemies[1]).y + C.enemyHeight);
  for (let i = 0; i < 30; i++) g.fireEnemy(); assert.equal(g.bullets.length, 31);
});
test('敵弾は真下・削除、自機弾と互いに通過', () => {
  const g = game(); g.bullets = [{ x: 10, y: 220 }]; g.lasers = [{ x: 10, y: 228 }]; g.update(.1);
  assert.equal(g.bullets.length, 1); assert.equal(g.lasers.length, 1); near(g.bullets[0].y, 220 + C.enemyBulletSpeed * .1); assert.equal(g.bullets[0].x, 10);
  g.bullets[0].y = C.height; g.update(.01); assert.equal(g.bullets.length, 0);
});
test('小さい矩形、被弾1回で1減少・3秒加算・1秒無敵・連続被弾防止', () => {
  const g = game(), damage = () => { g.bullets.push({ x: g.ship, y: C.shipY }); g.update(.001); };
  assert.ok(g.shipRect(true).w < C.shipWidth); damage(); assert.equal(g.lives, 2); assert.equal(g.hits, 1);
  for (let i = 0; i < 5; i++) damage(); assert.equal(g.lives, 2);
  g.bullets = []; g.update(.995); damage(); assert.equal(g.lives, 1); assert.equal(g.hits, 2);
  near(g.finalCents(), cents(g.elapsed) + 600);
});
test('ライフ0・防衛ライン・自機接触でGAME OVER、確定後は変更不可', () => {
  for (const reason of ['life', 'line', 'contact']) {
    const g = game();
    if (reason === 'life') { g.lives = 1; g.bullets = [{ x: g.ship, y: C.shipY }]; }
    else { g.enemies = [g.enemies[0]]; g.formation.y = reason === 'line' ? C.defenseY - C.enemyHeight : C.shipY; g.formation.x = g.ship - C.enemyWidth / 2; }
    g.update(.001); assert.equal(g.state, 'GAME OVER'); const t = g.elapsed; g.enemies = []; g.update(1); assert.equal(g.state, 'GAME OVER'); near(g.elapsed, t);
  }
});
test('同一更新フレームの全滅は被弾・ライフ0・ラインより優先、過去の被弾は保持', () => {
  const g = game(); g.hits = 1; g.lives = 1; const e = lastEnemy(g);
  g.formation.y = C.defenseY - C.enemyHeight; g.bullets = [{ x: g.ship, y: C.shipY }]; hit(g, e);
  assert.equal(g.state, 'CLEAR'); assert.equal(g.lives, 1); assert.equal(g.hits, 1); assert.ok(!g.events.includes('hit')); assert.equal(g.finalCents(), cents(g.elapsed) + 300);
  const h = game(); h.hits = 1; h.lives = 1; const target = lastEnemy(h), r = h.rect(target);
  h.lasers = [{ x: r.x + 14, y: r.y + r.h + 20 }]; h.bullets = [{ x: h.ship, y: C.shipY }]; h.update(.05);
  assert.equal(h.state, 'CLEAR'); assert.equal(h.hits, 1); assert.equal(h.lives, 1);
});
test('PAUSEで全時計停止、入力解除、RESUME・RESTARTで暴発なし', () => {
  const g = game(); g.direction = 1; g.setFiring(true); g.update(.2); g.pause(); const before = JSON.stringify(g); g.update(1000); g.setFiring(true);
  assert.equal(JSON.stringify(g), before); g.resume(); assert.equal(g.direction, 0); assert.equal(g.firing, false); g.update(.1); near(g.elapsed, .3);
  g.start(); assert.equal(g.elapsed, 0); assert.equal(g.lasers.length, 0); assert.equal(g.firing, false);
});
test('0.01秒表示・比較用整数と不正BESTの拒否', () => {
  assert.equal(format(40.126), '40.13s'); assert.equal(cents(40.124), 4012); assert.equal(cents(40.123), 4012);
  for (const value of [null, '', 'NaN', '-1', '1.2', 'Infinity', '0', '9007199254740992']) assert.equal(record(value), null);
  assert.equal(record('4012'), 4012);
});
test('一覧登録・ローカル参照・サブパスHOME・既存6作品は登録維持', () => {
  const games = JSON.parse(fs.readFileSync('data/games.json', 'utf8')); assert.equal(games.length, 9); assert.equal(games[6].id, 'alien-invaders'); assert.equal(games[6].status, 'published');
  for (const g of games) { assert.ok(fs.existsSync(g.url)); assert.ok(fs.existsSync(g.thumbnail)); }
  const html = fs.readFileSync('games/alien-invaders/index.html', 'utf8'), home = html.match(/id="home" href="([^"]+)"/)[1];
  assert.equal(new URL(home, 'https://example.com/08_my-arcade/games/alien-invaders/').pathname, '/08_my-arcade/index.html');
});
