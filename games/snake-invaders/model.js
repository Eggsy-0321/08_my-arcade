'use strict';
const SnakeInvaders = (() => {
  const W=360, H=640, R=12, D=R*2, LIMIT=H*.65, SHIP_Y=H*.9, SHIP_R=16;
  const BASE_SPEED=(W-D)/3, BULLET_SPEED=H/.8, SHIP_SPEED=(W-2*SHIP_R)/1.5;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function difficulty(time) { const stage=Math.min(4,Math.floor(time/30)); return {interval:6-stage,speed:BASE_SPEED*(1+stage*.125)}; }
  function createSnake(random=Math.random) {
    const direction=random()<.5 ? 1 : -1, x=direction===1 ? R : W-R;
    const body=3+Math.floor(random()*6);
    return {x,y:R,direction,drop:0,body,distance:0,path:[{x:x-direction*D*body,y:R,s:-D*body},{x,y:R,s:0}]};
  }
  function positions(snake) {
    const result=[{x:snake.x,y:snake.y}];
    let cursor=snake.path.length-1;
    for(let i=1;i<=snake.body;i++) {
      const s=snake.distance-i*D;
      while(cursor>0 && snake.path[cursor].s>s) cursor--;
      const a=snake.path[cursor], b=snake.path[cursor+1] || a;
      const t=b.s===a.s ? 0 : clamp((s-a.s)/(b.s-a.s),0,1);
      result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
    }
    return result;
  }
  function moveSnake(snake,distance) {
    while(distance>1e-9) {
      const vertical=snake.drop>1e-9;
      const available=vertical ? snake.drop : (snake.direction===1 ? W-R-snake.x : snake.x-R);
      const step=Math.min(distance,available);
      if(vertical) { snake.y+=step; snake.drop-=step; } else snake.x+=snake.direction*step;
      snake.distance+=step; distance-=step;
      const point={x:snake.x,y:snake.y,s:snake.distance};
      const path=snake.path, a=path.at(-2), b=path.at(-1);
      if(a && ((a.x===b.x && b.x===point.x)||(a.y===b.y && b.y===point.y))) path[path.length-1]=point;
      else path.push(point);
      if(!vertical && available-step<1e-9) { snake.direction*=-1; snake.drop=2*D; }
      while(path.length>2 && path[1].s<snake.distance-(snake.body+1)*D) path.shift();
    }
  }
  // Swept upward bullet (radius 2) against segment circles. Smallest travel wins.
  function firstHit(snakes,bullet,endY) {
    let hit=null;
    for(const snake of snakes) positions(snake).forEach((p,index)=> {
      const dx=bullet.x-p.x, radius=R+2;
      if(Math.abs(dx)>radius) return;
      const half=Math.sqrt(radius*radius-dx*dx), bottom=p.y+half, top=p.y-half;
      if(bullet.y<top || endY>bottom) return;
      const distance=Math.max(0,bullet.y-bottom);
      if(!hit || distance<hit.distance-1e-9 || (Math.abs(distance-hit.distance)<1e-9 && index===0 && hit.index!==0)) hit={snake,index,distance};
    });
    return hit;
  }
  class Game {
    constructor({random=Math.random,onScore=()=>{}}={}) { this.random=random; this.onScore=onScore; this.state='START'; this.score=0; this.snakes=[]; this.bullets=[]; this.effects=[]; this.ship=W/2; this.time=0; this.events=[]; }
    start() { this.state='PLAYING'; this.score=0; this.time=0; this.spawnClock=0; this.pending=false; this.fireClock=0; this.ship=W/2; this.snakes=[createSnake(this.random)]; this.bullets=[]; this.effects=[]; this.events=[]; }
    moveTo(x) { if(this.state==='PLAYING') this.ship=clamp(x,SHIP_R,W-SHIP_R); }
    pause() { if(this.state==='PLAYING') this.state='PAUSED'; }
    resume() { if(this.state==='PAUSED') this.state='PLAYING'; }
    hit({snake,index}) {
      if(index===0) { this.score+=100+20*snake.body; this.effects.push({points:positions(snake),remaining:.24}); this.snakes.splice(this.snakes.indexOf(snake),1); this.events.push('head'); }
      else { snake.body--; this.score+=10; this.events.push('body'); }
      this.onScore(this.score);
      this.spawnPending();
    }
    spawnPending() { if(this.pending && this.snakes.length<5) { this.snakes.push(createSnake(this.random)); this.pending=false; } }
    update(dt,direction=0) {
      if(this.state!=='PLAYING') return;
      for(let remaining=dt;remaining>1e-9 && this.state==='PLAYING';) { const step=Math.min(remaining,1/120); remaining-=step; this.step(step,direction); }
    }
    step(dt,direction) {
      this.time+=dt; const level=difficulty(this.time);
      this.moveTo(this.ship+clamp(direction,-1,1)*SHIP_SPEED*dt);
      this.effects.forEach(e=>e.remaining-=dt); this.effects=this.effects.filter(e=>e.remaining>0);
      this.spawnClock+=dt;
      if(this.spawnClock+1e-9>=level.interval) { this.spawnClock-=level.interval; this.pending=true; }
      this.spawnPending();
      this.snakes.forEach(s=>moveSnake(s,level.speed*dt));
      if(this.snakes.some(s=>s.y+R>=LIMIT)) { this.state='GAME OVER'; return; }
      this.fireClock+=dt;
      if(this.fireClock+1e-9>=.5) { this.fireClock-=.5; this.bullets.push({x:this.ship,y:SHIP_Y-18}); this.events.push('shoot'); }
      this.bullets=this.bullets.filter(b=> {
        const end=b.y-BULLET_SPEED*dt, hit=firstHit(this.snakes,b,end);
        if(hit) { this.hit(hit); return false; }
        b.y=end; return b.y>=-6;
      });
    }
  }
  return {Game,W,H,R,D,LIMIT,SHIP_Y,SHIP_R,SHIP_SPEED,BASE_SPEED,BULLET_SPEED,difficulty,createSnake,positions,moveSnake,firstHit};
})();
