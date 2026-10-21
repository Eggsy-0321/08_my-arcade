'use strict';
(() => {
  const { Game, W, H, R, LIMIT, LAUNCH, position, missLimit } = BubbleShooter;
  const $ = id => document.getElementById(id), canvas = $('game'), ctx = canvas.getContext('2d');
  const game = new Game(), storageKey = 'my-arcade:bubble-shooter:best';
  const palette = ['#ff719e','#65eaff','#ffcf65','#90ed97','#bb95ff'];
  let best = 0, frameId = null, last = null, previousState = '', savedScore = 0;
  const held = new Map(), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  try { const value = Number(localStorage.getItem(storageKey)); if (Number.isFinite(value) && value >= 0) best = Math.floor(value); } catch { /* Session best works without storage. */ }
  function bubble(x,y,color,alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = palette[color];
    ctx.beginPath(); ctx.arc(x,y,R-2,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#ffffff90'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffffff80'; ctx.beginPath(); ctx.arc(x-5,y-6,4,0,Math.PI*2); ctx.fill();
    // A small number supplements color for players who have difficulty distinguishing it.
    ctx.fillStyle = '#091022'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillText(String(color+1),x,y+5); ctx.restore();
  }
  function draw() {
    ctx.clearRect(0,0,W,H); ctx.fillStyle = '#090f23'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = '#18253e'; ctx.lineWidth = 1;
    for (let y=24;y<H;y+=24) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
    ctx.setLineDash([6,5]); ctx.strokeStyle = '#ff719e90'; ctx.beginPath(); ctx.moveTo(0,LIMIT); ctx.lineTo(W,LIMIT); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#c67b98'; ctx.font = '9px monospace'; ctx.textAlign = 'left'; ctx.fillText('DANGER LINE',8,LIMIT-7);
    if (game.state !== 'START' && game.state !== 'GAME OVER') {
      const points = game.guide(); ctx.strokeStyle = '#b6edff70'; ctx.setLineDash([3,8]); ctx.lineWidth = 2; ctx.beginPath();
      const rad = game.angle*Math.PI/180;
      // Trim only the drawing to the visible bubble edge; keep the center-based trajectory.
      ctx.moveTo(points[0].x+Math.sin(rad)*(R-2),points[0].y-Math.cos(rad)*(R-2));
      points.slice(1).forEach(p => ctx.lineTo(p.x,p.y)); ctx.stroke(); ctx.setLineDash([]);
    }
    game.board.forEach(b => { const p=position(b,game.offset); bubble(p.x,p.y,b.color); });
    if (!reduced.matches) game.effects.forEach(b => {
      const t=1-game.remaining/.32;
      bubble(b.x,b.y+(b.falling ? t*t*140 : 0),b.color,Math.max(0,1-t));
    });
    bubble(W/2,LAUNCH,game.current);
    ctx.fillStyle = '#98a9c7'; ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.fillText('NEXT',65,LAUNCH-27); bubble(65,LAUNCH,game.next);
    if (game.shot) bubble(game.shot.x,game.shot.y,game.shot.color);
  }
  function sync() {
    if (game.score > best) {
      best = game.score;
      if (savedScore !== best) { try { localStorage.setItem(storageKey,String(best)); } catch { /* Keep session best. */ } savedScore = best; }
    }
    $('score').textContent = String(game.score); $('best').textContent = $('result-best').textContent = String(best);
    $('misses').textContent = `MISS ${game.misses} / ${missLimit(game.score)}`;
    const ended = game.state === 'GAME OVER';
    $('overlay').hidden = game.state !== 'START' && !ended;
    $('start').hidden = game.state !== 'START'; $('result-actions').hidden = !ended; $('hint').hidden = ended;
    $('left').disabled = $('right').disabled = game.state !== 'PLAYING';
    $('shoot').disabled = game.state !== 'PLAYING' || !!game.shot;
    if (ended) { $('screen-title').textContent = 'GAME OVER'; $('message').textContent = `FINAL SCORE ${game.score}`; }
    if (game.state !== previousState) {
      if (ended) { held.clear(); $('status').textContent = `GAME OVER。スコア ${game.score}。BEST ${best}。`; $('retry').focus({preventScroll:true}); }
      previousState = game.state;
    }
  }
  function frame(now) {
    frameId = null;
    if (document.hidden) { last = null; return; }
    const dt = last === null ? 0 : Math.min(.05,Math.max(0,(now-last)/1000)); last=now;
    for (const [source,input] of held) {
      input.time += dt;
      if (input.time >= .25) { game.aim(input.direction*95*dt); }
      if (game.state !== 'PLAYING') held.delete(source);
    }
    game.update(dt); sync(); draw();
    if (game.state === 'PLAYING' || game.state === 'RESOLVING') wake(); else last = null;
  }
  function wake() { if (frameId === null && !document.hidden) frameId = requestAnimationFrame(frame); }
  function start() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId=null; last=null; held.clear(); game.start(); sync(); draw(); wake(); $('shoot').focus({preventScroll:true});
  }
  function hold(source,direction) {
    if (game.state !== 'PLAYING' || held.has(source)) return;
    held.set(source,{direction,time:0}); game.aim(direction*3); draw(); wake();
  }
  for (const [id,direction] of [['left',-1],['right',1]]) {
    const button=$(id);
    button.addEventListener('pointerdown',e => {
      if (e.button !== 0) return; e.preventDefault(); button.setPointerCapture(e.pointerId); hold(`p${e.pointerId}`,direction);
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type,e => held.delete(`p${e.pointerId}`));
    // Keyboard and assistive-technology activation generates a click with detail 0.
    button.addEventListener('click',e => { if (e.detail === 0) { game.aim(direction*3); draw(); } });
    button.addEventListener('contextmenu',e => e.preventDefault());
  }
  $('shoot').addEventListener('click',() => { if (game.shoot()) { sync(); wake(); } });
  $('start').addEventListener('click',start); $('retry').addEventListener('click',start);
  document.addEventListener('keydown',e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input,textarea,select')) return;
    if (!['ArrowLeft','ArrowRight','Space'].includes(e.code) || game.state !== 'PLAYING') return;
    e.preventDefault();
    if (e.code === 'Space') { if (!e.repeat) { game.shoot(); sync(); wake(); } }
    else hold(e.code,e.code === 'ArrowLeft' ? -1 : 1);
  });
  document.addEventListener('keyup',e => held.delete(e.code));
  window.addEventListener('blur',() => { held.clear(); last=null; });
  document.addEventListener('visibilitychange',() => {
    held.clear(); last=null;
    if (document.hidden && frameId !== null) { cancelAnimationFrame(frameId); frameId=null; }
    else if (game.state === 'PLAYING' || game.state === 'RESOLVING') wake();
  });
  window.addEventListener('pagehide',() => { held.clear(); if (frameId !== null) cancelAnimationFrame(frameId); frameId=null; last=null; });
  window.addEventListener('pageshow',() => { if (game.state === 'PLAYING' || game.state === 'RESOLVING') wake(); });
  function resize() {
    const dpr=Math.min(devicePixelRatio || 1,3); canvas.width=W*dpr; canvas.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); draw();
  }
  window.addEventListener('resize',resize); sync(); resize();
})();
