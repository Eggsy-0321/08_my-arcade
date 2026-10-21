'use strict';
(() => {
  const {Game,W,H,R,LIMIT,SHIP_Y,positions}=SnakeInvaders;
  const $=id=>document.getElementById(id), canvas=$('game'), ctx=canvas.getContext('2d');
  const key='my-arcade:snake-invaders:best';
  let best=0, sound=false, audio=null, last=null, previous='', pointer=null;
  const keys=new Set();
  try { const n=Number(localStorage.getItem(key)); if(Number.isFinite(n)&&n>=0) best=Math.floor(n); } catch { /* Session best is still available. */ }
  const game=new Game({onScore(score) {
    if(score>best) { best=score; try { localStorage.setItem(key,String(best)); } catch { /* Keep session best. */ } }
  }});
  function soundContext() {
    if(!audio) { const Audio=window.AudioContext || window.webkitAudioContext; if(Audio) audio=new Audio(); }
    return audio;
  }
  function tone(type) {
    if(!sound || !audio || audio.state!=='running') return;
    const oscillator=audio.createOscillator(), gain=audio.createGain(), now=audio.currentTime;
    const [from,to,duration]=type==='shoot' ? [650,320,.035] : type==='body' ? [180,80,.07] : [880,110,.18];
    oscillator.type='square'; oscillator.frequency.setValueAtTime(from,now); oscillator.frequency.exponentialRampToValueAtTime(to,now+duration);
    gain.gain.setValueAtTime(.025,now); gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now+duration);
  }
  const head=['011110','111111','101101','111111','011110','001100'];
  const body=['011110','111111','110111','111011','111111','011110'];
  const ship=['0001000','0011100','0011100','0111110','1111111','1101011','1000001'];
  function sprite(pattern,x,y,color,size) {
    ctx.fillStyle=color; const scale=size/pattern.length;
    pattern.forEach((row,j)=>[...row].forEach((pixel,i)=> { if(pixel==='1') ctx.fillRect(Math.round(x-size/2+i*scale),Math.round(y-size/2+j*scale),Math.ceil(scale),Math.ceil(scale)); }));
  }
  function snake(points,alpha=1) {
    ctx.save(); ctx.globalAlpha=alpha;
    points.slice().reverse().forEach((p,i)=>sprite(i===points.length-1 ? head : body,p.x,p.y,i===points.length-1 ? '#f9da59' : '#6be47d',R*2)); ctx.restore();
  }
  function draw() {
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#ef4d5e'; ctx.lineWidth=2; ctx.setLineDash([7,6]); ctx.beginPath(); ctx.moveTo(0,LIMIT); ctx.lineTo(W,LIMIT); ctx.stroke(); ctx.setLineDash([]);
    game.snakes.forEach(s=>snake(positions(s)));
    game.effects.forEach(e=> { if(Math.floor(e.remaining/.04)%2===0) snake(e.points,.7); });
    ctx.fillStyle='#b3eaff'; game.bullets.forEach(b=>ctx.fillRect(b.x-2,b.y-4,4,8));
    sprite(ship,game.ship,SHIP_Y,'#51acff',32);
  }
  function sync() {
    const state=game.state, start=state==='START', paused=state==='PAUSED', ended=state==='GAME OVER';
    $('score').textContent=String(game.score); $('best').textContent=$('result-best').textContent=String(best);
    $('overlay').hidden=state==='PLAYING'; $('overlay').classList.toggle('paused',paused);
    $('start').hidden=$('sound').hidden=$('hint').hidden=!start; $('resume').hidden=!paused; $('result-actions').hidden=!ended; $('result-score').hidden=!ended;
    $('pause').disabled=state!=='PLAYING'; $('sound').textContent=`SOUND ${sound ? 'ON' : 'OFF'}`; $('sound').setAttribute('aria-pressed',String(sound));
    $('screen-title').innerHTML=start ? 'SNAKE<br>INVADERS' : paused ? 'PAUSED' : 'GAME OVER';
    $('message').hidden=!start; $('result-score').textContent=`SCORE ${game.score}`;
    if(state!==previous) {
      if(paused || ended) { keys.clear(); pointer=null; $(paused ? 'resume' : 'retry').focus({preventScroll:true}); }
      if(ended) $('status').textContent=`GAME OVER。スコア ${game.score}。BEST ${best}。`;
      previous=state;
    }
  }
  function start(retry=false) {
    if(retry) { sound=false; if(audio) void audio.suspend().catch(()=>{}); }
    else if(sound) { const context=soundContext(); if(context) void context.resume().catch(()=>{}); }
    keys.clear(); pointer=null; last=null; game.start(); sync(); draw(); canvas.focus({preventScroll:true});
  }
  function pause() {
    game.pause(); keys.clear(); pointer=null; last=null;
    if(audio) void audio.suspend().catch(()=>{});
    sync();
  }
  $('start').addEventListener('click',()=>start()); $('retry').addEventListener('click',()=>start(true));
  $('pause').addEventListener('click',pause);
  $('resume').addEventListener('click',()=> { game.resume(); last=null; if(sound&&audio) void audio.resume().catch(()=>{}); sync(); canvas.focus({preventScroll:true}); });
  $('sound').addEventListener('click',()=> { if(game.state!=='START') return; sound=!sound; if(sound) { const context=soundContext(); if(context) void context.resume().catch(()=>{}); } else if(audio) void audio.suspend().catch(()=>{}); sync(); });
  canvas.tabIndex=0;
  canvas.addEventListener('pointerdown',e=> { if(game.state!=='PLAYING'||pointer!==null||e.button!==0) return; e.preventDefault(); pointer=e.pointerId; canvas.setPointerCapture(pointer); move(e); });
  function move(e) { if(e.pointerId!==pointer) return; e.preventDefault(); const box=canvas.getBoundingClientRect(); game.moveTo((e.clientX-box.left)*W/box.width); draw(); }
  canvas.addEventListener('pointermove',move);
  for(const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,e=> { if(e.pointerId===pointer) pointer=null; });
  document.addEventListener('keydown',e=> { if(game.state!=='PLAYING'||e.altKey||e.ctrlKey||e.metaKey||!['ArrowLeft','ArrowRight'].includes(e.code)) return; e.preventDefault(); keys.add(e.code); });
  document.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',pause); window.addEventListener('pagehide',pause);
  document.addEventListener('visibilitychange',()=> { if(document.hidden) pause(); });
  function frame(now) {
    const dt=last===null ? 0 : Math.min(.05,Math.max(0,(now-last)/1000)); last=now;
    game.update(dt,Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')));
    game.events.splice(0).forEach(tone); sync(); draw(); requestAnimationFrame(frame);
  }
  function resize() { const dpr=Math.min(devicePixelRatio||1,3); canvas.width=W*dpr; canvas.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.imageSmoothingEnabled=false; draw(); }
  window.addEventListener('resize',resize); sync(); resize(); requestAnimationFrame(frame);
})();
