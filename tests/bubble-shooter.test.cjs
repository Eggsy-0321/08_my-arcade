'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = vm.runInNewContext(fs.readFileSync('games/bubble-shooter/model.js','utf8')+'\nBubbleShooter;');
const { Game, R, W, DY, LIMIT, position, neighbors, columns, flood, travel, snap, missLimit } = api;
const b = (row,col,color=0) => ({row,col,color});
const game = () => { const g=new Game({random:()=>0}); g.start(); return g; };
const plain = v => JSON.parse(JSON.stringify(v));
test('同色2個以下を維持、3個以上だけ探索して消去', () => {
  for (const count of [1,2,3,4]) {
    const g=game(); g.board=Array.from({length:count-1},(_,col)=>b(0,col));
    g.settle(b(0,count-1),0);
    assert.equal(g.score,count>=3 ? count*10 : 0);
    assert.equal(g.board.length,count>=3 ? 48 : count);
  }
});
test('千鳥の両向き・端・相互隣接は中心距離36、異色は探索しない', () => {
  for (const offset of [0,1]) for (let row=0;row<5;row++) for (let col=0;col<columns(row,offset);col++) {
    const cell=b(row,col), p=position(cell,offset);
    for (const n of neighbors(cell,offset)) {
      const q=position(n,offset);
      assert.ok(Math.abs(Math.hypot(p.x-q.x,p.y-q.y)-2*R)<1e-8);
      assert.ok(neighbors(n,offset).some(v=>v.row===row&&v.col===col));
    }
  }
  assert.equal(flood([b(0,0),b(0,1,1)],[b(0,0)],0,0).length,1);
});
test('天井から切り離されたバブルのみ落下、同色10点・落下20点を別計算', () => {
  const g=game(); g.board=[b(0,0),b(0,1),b(1,0,1),b(2,0,2),b(0,8,4)];
  g.misses=2; g.settle(b(0,2),0);
  assert.equal(g.score,70); assert.equal(g.misses,0); assert.equal(g.board.length,1);
  assert.equal(g.effects.filter(e=>e.falling).length,2); assert.equal(g.effects.filter(e=>!e.falling).length,3);
});
test('左右壁反射、複数反射、天井で停止', () => {
  for (const [x,vx] of [[R+1,-.8],[W-R-1,.8]]) {
    const shot={x,y:400,vx,vy:-.6}; const result=travel([],0,shot,30);
    assert.equal(result.hit,null); assert.ok(shot.x>=R&&shot.x<=W-R); assert.equal(Math.sign(shot.vx),-Math.sign(vx));
    assert.ok(Math.abs(shot.y-382)<1e-8);
  }
  const shot={x:180,y:518,vx:.94,vy:-Math.sqrt(1-.94**2)};
  const result=travel([],0,shot,2000); assert.ok(result.hit.ceiling); assert.ok(result.points.length>3); assert.ok(Math.abs(shot.y-R)<1e-8);
});
test('高速でも既存バブルを貫通せず最初の衝突で隣接空き格子へ吸着', () => {
  const board=[b(0,4),b(1,4)], target=position(board[1]);
  const shot={x:target.x,y:518,vx:0,vy:-1}; const {hit}=travel(board,0,shot,2000);
  assert.equal(hit.bubble,board[1]); assert.ok(Math.abs(shot.y-(target.y+2*R))<1e-8);
  const cell=snap(board,0,shot,hit); assert.ok(neighbors(hit.bubble).some(n=>n.row===cell.row&&n.col===cell.col));
  assert.ok(!board.some(n=>n.row===cell.row&&n.col===cell.col));
  assert.deepEqual(plain(snap([],0,{x:R+2,y:R},{ceiling:true})),{row:0,col:0});
});
test('照準ガイドと実弾の反射・衝突位置が一致、重複発射不可', () => {
  for (const angle of [-70,-45,0,45,70]) {
    const g=game(); g.angle=angle; const guide=g.guide(), shot=g.projectile();
    let hit; for(let i=0;i<500&&!hit;i++) hit=travel(g.board,g.offset,shot,4).hit;
    assert.ok(hit); assert.ok(Math.hypot(guide.at(-1).x-shot.x,guide.at(-1).y-shot.y)<1e-6);
    assert.equal(g.shoot(),true); const first=g.shot; assert.equal(g.shoot(),false); assert.equal(g.shot,first);
  }
});
test('成功時ミス0、スコア境界0/499/500/1499/1500で3/2/1回の段追加', () => {
  for (const [score,limit] of [[0,3],[499,3],[500,2],[1499,2],[1500,1]]) {
    assert.equal(missLimit(score),limit);
    const g=game(); g.score=score; g.board=[b(0,0,1)];
    for(let i=0;i<limit;i++) {
      g.settle(b(0,3+i),i+2); g.finishResolution();
      assert.equal(g.misses,i===limit-1 ? 0 : i+1);
      assert.equal(g.offset,i===limit-1 ? 1 : 0);
    }
  }
  const g=game(); g.score=480; g.misses=2; g.board=[b(0,0),b(0,1),b(0,8,1)]; g.settle(b(0,2),0);
  assert.equal(g.score,510); assert.equal(missLimit(g.score),2); assert.equal(g.misses,0);
});
test('段追加を繰り返しても既存x位置と隣接関係を保持、重複なし', () => {
  const g=game();
  for(let n=0;n<8;n++) {
    const before=g.board.map(cell=>({cell,p:position(cell,g.offset),adj:neighbors(cell,g.offset).map(v=>`${v.row+1},${v.col}`)}));
    g.addRow();
    for (const {cell,p,adj} of before) {
      const q=position(cell,g.offset); assert.equal(q.x,p.x); assert.ok(Math.abs(q.y-p.y-DY)<1e-8);
      for(const neighbor of adj) assert.ok(neighbors(cell,g.offset).some(v=>`${v.row},${v.col}`===neighbor));
    }
    assert.equal(new Set(g.board.map(v=>`${v.row},${v.col}`)).size,g.board.length);
    assert.ok(g.board.every(v=>position(v,g.offset).x>=R&&position(v,g.offset).x<=W-R));
  }
});
test('存在する色だけ生成、消滅色の現在弾とNEXTを更新、全消去後5段で続行', () => {
  const g=game(); g.board=[b(0,0,4)]; g.current=0; g.next=1; g.refreshAmmo(); assert.equal(g.current,4); assert.equal(g.next,4);
  g.board=[b(0,0),b(0,1)]; g.score=100; g.settle(b(0,2),0); g.finishResolution();
  assert.equal(g.score,130); assert.equal(g.board.length,48); assert.equal(g.state,'PLAYING');
  assert.equal(new Set(g.board.map(v=>v.row)).size,5);
});
test('吸着後・段追加後に下限到達、消去落下後の盤面で判定、終了後操作無効', () => {
  const g=game(); const row=Math.ceil((LIMIT-2*R)/DY);
  g.board=[b(row-1,0,1)]; g.settle(b(row,0,2),2); g.finishResolution(); assert.equal(g.state,'GAME OVER');
  const angle=g.angle; g.aim(10); assert.equal(g.angle,angle); assert.equal(g.shoot(),false);
  g.start(); g.board=[b(row-1,0,1)]; g.misses=2; g.settle(b(0,5,2),2); g.finishResolution(); assert.equal(g.state,'GAME OVER');
  g.start(); g.board=[b(row,0),b(row,1),b(0,8,1)]; g.settle(b(row,2),0); g.finishResolution(); assert.equal(g.state,'PLAYING');
});
test('RETRYでスコア・ミス・弾・演出・角度を初期化、可動範囲±70度', () => {
  const g=game(); g.aim(-999); assert.equal(g.angle,-70); g.aim(999); assert.equal(g.angle,70);
  g.score=900; g.misses=2; g.shoot(); g.effects=[{}]; g.start();
  assert.equal(g.score,0); assert.equal(g.misses,0); assert.equal(g.angle,0); assert.equal(g.shot,null); assert.equal(g.effects.length,0);
  assert.equal(g.board.length,48); assert.equal(g.offset,0); assert.equal(g.state,'PLAYING');
});
test('登録・ローカル参照・HOMEのPagesサブパス帰還', () => {
  const games=JSON.parse(fs.readFileSync('data/games.json','utf8')); const entry=games.find(v=>v.id==='bubble-shooter');
  assert.equal(entry.status,'published'); assert.equal(games.filter(v=>v.id==='bubble-shooter').length,1);
  for(const v of games) { assert.ok(fs.existsSync(v.url)); if(v.thumbnail) assert.ok(fs.existsSync(v.thumbnail)); }
  const html=fs.readFileSync('games/bubble-shooter/index.html','utf8');
  const href=html.match(/id="home" href="([^"]+)"/)[1];
  assert.equal(new URL(href,'https://example.com/08_my-arcade/games/bubble-shooter/index.html').pathname,'/08_my-arcade/index.html');
  assert.ok(html.indexOf('id="retry"')<html.indexOf('id="home"'));
});
test('再現可能なランダム連続発射で重複・重なり・格子逸脱・浮遊の残留なし', () => {
  let seed=731; const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let run=0;run<20;run++) {
    const g=new Game({random});g.start();
    for(let shot=0;shot<60&&g.state==='PLAYING';shot++) {
      g.angle=random()*140-70;g.shoot();
      let steps=0;while((g.shot||g.state==='RESOLVING')&&steps++<500)g.update(.05);
      assert.ok(steps<500);assert.equal(new Set(g.board.map(v=>`${v.row},${v.col}`)).size,g.board.length);
      assert.equal(flood(g.board,g.board.filter(v=>v.row===0),g.offset).length,g.board.length);
      g.board.forEach(v=>{assert.ok(v.col>=0&&v.col<columns(v.row,g.offset));});
      for(let i=0;i<g.board.length;i++) for(let j=i+1;j<g.board.length;j++) {
        const a=position(g.board[i],g.offset),b=position(g.board[j],g.offset);
        assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=2*R-1e-7);
      }
    }
  }
});
