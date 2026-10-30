'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { C, TYPES, matrix, cells, emptyBoard, Bag, Game, Input, Records, seeded, lineScore, levelAt, intervalAt, record } = require('../games/block-fall/model.js');
const running = (seed=10) => { const g = new Game({ random: seeded(seed) }); g.start(); g.update(3); return g; };
const piece = (type,x,y,rotation=0) => ({ type,x,y,rotation });
test('seven standard four-cell shapes, clockwise rotation, four rotations restore shape', () => {
  assert.deepEqual(TYPES,['I','O','T','L','J','S','Z']);
  assert.deepEqual(matrix('T'),[[0,1,0],[1,1,1],[0,0,0]]);
  assert.deepEqual(matrix('T',1),[[0,1,0],[0,1,1],[0,1,0]]);
  const expected={I:[[0,1],[1,1],[2,1],[3,1]],O:[[0,0],[1,0],[0,1],[1,1]],T:[[1,0],[0,1],[1,1],[2,1]],L:[[2,0],[0,1],[1,1],[2,1]],J:[[0,0],[0,1],[1,1],[2,1]],S:[[1,0],[2,0],[0,1],[1,1]],Z:[[0,0],[1,0],[1,1],[2,1]]};
  for(const type of TYPES)assert.deepEqual(cells(piece(type,0,0)),expected[type]);
  for (const type of TYPES) for (let r=0;r<4;r++) {
    assert.equal(cells(piece(type,0,0,r)).length,4); assert.deepEqual(matrix(type,r+4),matrix(type,r));
  }
});
test('1000 seeded seven-bags contain each type exactly once, deterministic across reload', () => {
  const a=new Bag(seeded(20261029)),b=new Bag(seeded(20261029));
  for(let i=0;i<1000;i++){const bag=Array.from({length:7},()=>a.take());assert.deepEqual([...bag].sort(),[...TYPES].sort());assert.deepEqual(bag,Array.from({length:7},()=>b.take()));}
  assert.notDeepEqual(Array.from({length:14},()=>new Bag(seeded(1)).take()),Array.from({length:14},()=>new Bag(seeded(2)).take()));
});
test('start spawns at top, NEXT promotes exactly once, no HOLD API', () => {
  const g=running();assert.equal(g.board.length,20);assert.equal(g.board[0].length,10);
  const next=g.next;g.hard();assert.equal(g.active.type,next);assert.ok(TYPES.includes(g.next));assert.equal(g.hold,undefined);assert.equal(g.state,'PLAYING');
});
test('left/right, walls, floor and stacked-block collisions', () => {
  const g=running();g.active=piece('O',0,5);assert.equal(g.move(-1),false);assert.ok(g.move(1));
  g.active=piece('O',8,5);assert.equal(g.move(1),false);g.board[5][7]='T';assert.equal(g.move(-1),false);
  g.active=piece('O',5,18);assert.equal(g.down(),false);assert.equal(g.fits(piece('O',5,19)),false);assert.equal(g.fits(piece('O',5,-5)),false);
});
test('clockwise turns for all types in open space, O position stable', () => {
  for(const type of TYPES){const g=running();g.active=piece(type,3,5);for(let r=1;r<=4;r++){assert.ok(g.rotate());assert.equal(g.active.rotation,r%4);assert.equal(g.active.x,3);assert.equal(g.active.y,5);}}
});
test('SRS left/right wall kicks, floor kick and I-specific two-cell correction', () => {
  const g=running();g.active=piece('T',-1,5,1);assert.ok(g.fits(g.active));assert.ok(g.rotate());assert.equal(g.active.x,0);
  g.active=piece('T',8,5,3);assert.ok(g.rotate());assert.equal(g.active.x,7);
  g.active=piece('T',3,18);assert.ok(g.rotate());assert.equal(g.active.y,17);
  g.active=piece('I',-2,5,1);assert.ok(g.fits(g.active));assert.ok(g.rotate());assert.equal(g.active.x,0);
  g.active=piece('I',3,18);assert.ok(g.rotate());assert.equal(g.active.y,16);
});
test('fully obstructed rotation fails without changing piece or lock timer', () => {
  const g=running();g.active=piece('T',3,6);g.board=Array.from({length:20},()=>Array(10).fill('J'));
  for(const [x,y] of cells(g.active))g.board[y][x]=null;
  const before={...g.active};g.lockTime=.4;assert.equal(g.rotate(),false);assert.deepEqual(g.active,before);assert.equal(g.lockTime,.4);
});
test('soft drop moves one cell for one point and accelerates held fall, gravity is free', () => {
  const a=running(),b=running();a.active=piece('O',4,0);b.active=piece('O',4,0);
  assert.ok(a.down(true));assert.equal(a.score,1);a.update(.35,true);b.update(.35);
  assert.equal(a.active.y,11);assert.equal(a.score,11);assert.equal(b.active.y,0);assert.equal(b.score,0);b.update(.45);assert.equal(b.active.y,1);
});
test('switching to soft drop discards accumulated normal-gravity time', () => {
  const g=running();g.active=piece('O',4,0);g.update(.7);assert.equal(g.active.y,0);g.down(true);g.update(.034,true);assert.equal(g.active.y,1);g.update(.001,true);assert.equal(g.active.y,2);assert.equal(g.score,2);g.update(.1,false);assert.equal(g.active.y,2);
});
test('hard drop uses ghost landing, two points/cell, immediate lock then spawn', () => {
  const g=running();g.active=piece('O',4,0);const next=g.next;assert.equal(g.ghost().y,18);g.hard();
  assert.equal(g.score,36);assert.equal(g.board[19][4],'O');assert.equal(g.board[18][5],'O');assert.equal(g.active.type,next);assert.equal(g.lockTime,0);
});
for(const lines of [1,2,3,4])test(`${lines}-line simultaneous clear, collapse, level-multiplied score`, () => {
  const g=running();g.active=piece('I',2,16,1);g.level=3;g.lines=20;
  for(let y=20-lines;y<20;y++){g.board[y]=Array(10).fill('J');g.board[y][4]=null;}
  g.board[15][0]='T';g.lock();assert.equal(g.lines,20+lines);assert.equal(g.score,[0,100,300,500,800][lines]*3);
  assert.equal(g.board[15+lines][0],'T');assert.equal(g.board.length,20);assert.ok(g.board.slice(0,lines).every(r=>r.every(v=>v===null)));
});
test('every ten lines increases level; gravity accelerates and caps at 80ms', () => {
  assert.equal(levelAt(0),1);assert.equal(levelAt(9),1);assert.equal(levelAt(10),2);assert.equal(intervalAt(1),.8);assert.equal(intervalAt(2),.68);
  for(let l=1;l<100;l++)assert.ok(intervalAt(l+1)<=intervalAt(l));assert.equal(intervalAt(100),.08);
  const g=running();g.lines=9;g.active=piece('I',2,16,1);g.board[19]=Array(10).fill('J');g.board[19][4]=null;g.lock();assert.equal(g.level,2);assert.equal(g.score,100);
  assert.equal(lineScore(4,5),4000);
});
test('ground contact waits 500ms then fixes four cells and spawns next', () => {
  const g=running();g.active=piece('O',4,18);const next=g.next;g.update(.49);assert.equal(g.board.flat().filter(Boolean).length,0);g.update(.01);
  assert.equal(g.board.flat().filter(Boolean).length,4);assert.equal(g.active.type,next);assert.equal(g.resets,0);
});
test('grounded movement resets lock at most 15 times, failed moves do not reset', () => {
  const g=running();g.active=piece('O',4,18);
  for(let n=0;n<15;n++){g.update(.1);g.move(n%2?-1:1);assert.equal(g.lockTime,0);}
  assert.equal(g.resets,15);g.update(.3);g.move(-1);assert.ok(g.lockTime>.29);g.update(.2);assert.equal(g.board.flat().filter(Boolean).length,4);
  g.active=piece('O',0,18);g.lockTime=.3;assert.equal(g.move(-1),false);assert.equal(g.lockTime,.3);
});
test('spawn obstruction and locking above ceiling cause GAME OVER and freeze actions', () => {
  for(const kind of ['spawn','ceiling']){
    const g=running();if(kind==='spawn'){g.board[0].fill('J');g.spawn();}else{g.active=piece('T',3,-1);g.lock();}
    assert.equal(g.state,'GAME OVER');const before=JSON.stringify(g.board),score=g.score;
    assert.equal(g.hard(),false);assert.equal(g.rotate(),false);assert.equal(g.move(1),false);g.update(10,true);assert.equal(JSON.stringify(g.board),before);assert.equal(g.score,score);
  }
});
test('START/COUNTDOWN/PAUSED reject all actions; start/resume countdown lasts three seconds', () => {
  const g=new Game();assert.equal(g.state,'START');g.start();const p={...g.active};
  g.move(1);g.rotate();g.down(true);g.hard();assert.deepEqual(g.active,p);assert.equal(g.score,0);
  g.update(1);assert.equal(g.count,2);g.update(1);assert.equal(g.count,1);g.pause();const before=JSON.stringify(g);g.update(100);assert.equal(JSON.stringify(g),before);
  assert.ok(g.resume());assert.equal(g.count,3);g.update(2.999);assert.equal(g.state,'COUNTDOWN');g.update(.001);assert.equal(g.state,'PLAYING');assert.deepEqual(g.active,p);
});
test('pause freezes falling/lock progress, resume preserves board and retries reset all', () => {
  const g=running();g.active=piece('O',4,18);g.update(.2);g.pause();const before=JSON.stringify(g);g.update(10,true);assert.equal(JSON.stringify(g),before);
  assert.equal(g.move(1),false);assert.equal(g.down(),false);g.resume();g.update(3);g.update(.3);assert.equal(g.board.flat().filter(Boolean).length,4);
  g.start();assert.equal(g.score+g.lines+g.lockTime+g.fallTime+g.resets,0);assert.equal(g.level,1);assert.equal(g.board.flat().filter(Boolean).length,0);
});
test('held input: immediate press, 170ms delay, 50ms repeat, last direction wins', () => {
  const i=new Input();assert.ok(i.press('kleft','left'));assert.equal(i.press('kleft','left'),false);assert.deepEqual(i.update(.169),[]);assert.deepEqual(i.update(.001),['left']);assert.deepEqual(i.update(.15),['left','left','left']);
  i.press('pright','right');assert.deepEqual(i.update(.17),['right']);i.release('pright');assert.deepEqual(i.update(.17),['left']);i.release('kleft');assert.deepEqual(i.update(10),[]);
});
test('multitouch/keyboard sources, soft release, cancel/clear discard all repeats', () => {
  const i=new Input();i.press('p1','left');i.press('p2','soft');assert.ok(i.has('left')&&i.has('soft'));i.press('k','soft');i.release('p2');assert.ok(i.has('soft'));i.release('k');assert.equal(i.has('soft'),false);i.clear();assert.equal(i.has('left'),false);assert.deepEqual(i.update(100),[]);
});
test('BEST and sound persist under exclusive keys; old saves never changed', () => {
  const entries=new Map([['my-arcade:cycle-runner:best','99']]);const storage={getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v)};
  const r=new Records(storage);assert.equal(r.best,0);r.update(300);r.update(100);r.toggle();const loaded=new Records(storage);assert.equal(loaded.best,300);assert.equal(loaded.sound,false);assert.equal(entries.get('my-arcade:cycle-runner:best'),'99');assert.equal(entries.size,3);
});
test('unavailable/corrupt storage never stops play; in-page record retained', () => {
  for(const value of [null,'bad','Infinity','-1','1.2',Number.MAX_SAFE_INTEGER+1])assert.equal(record(value),0);
  const r=new Records({getItem(){throw Error();},setItem(){throw Error();}});r.update(120);r.toggle();assert.equal(r.best,120);assert.equal(r.sound,false);
});
test('100 seeds × up to 100 placements preserve board dimensions, legal cells and finite score', () => {
  for(let seed=1;seed<=100;seed++){const g=running(seed),r=seeded(seed+200);for(let n=0;n<100&&g.state==='PLAYING';n++){
    for(let j=0;j<r()*5;j++)g.rotate();for(let j=0;j<r()*10;j++)g.move(r()<.5?-1:1);g.hard();assert.equal(g.board.length,20);assert.ok(g.board.every(row=>row.length===10));assert.ok(g.board.flat().every(v=>!v||TYPES.includes(v)));assert.ok(Number.isFinite(g.score));
  }}
});
test('tenth catalog entry uses local assets, existing nine registration positions retained', () => {
  const catalog=JSON.parse(fs.readFileSync('data/games.json'));assert.equal(catalog.length,10);assert.equal(catalog[9].id,'block-fall');
  assert.deepEqual(catalog.slice(0,9).map(g=>g.id),['stack-tower','block-breaker','number-merge','bubble-shooter','snake-invaders','lights-out','alien-invaders','flashlight-maze','cycle-runner']);
  for(const entry of catalog)for(const key of ['url','thumbnail'])assert.ok(fs.existsSync(entry[key]));
  const html=fs.readFileSync('games/block-fall/index.html','utf8');assert.equal((html.match(/data-action=/g)||[]).length,5);assert.ok(!/hold/i.test(html));assert.ok(html.includes('../../index.html'));
});
