'use strict';
(() => {
  const { C, Game, Input, Records, cells, matrix } = BlockFall, $ = id => document.getElementById(id);
  let storage; try { storage = localStorage; } catch { /* Storage may be disabled. */ }
  const records = new Records(storage), input = new Input(), pointers = new Map();
  const board = $('board'), ctx = board.getContext('2d'), preview = $('next').getContext('2d');
  const buttons = [...document.querySelectorAll('[data-action]')];
  const colors = { I: '#76ddeb', O: '#f3cf7b', T: '#be96e3', L: '#e8a570', J: '#7ca4ed', S: '#94d6a0', Z: '#ec8c9b' };
  let audio, last = null, previousState = 'START';
  const voices = new Set();
  function unlock() {
    try { const Audio = window.AudioContext || window.webkitAudioContext;
      if (!audio && Audio) audio = new Audio();
      if (audio?.state === 'suspended') Promise.resolve(audio.resume()).catch(() => {});
    } catch { /* Audio is optional. */ }
  }
  function silence() { for (const o of voices) { try { o.stop(); } catch { /* Already ended. */ } } voices.clear(); }
  function tone(type) {
    if (!records.sound || !audio) return;
    const notes = { move: [180], rotate: [320], land: [130,100], clear: [440,660,880], over: [240,160,80] }[type];
    try { notes.forEach((f,i) => {
      const o = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime+i*.055;
      o.type = type === 'over' ? 'triangle' : 'square'; o.frequency.setValueAtTime(f,t);
      gain.gain.setValueAtTime(.025,t); gain.gain.exponentialRampToValueAtTime(.001,t+.065);
      o.connect(gain); gain.connect(audio.destination); voices.add(o);
      o.onended = () => { voices.delete(o); o.disconnect(); gain.disconnect(); }; o.start(t); o.stop(t+.075);
    }); } catch { /* Audio failure never stops play. */ }
  }
  const game = new Game({ onEvent: tone });
  function clearInput() {
    input.clear();
    for (const [id,button] of pointers) { try { if (button.hasPointerCapture(id)) button.releasePointerCapture(id); } catch { /* Pointer already released. */ } }
    pointers.clear();
  }
  function sync() {
    const playing = game.state === 'PLAYING', countdown = game.state === 'COUNTDOWN', paused = game.state === 'PAUSED', over = game.state === 'GAME OVER';
    if (previousState !== game.state) { clearInput(); previousState = game.state; }
    records.update(game.score);
    for (const [id,value] of [['score',game.score],['best',records.best],['lines',game.lines],['level',game.level]]) $(id).textContent = value;
    $('sound').textContent = 'SOUND ' + (records.sound ? 'ON' : 'OFF'); $('sound').setAttribute('aria-pressed', String(records.sound));
    $('pause').disabled = !(playing || countdown); buttons.forEach(b => { b.disabled = !playing; });
    $('overlay').hidden = playing || countdown; $('countdown').hidden = !countdown;
    $('countdown').textContent = Math.max(1, Math.ceil(game.count-1e-9));
    $('heading').textContent = over ? 'GAME OVER' : paused ? 'PAUSED' : 'BLOCK FALL';
    $('message').hidden = over; $('message').textContent = paused ? '準備ができたらRESUMEで再開しよう。' : 'つないで、消して、その先へ。\n横一列を埋めてハイスコアを目指そう。';
    $('results').hidden = !over; $('results').textContent = `SCORE  ${game.score}\nBEST  ${records.best}\nLINES  ${game.lines}`;
    $('start').hidden = game.state !== 'START'; $('resume').hidden = !paused; $('retry').hidden = !over;
    $('next').setAttribute('aria-label', game.next ? `次のブロック ${game.next}` : '次のブロック');
  }
  function begin() { unlock(); clearInput(); game.start(); last = null; sync(); draw(); }
  function pause() { clearInput(); game.pause(); silence(); last = null; sync(); draw(); }
  function resume() { unlock(); clearInput(); game.resume(); last = null; sync(); draw(); }
  function action(name) {
    if (game.state !== 'PLAYING') return;
    if (name === 'left' || name === 'right') game.move(name === 'left' ? -1 : 1);
    else if (name === 'rotate') game.rotate();
    else if (name === 'soft') game.down(true);
    else if (name === 'hard') game.hard();
    sync(); draw();
  }
  $('start').addEventListener('click', begin); $('retry').addEventListener('click', begin);
  $('pause').addEventListener('click', pause); $('resume').addEventListener('click', resume);
  $('sound').addEventListener('click', () => { unlock(); records.toggle(); if (!records.sound) silence(); sync(); });
  function releasePointer(id) {
    input.release('p'+id); const b = pointers.get(id); pointers.delete(id);
    try { if (b?.hasPointerCapture(id)) b.releasePointerCapture(id); } catch { /* Already released. */ }
  }
  for (const b of buttons) {
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); if (game.state !== 'PLAYING' || (e.pointerType === 'mouse' && e.button !== 0)) return;
      unlock(); pointers.set(e.pointerId,b); b.setPointerCapture(e.pointerId);
      if (input.press('p'+e.pointerId,b.dataset.action)) action(b.dataset.action);
    });
    b.addEventListener('lostpointercapture', e => releasePointer(e.pointerId));
    b.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      const r = b.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) releasePointer(e.pointerId);
    });
  }
  for (const event of ['pointerup','pointercancel']) window.addEventListener(event,e => releasePointer(e.pointerId));
  const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'soft', Space: 'hard' };
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') { e.preventDefault(); if (!e.repeat) game.state === 'PAUSED' ? resume() : pause(); return; }
    const name = keys[e.code]; if (!name || !['PLAYING','COUNTDOWN','PAUSED'].includes(game.state)) return;
    e.preventDefault(); if (e.repeat || game.state !== 'PLAYING') return;
    unlock(); if (input.press('k'+e.code,name)) action(name);
  });
  window.addEventListener('keyup', e => { if (keys[e.code] && ['PLAYING','COUNTDOWN','PAUSED'].includes(game.state)) e.preventDefault(); input.release('k'+e.code); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  for (const event of ['blur','pagehide','orientationchange']) window.addEventListener(event,pause);
  screen.orientation?.addEventListener('change',pause);
  let landscape = innerWidth > innerHeight;
  window.addEventListener('resize', () => { const next = innerWidth > innerHeight; if (next !== landscape) pause(); landscape = next; });
  function block(context, x, y, size, type, ghost = false) {
    context.fillStyle = ghost ? '#b8cfdf22' : colors[type]; context.fillRect(x+1,y+1,size-2,size-2);
    context.strokeStyle = ghost ? '#9bb9ca' : '#ffffff60'; context.lineWidth = ghost ? 2 : 1;
    context.strokeRect(x+2,y+2,size-4,size-4);
    if (!ghost) { context.fillStyle = '#10152425'; context.fillRect(x+3,y+size-5,size-6,2); }
  }
  function draw() {
    ctx.fillStyle = '#0c1220'; ctx.fillRect(0,0,400,800);
    ctx.strokeStyle = '#243049'; ctx.lineWidth = 1;
    for (let x = 0; x <= C.cols; x++) { ctx.beginPath(); ctx.moveTo(x*40,0); ctx.lineTo(x*40,800); ctx.stroke(); }
    for (let y = 0; y <= C.rows; y++) { ctx.beginPath(); ctx.moveTo(0,y*40); ctx.lineTo(400,y*40); ctx.stroke(); }
    game.board.forEach((row,y) => row.forEach((type,x) => { if (type) block(ctx,x*40,y*40,40,type); }));
    if (game.active && game.state !== 'START') {
      const ghost = game.ghost(); for (const [x,y] of cells(ghost)) if (y >= 0) block(ctx,x*40,y*40,40,ghost.type,true);
      for (const [x,y] of cells(game.active)) if (y >= 0) block(ctx,x*40,y*40,40,game.active.type);
    }
    preview.clearRect(0,0,160,120);
    if (game.next) {
      const m = matrix(game.next), occupied = [];
      m.forEach((row,y) => row.forEach((v,x) => { if (v) occupied.push([x,y]); }));
      const minX = Math.min(...occupied.map(p=>p[0])), maxX = Math.max(...occupied.map(p=>p[0]));
      const minY = Math.min(...occupied.map(p=>p[1])), maxY = Math.max(...occupied.map(p=>p[1]));
      for (const [x,y] of occupied) block(preview, (160-(maxX-minX+1)*30)/2+(x-minX)*30, (120-(maxY-minY+1)*30)/2+(y-minY)*30,30,game.next);
    }
  }
  function frame(now) {
    if (last !== null) {
      const dt = (now-last)/1000;
      if (dt > 1) pause();
      else if (game.state === 'PLAYING') {
        // Bounded updates preserve repeat/drop timing even on slower frames.
        let remaining = dt;
        while (remaining > 1e-9 && game.state === 'PLAYING') {
          const t = Math.min(remaining,C.step); remaining -= t;
          input.update(t).forEach(action); game.update(t,input.has('soft'));
        }
      } else game.update(dt);
    }
    last = now; sync(); draw(); requestAnimationFrame(frame);
  }
  sync(); draw(); requestAnimationFrame(frame);
})();
