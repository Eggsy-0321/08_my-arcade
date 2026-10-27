'use strict';
(() => {
  const { C, Game, record } = CycleRunner, $ = id => document.getElementById(id);
  const prefix = 'my-arcade:cycle-runner:', canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
  const read = key => { try { return localStorage.getItem(prefix + key); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(prefix + key, value); } catch { /* Keep the in-page value. */ } };
  let best = record(read('best')), sound = read('sound') !== 'off', audio, newBest = false, last = null;
  function unlock() { try { if (!audio) { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) audio = new Audio(); } if (audio?.state === 'suspended') Promise.resolve(audio.resume()).catch(() => {}); } catch { /* Audio is optional. */ } }
  function tone(type) {
    if (!sound || !audio) return;
    const notes = { jump: [330, 520], double: [520, 780], land: [130, 100], crash: [170, 45], best: [660, 880, 1100] }[type];
    try { notes.forEach((f, i) => { const o = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime + i * .065;
      o.type = type === 'crash' ? 'sawtooth' : 'square'; o.frequency.setValueAtTime(f, t); gain.gain.setValueAtTime(.035, t); gain.gain.exponentialRampToValueAtTime(.001, t + .09); o.connect(gain); gain.connect(audio.destination); o.start(t); o.stop(t + .1); }); } catch { /* Audio failure never stops play. */ }
  }
  const game = new Game({ onEvent: tone });
  function sync() {
    const running = game.state === 'RUNNING', countdown = game.state === 'COUNTDOWN', over = game.state === 'GAME_OVER', paused = game.state === 'PAUSED';
    const meters = Math.floor(game.distance / 10);
    if (over && meters > best) { best = meters; newBest = true; save('best', String(best)); tone('best'); }
    $('distance').textContent = meters + ' m'; $('best').textContent = best + ' m';
    $('sound').textContent = 'SOUND ' + (sound ? 'ON' : 'OFF'); $('sound').setAttribute('aria-pressed', String(sound));
    $('jump').disabled = !running; $('pause').disabled = !(running || countdown); $('overlay').hidden = running || countdown;
    $('countdown').hidden = !countdown; $('countdown').textContent = game.count > .350000001 ? String(Math.ceil(game.count - .350000001)) : 'GO!';
    $('heading').textContent = over ? 'GAME OVER' : paused ? 'PAUSED' : 'CYCLE RUNNER';
    $('message').hidden = over; $('message').innerHTML = paused ? 'ひと休み。準備ができたら再開しよう。' : 'ペダルは止めずに、街の先へ。<br>最大2段ジャンプで道路を駆け抜けよう。';
    $('results').hidden = !over; $('results').textContent = `DISTANCE  ${meters} m\nBEST  ${best} m${newBest ? '\nNEW BEST!' : ''}`;
    $('start').hidden = game.state !== 'TITLE'; $('resume').hidden = !paused; $('retry').hidden = !over;
    document.querySelector('.jump-lights').textContent = '◆ '.repeat(2 - game.jumps) + '◇ '.repeat(game.jumps);
  }
  function begin() { unlock(); newBest = false; game.start(); last = null; sync(); }
  function pause() { game.pause(); last = null; sync(); }
  function resume() { unlock(); game.resume(); last = null; sync(); }
  function jump() { unlock(); game.jump(); sync(); }
  $('start').addEventListener('click', begin); $('retry').addEventListener('click', begin); $('pause').addEventListener('click', pause); $('resume').addEventListener('click', resume);
  $('sound').addEventListener('click', () => { unlock(); sound = !sound; save('sound', sound ? 'on' : 'off'); sync(); });
  let pointer = null, spaceHeld = false;
  $('jump').addEventListener('pointerdown', e => { e.preventDefault(); if (pointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return; pointer = e.pointerId; jump(); });
  const clearPointer = e => { if (!e || e.pointerId === pointer) pointer = null; };
  window.addEventListener('pointerup', clearPointer); window.addEventListener('pointercancel', clearPointer);
  $('jump').addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { if (!['RUNNING', 'COUNTDOWN'].includes(game.state) && e.target !== $('jump')) return; e.preventDefault(); if (e.repeat || spaceHeld) return; spaceHeld = true; jump(); }
    if (e.code === 'Escape') { e.preventDefault(); if (e.repeat) return; game.state === 'PAUSED' ? resume() : pause(); }
  });
  window.addEventListener('keyup', e => { if (e.code === 'Space') spaceHeld = false; });
  function autoPause() { pointer = null; spaceHeld = false; pause(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
  for (const event of ['blur', 'pagehide', 'orientationchange']) window.addEventListener(event, autoPause);
  screen.orientation?.addEventListener('change', autoPause);
  let landscape = innerWidth > innerHeight;
  window.addEventListener('resize', () => { const next = innerWidth > innerHeight; if (next !== landscape) autoPause(); landscape = next; });
  function line(points, color, width = 3) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke(); }
  function draw() {
    ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.fillStyle = '#141d34'; ctx.fillRect(0, 0, 360, 360);
    const d = game.distance, ground = 285;
    ctx.fillStyle = '#ffe0a1'; ctx.beginPath(); ctx.arc(285, 68, 25, 0, Math.PI * 2); ctx.fill();
    for (let i = -1; i < 10; i++) { const x = i * 55 - d * .16 % 55, h = 30 + ((i + 12) * 37 % 73); ctx.fillStyle = '#27304a'; ctx.fillRect(x, 225 - h, 43, h); ctx.fillStyle = '#5c5265'; for (let y = 237 - h; y < 220; y += 16) ctx.fillRect(x + 10, y, 5, 5); }
    ctx.fillStyle = '#313848'; ctx.fillRect(0, 225, 360, 60); line([[0,239],[360,239]], '#5e6a71', 2);
    ctx.fillStyle = '#444553'; ctx.fillRect(0, ground, 360, 75); ctx.fillStyle = '#b4cfb4'; ctx.fillRect(0, ground, 360, 4);
    ctx.fillStyle = '#bda976'; for (let x = -d % 70; x < 360; x += 70) ctx.fillRect(x, 321, 32, 3);
    for (const g of game.groups) for (const h of g.hazards) {
      const x = h.x - d + C.playerX;
      if (h.type === 'hole') { ctx.fillStyle = '#0b1020'; ctx.fillRect(x, ground, h.w, 75); line([[x,ground],[x,350],[x+h.w,350],[x+h.w,ground]], '#e87964', 2); }
      else if (h.type === 'crate') { ctx.fillStyle = '#ab7359'; ctx.fillRect(x,ground-h.h,h.w,h.h); ctx.strokeStyle = '#efc181'; ctx.lineWidth = 2; ctx.strokeRect(x+2,ground-h.h+2,h.w-4,h.h-4); line([[x+3,ground-3],[x+h.w-3,ground-h.h+3]],'#efc181',2); }
      else { ctx.fillStyle = '#f28666'; ctx.beginPath(); ctx.moveTo(x,ground); ctx.lineTo(x+h.w/2,ground-h.h); ctx.lineTo(x+h.w,ground); ctx.fill(); ctx.fillStyle='#fff0c2';ctx.fillRect(x+h.w*.3,ground-h.h*.5,h.w*.4,4); }
    }
    ctx.save(); ctx.translate(C.playerX, ground - game.y);
    for (const x of [-16,17]) { ctx.fillStyle = '#111c2b'; ctx.beginPath();ctx.arc(x,-10,10,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#b4c5c7';ctx.lineWidth=2;ctx.stroke(); const a = d / 12;line([[x-Math.cos(a)*7,-10-Math.sin(a)*7],[x+Math.cos(a)*7,-10+Math.sin(a)*7]],'#687c8b',1); }
    line([[-16,-10],[-5,-28],[5,-10],[-16,-10],[11,-28],[17,-10]],'#c2ff78',3);line([[11,-28],[8,-34],[16,-34]],'#f5dfad',3);
    line([[-6,-42],[-10,-29],[1,-23],[-3,-10]],'#f38678',5);line([[-6,-40],[2,-34],[11,-32]],'#f0cfa2',4);
    ctx.fillStyle='#f0cfa2';ctx.fillRect(-10,-53,9,10);ctx.fillStyle='#c2ff78';ctx.fillRect(-13,-56,14,5);ctx.restore();
    ctx.fillStyle='#99a7b4';ctx.font='9px monospace';ctx.fillText('NIGHT ROUTE  /  '+Math.round(game.speed/C.baseSpeed*100)+'%',12,20);
  }
  function frame(now) { if (last !== null) { const dt = (now-last)/1000; if (dt > 1) autoPause(); else game.update(dt); } last = now; sync(); draw(); requestAnimationFrame(frame); }
  sync(); draw(); requestAnimationFrame(frame);
})();
