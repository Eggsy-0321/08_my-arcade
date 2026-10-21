'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');
const api=vm.runInNewContext(fs.readFileSync('games/snake-invaders/model.js','utf8')+'\nSnakeInvaders;');
const {Game,W,H,R,D,LIMIT,SHIP_Y,SHIP_SPEED,BASE_SPEED,BULLET_SPEED,difficulty,createSnake,positions,moveSnake,firstHit}=api;
const plain=v=>JSON.parse(JSON.stringify(v));
const game=()=> { const g=new Game({random:()=>0}); g.start(); return g; };
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function target(x,y,body=0) { const s=createSnake(()=>0); moveSnake(s,x-R); s.y=y; s.path=[{x:x-D*body,y,s:s.distance-D*body},{x,y,s:s.distance}]; s.body=body; return s; }
test('左右出現、頭1個と胴体3〜8個、START直後1匹',()=> {
  for(const n of [0,.499,.5,.999999]) { const s=createSnake(()=>n); assert.equal(s.body,3+Math.floor(n*6)); assert.equal(s.direction,n<.5 ? 1 : -1); assert.equal(s.x,n<.5 ? R : W-R); assert.equal(s.y,R); }
  const g=game(); assert.equal(g.snakes.length,1); assert.equal(g.time,0); assert.equal(g.ship,W/2);
});
test('横断3秒、左右反転と直径2個の下降、角を距離でたどる胴体',()=> {
  for(const random of [()=>0,()=>.99]) {
    const s=createSnake(random), initial=s.x, dir=s.direction;
    moveSnake(s,W-D); assert.equal(s.direction,-dir); assert.equal(s.y,R); near(s.drop,2*D);
    moveSnake(s,D); assert.equal(s.y,R+D);
    const p=positions(s); assert.equal(p[1].y,R); assert.equal(p[1].x,s.x); near(Math.abs(p[2].x-s.x),D);
    moveSnake(s,D+10); near(s.y,R+2*D); near(s.x,initial+dir*(W-D-10));
    const q=positions(s); near(q[1].y,R+2*D-(D-10)); near(q[1].x,initial+dir*(W-D));
    moveSnake(s,W-D-10); assert.equal(s.direction,dir); near(s.x,initial);
  }
  near(BASE_SPEED*3,W-D);
});
test('経路の履歴が長時間でも有界、速度変化でもセグメント間隔を保持',()=> {
  const s=createSnake(()=>.99);
  for(let i=0;i<2000;i++) { moveSnake(s,i%2 ? 2.25 : .5); assert.ok(s.path.length<16); const ps=positions(s); for(let j=1;j<ps.length;j++) assert.ok(Math.hypot(ps[j].x-ps[j-1].x,ps[j].y-ps[j-1].y)<=D+1e-8); }
});
test('胴体のどこに当たっても尻尾だけ1個削除、頭の残存胴体得点',()=> {
  for(const index of [1,2,3]) { const g=game(),s=g.snakes[0], before=plain(positions(s)); g.hit({snake:s,index}); assert.equal(s.body,2); assert.equal(g.score,10); assert.deepEqual(plain(positions(s)),before.slice(0,-1)); g.hit({snake:s,index:0}); assert.equal(g.score,150); assert.equal(g.snakes.length,0); assert.equal(g.effects.length,1); }
  const g=game(),s=g.snakes[0]; for(let i=0;i<3;i++)g.hit({snake:s,index:1}); moveSnake(s,20); assert.equal(s.body,0); assert.equal(positions(s).length,1); g.hit({snake:s,index:0}); assert.equal(g.score,130);
});
test('高速弾でも最初の対象のみ命中、配列順より進行方向優先、同時は頭優先',()=> {
  const upper=target(180,120), lower=target(180,220,3);
  let hit=firstHit([upper,lower],{x:180,y:500},0); assert.equal(hit.snake,lower); assert.equal(hit.index,0);
  const bodySnake=target(204,220,1), headSnake=target(180,220);
  hit=firstHit([bodySnake,headSnake],{x:180,y:500},0); assert.equal(hit.snake,headSnake); assert.equal(hit.index,0);
  hit=firstHit([upper,bodySnake],{x:180,y:500},0); assert.equal(hit.snake,bodySnake); assert.equal(hit.index,1);
  assert.equal(firstHit([upper],{x:220,y:500},0),null);
  const g=game(); g.snakes=[upper,lower]; g.bullets=[{x:180,y:260}]; g.update(.1); assert.equal(g.snakes.length,1); assert.equal(g.snakes[0],upper); assert.equal(g.score,160); assert.equal(g.bullets.length,0);
});
test('30秒ごとの難易度境界と120秒以降固定',()=> {
  for(const [t,interval,mult] of [[0,6,1],[29.999,6,1],[30,5,1.125],[59.999,5,1.125],[60,4,1.25],[90,3,1.375],[120,2,1.5],[999,2,1.5]]) { const d=difficulty(t); assert.equal(d.interval,interval); near(d.speed,BASE_SPEED*mult); }
  near((W-D)/difficulty(120).speed,2);
});
test('出現間隔、最大5匹・予定は1件だけ保留、撃破で即時補充',()=> {
  const g=game(); g.fireClock=-10000; g.update(5.99); assert.equal(g.snakes.length,1); g.update(.02); assert.equal(g.snakes.length,2);
  g.snakes=Array.from({length:5},()=>createSnake(()=>0)); g.spawnClock=5.99; g.update(.02); assert.equal(g.snakes.length,5); assert.equal(g.pending,true);
  for(let i=0;i<3;i++) { g.snakes.forEach(s=> {s.y=R; s.drop=0;}); g.update(6); }
  assert.equal(g.pending,true); assert.equal(g.snakes.length,5);
  g.hit({snake:g.snakes[0],index:0}); assert.equal(g.snakes.length,5); assert.equal(g.pending,false);
  g.hit({snake:g.snakes[0],index:0}); assert.equal(g.snakes.length,4);
});
test('頭下端のみでライン判定、胴体や宇宙船接触では終了しない',()=> {
  const g=game(),s=g.snakes[0]; s.path=[{x:s.x-D*3,y:SHIP_Y,s:-D*3},{x:s.x,y:R,s:0}]; g.update(.001); assert.equal(g.state,'PLAYING');
  s.y=LIMIT-R-.01; g.update(.001); assert.equal(g.state,'PLAYING'); s.y=LIMIT-R; g.update(.001); assert.equal(g.state,'GAME OVER');
  const snapshot=JSON.stringify(g); g.update(5,1); assert.equal(JSON.stringify(g),snapshot);
});
test('PAUSEで時間・移動・射撃・出現・演出を完全停止、RESUMEで再開',()=> {
  const g=game(); g.hit({snake:g.snakes[0],index:0}); g.pause(); const snapshot=JSON.stringify(g); g.update(40,1); g.moveTo(0); assert.equal(JSON.stringify(g),snapshot); g.resume(); g.update(.1,1); near(g.time,.1); near(g.effects[0].remaining,.14); assert.ok(g.ship>W/2);
});
test('左右移動・制限、自動射撃0.25秒、弾速・画面外削除、RETRYリセット',()=> {
  const g=game(); g.snakes=[]; g.update(.24); assert.equal(g.bullets.length,0); g.update(.01); assert.equal(g.bullets.length,1); const y=g.bullets[0].y; g.update(.1); near(g.bullets[0].y,y-BULLET_SPEED*.1);
  g.moveTo(-100); assert.equal(g.ship,16); g.update(1.5,1); near(g.ship,W-16); near(SHIP_SPEED*1.5,W-32);
  g.bullets=[{x:30,y:0}]; g.update(.02); assert.equal(g.bullets.length,0);
  g.score=100; g.pending=true; g.effects=[{}]; g.start(); assert.equal(g.score,0); assert.equal(g.pending,false); assert.equal(g.bullets.length,0); assert.equal(g.effects.length,0); assert.equal(g.ship,W/2); assert.equal(g.time,0);
});
test('得点発生の瞬間にBEST用コールバック、開始やRETRYで呼ばない',()=> {
  const scores=[]; const g=new Game({random:()=>0,onScore:s=>scores.push(s)}); g.start(); g.hit({snake:g.snakes[0],index:1}); g.hit({snake:g.snakes[0],index:0}); g.start(); assert.deepEqual(scores,[10,150]);
});
test('登録、全ローカル参照、HOMEはPagesサブパスを維持',()=> {
  const games=JSON.parse(fs.readFileSync('data/games.json','utf8')); assert.equal(games.filter(g=>g.id==='snake-invaders').length,1); assert.equal(games.find(g=>g.id==='snake-invaders').status,'published');
  for(const g of games) { assert.ok(fs.existsSync(g.url)); if(g.thumbnail)assert.ok(fs.existsSync(g.thumbnail)); }
  const html=fs.readFileSync('games/snake-invaders/index.html','utf8'), home=html.match(/id="home" href="([^"]+)"/)[1]; assert.equal(new URL(home,'https://example.com/08_my-arcade/games/snake-invaders/index.html').pathname,'/08_my-arcade/index.html');
});
