'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { C, Game, seeded, group, speedAt, record } = require('../games/cycle-runner/model.js');
function running(seed=1) { const g=new Game({random:seeded(seed)});g.start();g.update(C.countdown);return g; }
test('title and full 3→2→1→GO countdown freeze all simulation',()=>{const g=new Game();g.update(20);assert.equal(g.state,'TITLE');g.start();const course=JSON.stringify(g.groups);for(const n of [3,2,1]){assert.equal(Math.ceil(g.count-.35),n);g.update(1);assert.equal(g.distance,0);assert.equal(g.elapsed,0);assert.equal(JSON.stringify(g.groups),course);assert.equal(g.jump(),false);}assert.ok(g.count<=.35+1e-9);g.update(.35);assert.equal(g.state,'RUNNING');assert.equal(g.distance,0);});
test('maximum two equal-strength jumps, landing restores both',()=>{const g=running();assert.ok(g.jump());assert.equal(g.vy,C.jump);g.update(.15);assert.ok(g.jump());assert.equal(g.vy,C.jump);assert.equal(g.jump(),false);g.groups=[];g.next=10000;g.update(1);assert.equal(g.y,0);assert.equal(g.jumps,0);assert.ok(g.jump());});
test('ground and airborne distance/speed are identical',()=>{const a=running(),b=running();b.jump();a.update(.4);b.update(.4);assert.equal(a.distance,b.distance);assert.equal(a.speed,b.speed);});
test('obstacle collision and entering a hole end the run immediately',()=>{for(const type of ['crate','cone','hole']){const g=running();g.groups=[{end:300,hazards:[{x:20,w:100,h:30,type}]}];g.next=10000;g.update(.5);assert.equal(g.state,'GAME_OVER');assert.equal(g.reason,type==='hole'?'hole':'obstacle');const d=g.distance;g.update(5);assert.equal(g.distance,d);}});
test('acceleration follows distance and respects the cap',()=>{assert.equal(speedAt(0),110);assert.equal(speedAt(5000),130);assert.equal(speedAt(17500),180);assert.equal(speedAt(1e9),180);const g=running();g.distance=20000;g.groups=[];g.next=1e6;g.update(1);assert.equal(g.speed,180);});
test('pause/resume resets countdown and never advances gameplay',()=>{const g=running();g.jump();g.update(.2);const before=[g.distance,g.y,g.vy,g.jumps,g.elapsed];g.pause();g.update(100);assert.deepEqual([g.distance,g.y,g.vy,g.jumps,g.elapsed],before);g.resume();g.update(3);assert.equal(g.state,'COUNTDOWN');assert.deepEqual([g.distance,g.y,g.vy,g.jumps,g.elapsed],before);g.pause();g.resume();assert.equal(g.count,C.countdown);g.update(C.countdown);assert.deepEqual([g.distance,g.y,g.vy,g.jumps,g.elapsed],before);});
test('retry resets distance/speed/air/time and draws a fresh random course',()=>{const g=running();const a=JSON.stringify(g.groups);g.jump();g.update(.2);g.over('test');g.start();assert.equal(g.state,'COUNTDOWN');for(const key of ['distance','y','vy','jumps','elapsed'])assert.equal(g[key],0);assert.equal(g.speed,C.baseSpeed);assert.notEqual(JSON.stringify(g.groups),a);});
test('seeded courses reproduce and distinct seeds differ',()=>{const a=running(100),b=running(100),c=running(101);assert.deepEqual(a.groups,b.groups);assert.notDeepEqual(a.groups,c.groups);});
test('1000 seeds × normal/max speed: actual consecutive groups traversed with two timed jumps',t=>{
 let groups=0,pairs=0,holes=0,minVisible=Infinity,minRecovery=Infinity;
 for(let seed=1;seed<=1000;seed++)for(const start of [0,20000]){
  const g=running(seed);g.distance=start;g.groups=[];g.next=start+440;g.fill();let active=null,second=false,passed=0;
  while(passed<12){
   const next=g.groups.find(a=>a.end>=g.distance-16);assert.ok(next);
   if(active!==next&&next.x-g.distance<=g.speed*.26){assert.equal(g.jumps,0,`recovery seed ${seed}`);assert.ok(g.jump());active=next;second=false;}
   if(active===next&&!second&&g.vy<=0){assert.ok(g.jump());second=true;}
   const old=g.distance;g.update(1/120);assert.equal(g.state,'RUNNING',`seed=${seed}, start=${start}, distance=${g.distance}`);
   if(old<=next.end+16&&g.distance>next.end+16){passed++;groups++;pairs+=next.hazards.length>1;holes+=next.hazards[0].type==='hole';minRecovery=Math.min(minRecovery,(next.next-next.end)/C.maxSpeed);}
   minVisible=Math.min(minVisible,(C.width-C.playerX-C.halfWidth)/C.maxSpeed);
  }
 }
 assert.ok(pairs>1000&&holes>1000);assert.ok(minVisible>=1.5);assert.ok(minRecovery>=1.8);
 t.diagnostic(`${groups} groups, ${pairs} pairs, ${holes} holes; minimum visibility=${minVisible.toFixed(3)}s, recovery=${minRecovery.toFixed(3)}s; seeds 1..1000 at 0/20000px`);
});
test('bounded generation with extreme constant random values',()=>{for(const r of [0,.5,1]){const g=new Game({random:()=>r});g.start();assert.ok(g.groups.length>0&&g.groups.length<5);const a=group(20000,()=>r);assert.ok(a.next>a.end+C.maxSpeed*1.7);}});
test('best parser rejects nonfinite and negative values',()=>{for(const v of [null,'bad','Infinity',-1])assert.equal(record(v),0);assert.equal(record('123.9'),123);});
