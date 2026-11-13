'use strict';
(() => {
  const { Game, W, H, R, LIMIT, LAUNCH, position, missLimit } = BubbleShooter;
  const $ = id => document.getElementById(id), canvas = $('game'), ctx = canvas.getContext('2d');
  const game = new Game(), storageKey = 'my-arcade:bubble-shooter:best';
  const palette = ['#ff719e','#65eaff','#ffcf65','#90ed97','#bb95ff'];
  let scheduledAt = 0;
  let best = 0, frameId = null, last = null, previousState = '', savedScore = 0;
  const landscapeTouch = matchMedia('(orientation: landscape) and (pointer: coarse)');
  const keys = new Set();
  let shootPointer = null;
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
    $('pause').disabled = game.state !== 'PLAYING' && game.state !== 'RESOLVING';
    $('pause-overlay').hidden = game.state !== 'PAUSED';
    $('resume').disabled = document.hidden || landscapeTouch.matches;
    const ended = game.state === 'GAME OVER';
    $('overlay').hidden = game.state !== 'START' && !ended;
    $('start').hidden = game.state !== 'START'; $('result-actions').hidden = !ended; $('hint').hidden = ended;
    $('left').disabled = $('right').disabled = game.state !== 'PLAYING';
    $('shoot').disabled = game.state !== 'PLAYING' || !!game.shot;
    if (ended) { $('screen-title').textContent = 'GAME OVER'; $('message').textContent = `FINAL SCORE ${game.score}`; }
    if (game.state !== previousState) {
      if (ended) { clearInput(); $('status').textContent = `GAME OVER。スコア ${game.score}。BEST ${best}。`; $('retry').focus({preventScroll:true}); }
      previousState = game.state;
    }
  }
  function frame(now) {
    frameId = null;
    if (document.hidden || (now-(last ?? scheduledAt) > 1000)) { pause(); return; }
    const dt = last === null ? 0 : Math.min(.05,Math.max(0,(now-last)/1000)); last=now;
    for (const [source,input] of held) {
      input.time += dt;
      if (input.time >= .25) { game.aim(input.direction*95*dt); }
      if (game.state !== 'PLAYING') held.delete(source);
    }
    game.update(dt); sync(); draw();
    if (game.state === 'PLAYING' || game.state === 'RESOLVING') wake(); else last = null;
  }
  function wake() {
    if (frameId === null && !document.hidden) { scheduledAt = performance.now(); frameId = requestAnimationFrame(frame); }
  }
  function start() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId=null; last=null; clearInput(); game.start(); sync(); draw(); wake(); $('shoot').focus({preventScroll:true});
  }
  function hold(source,direction) {
    if (game.state !== 'PLAYING' || held.has(source)) return;
    held.set(source,{direction,time:0}); game.aim(direction*3); draw(); wake();
  }
  function clearInput() {
    // Forget inputs before releasing capture: lostpointercapture can run synchronously.
    const pointers = [...held.keys()].filter(source => source.startsWith('p'));
    held.clear(); keys.clear(); shootPointer = null;
    for (const source of pointers) for (const id of ['left','right']) {
      const button = $(id), pointerId = Number(source.slice(1));
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    }
  }
  function pause() {
    const changed = game.pause();
    clearInput();
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null; last = null; sync(); draw();
    if (changed && !document.hidden) $('resume').focus({preventScroll:true});
  }
  function resume() {
    if (document.hidden || landscapeTouch.matches || !game.resume()) return;
    clearInput(); last = null; sync(); draw(); wake(); canvas.focus({preventScroll:true});
  }
  function inputReady() {
    // Input can arrive before the first frame following a suspended browser.
    if (document.hidden || ((game.state === 'PLAYING' || game.state === 'RESOLVING') && performance.now()-(last ?? scheduledAt) > 1000)) pause();
    return game.state === 'PLAYING';
  }
  for (const [id,direction] of [['left',-1],['right',1]]) {
    const button=$(id);
    button.addEventListener('pointerdown',e => {
      if (e.button !== 0 || !inputReady()) return;
      e.preventDefault(); button.setPointerCapture(e.pointerId); hold(`p${e.pointerId}`,direction);
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type,e => held.delete(`p${e.pointerId}`));
    // Keep keyboard and assistive-technology click activation (detail 0).
    button.addEventListener('click',e => { if (e.detail === 0 && inputReady()) { game.aim(direction*3); draw(); } });
    button.addEventListener('contextmenu',e => e.preventDefault());
  }
  $('shoot').addEventListener('pointerdown',e => {
    shootPointer = e.button === 0 && inputReady() ? e.pointerId : null;
  });
  $('shoot').addEventListener('pointercancel',() => { shootPointer = null; });
  $('shoot').addEventListener('click',e => {
    const fresh = e.detail === 0 || (shootPointer !== null && e.pointerId === shootPointer);
    shootPointer = null;
    if (fresh && inputReady() && game.shoot()) { sync(); wake(); }
  });
  $('pause').addEventListener('click',pause); $('resume').addEventListener('click',resume);
  $('start').addEventListener('click',start); $('retry').addEventListener('click',start);
  document.addEventListener('keydown',e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input,textarea,select')) return;
    if (!['ArrowLeft','ArrowRight','Space','Enter'].includes(e.code)) return;
    const repeated = e.repeat || keys.has(e.code); keys.add(e.code);
    if (repeated) { e.preventDefault(); return; }
    if (e.code === 'Enter') return;
    // Let native activation operate PAUSE/RESUME/HOME without shooting.
    if (e.target.closest('#pause,#resume,a,#start,#retry')) return;
    e.preventDefault();
    if (!inputReady()) return;
    if (e.code === 'Space') { game.shoot(); sync(); wake(); }
    else hold(e.code,e.code === 'ArrowLeft' ? -1 : 1);
  });
  document.addEventListener('keyup',e => { keys.delete(e.code); held.delete(e.code); });
  window.addEventListener('blur',pause);
  document.addEventListener('visibilitychange',() => { if (document.hidden) pause(); else sync(); });
  window.addEventListener('pagehide',pause);
  window.addEventListener('pageshow',pause);
  document.addEventListener('freeze',pause);
  document.addEventListener('resume',pause);
  function orientationChanged() { pause(); sync(); }
  window.addEventListener('orientationchange',orientationChanged);
  screen.orientation?.addEventListener('change',orientationChanged);
  landscapeTouch.addEventListener('change',orientationChanged);
  function resize() {
    const dpr=Math.min(devicePixelRatio || 1,3); canvas.width=W*dpr; canvas.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); draw();
  }
  window.addEventListener('resize',resize); sync(); resize();
})();
