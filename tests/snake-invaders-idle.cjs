'use strict';
// Diagnostic, not a pass/fail balance gate: no input, no rule overrides.
// Run from the repository root: node tests/snake-invaders-idle.cjs
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const {Game,W}=vm.runInNewContext(fs.readFileSync('games/snake-invaders/model.js','utf8')+'\nSnakeInvaders;');
const duration=300, hz=120, results=[];
const seeds=[1,2,3,42,123,731,2026,65535,123456,987654,0x12345678,0x9abcdef0,0xdeadbeef,0xcafebabe,0x80000000,0xffffffff,314159265,271828182,8675309,104729];
for(const seed of seeds) {
  let state=seed;
  const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const g=new Game({random}); g.start();
  let maxSnakes=g.snakes.length;
  for(let step=0;step<duration*hz && g.state==='PLAYING';step++) {
    g.update(1/hz); // direction omitted: ship remains at its initial center.
    g.events.length=0; // Browser consumes these audio notifications each frame.
    maxSnakes=Math.max(maxSnakes,g.snakes.length);
    assert.equal(g.ship,W/2);
    assert.ok(g.snakes.length<=5);
  }
  const gameOver=g.state==='GAME OVER';
  results.push({seed,gameOver,gameOverSeconds:gameOver ? Number(g.time.toFixed(3)) : null,
    elapsedSeconds:Number(g.time.toFixed(3)),score:g.score,maxSnakes});
}
console.log(JSON.stringify({durationSeconds:duration,stepSeconds:1/hz,prng:'LCG: (1664525 * state + 1013904223) mod 2^32',results},null,2));
