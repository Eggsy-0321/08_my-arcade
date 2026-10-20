'use strict';

(() => {
  const { W, H, R, PW, PY, Game } = BlockBreaker;
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const colors = ['#ff72bd', '#c57bff', '#9487ff', '#5bbdff', '#59edee'];
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Optional storage. */ } };
  const stored = Number(read('my-arcade:block-breaker:v1.1:best'));
  let best = Number.isFinite(stored) && stored > 0 ? stored : null;
  let muted = read('my-arcade:block-breaker:muted') === 'true';
  let audio, particles = [], trail = [], feedbackUntil = 0, lastState, previousTime = performance.now();
  const keys = new Set();
  const format = ms => {
    const cs = Math.floor(ms / 10);
    return `${String(Math.floor(cs / 6000)).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
  };
  function unlock() {
    try {
      if (!audio) { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) audio = new Audio(); }
      if (audio?.state === 'suspended') audio.resume().catch(() => {});
    } catch { /* Sound is optional. */ }
  }
  function sound(type) {
    if (muted || !audio || audio.state !== 'running') return;
    const notes = { wall: [300, .035], paddle: [460, .06], brick: [680, .045], miss: [100, .22], clear: [1040, .35] };
    const [frequency, length] = notes[type] || notes.brick;
    const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
    osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * (type === 'miss' ? .4 : 1.5), now + length);
    gain.gain.setValueAtTime(.045, now); gain.gain.exponentialRampToValueAtTime(.001, now + length);
    osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + length);
  }
  function feedback(text, duration = 1100) { $('feedback').textContent = text; feedbackUntil = performance.now() + duration; }
  const game = new Game({ event(type, value) {
    sound(type);
    if (type === 'brick') {
      for (let i = 0; i < 6; i++) particles.push({ x: value.x + value.w / 2, y: value.y + value.h / 2,
        vx: (Math.random() - .5) * 120, vy: (Math.random() - .5) * 120, life: .35, color: colors[value.row] });
      particles = particles.slice(-150);
    }
    if (type === 'miss') { trail = []; feedback('+10.00 SEC — 発射して再開', 2500); }
    if (type === 'clear' && (best === null || value < best)) { best = value; save('my-arcade:block-breaker:v1.1:best', best); }
  } });
  function reset() { unlock(); keys.clear(); particles = []; trail = []; game.reset(); feedback('READY — 発射してスタート', Infinity); sync(); canvas.focus({ preventScroll: true }); }
  function launch() { unlock(); if (game.state === 'READY') { game.launch(); feedback('', 0); sync(); } }
  function pause() {
    unlock(); keys.clear();
    if (game.state === 'PAUSED') game.resume(); else game.pause();
    previousTime = performance.now(); sync();
  }
  function sync() {
    $('time').textContent = format(game.time()); $('best').textContent = best === null ? '--:--.--' : format(best);
    $('stage').textContent = `${game.stage}/1`; $('life').textContent = game.life;
    $('launch').disabled = game.state !== 'READY';
    $('pause').disabled = !['READY', 'PLAYING', 'PAUSED'].includes(game.state);
    $('pause').textContent = game.state === 'PAUSED' ? 'RESUME ▶' : 'PAUSE Ⅱ';
    $('mute').textContent = `MUTE ${muted ? 'ON' : 'OFF'}`; $('mute').setAttribute('aria-pressed', String(muted));
    const overlay = ['START', 'PAUSED', 'GAME OVER', 'ALL CLEAR'].includes(game.state);
    $('overlay').hidden = !overlay;
    $('result-home').hidden = !['GAME OVER', 'ALL CLEAR'].includes(game.state);
    if (lastState !== game.state && overlay) {
      if (game.state === 'PAUSED') {
        $('eyebrow').textContent = 'TAKE A BREAK'; $('screen-title').textContent = 'PAUSED';
        $('message').textContent = 'タイマーは停止しています。'; $('hint').textContent = 'RESUME / P で再開'; $('action').textContent = 'RESUME ▶';
      } else if (game.state !== 'START') {
        $('eyebrow').textContent = game.state === 'ALL CLEAR' ? '1 / 1 STAGE COMPLETE' : 'TRY ONE MORE TIME';
        $('screen-title').textContent = game.state;
        $('message').textContent = `TIME ${format(game.time())}\nMISSES ${game.misses}（+${game.misses * 10}秒）`;
        $('hint').textContent = `BEST ${best === null ? '--:--.--' : format(best)}`; $('action').textContent = 'RETRY ↻';
      }
    }
    lastState = game.state;
    $('feedback').hidden = overlay || performance.now() > feedbackUntil;
  }
  $('action').addEventListener('click', () => game.state === 'PAUSED' ? pause() : reset());
  $('retry').addEventListener('click', reset); $('launch').addEventListener('click', launch); $('pause').addEventListener('click', pause);
  $('mute').addEventListener('click', () => { unlock(); muted = !muted; save('my-arcade:block-breaker:muted', muted); sync(); });
  const logicalX = e => (e.clientX - canvas.getBoundingClientRect().left) / canvas.getBoundingClientRect().width * W;
  let drag = null;
  canvas.addEventListener('pointerdown', e => {
    if (!['READY', 'PLAYING'].includes(game.state) || (e.pointerType === 'mouse' && e.button !== 0) || drag) return;
    unlock(); canvas.focus({ preventScroll: true });
    if (e.pointerType === 'mouse') { game.move(logicalX(e)); launch(); }
    else { drag = { id: e.pointerId, x: logicalX(e), paddle: game.paddle }; canvas.setPointerCapture(e.pointerId); }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') game.move(logicalX(e));
    else if (drag?.id === e.pointerId) game.move(drag.paddle + logicalX(e) - drag.x);
  });
  const endDrag = e => { if (drag?.id === e.pointerId) drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('lostpointercapture', endDrag);
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select') || (e.code === 'Space' && e.target.closest('button, a'))) return;
    if (['ArrowLeft', 'ArrowRight', 'Space', 'KeyP'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Space') launch();
    if (e.code === 'KeyP') pause();
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') keys.add(e.code);
  });
  document.addEventListener('keyup', e => keys.delete(e.code));
  function autoPause() { keys.clear(); drag = null; game.pause(); sync(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
  window.addEventListener('blur', autoPause);
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2), rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  }
  new ResizeObserver(resize).observe(canvas); resize();
  function draw(dt) {
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.fillStyle = '#090f23'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#15203a'; ctx.lineWidth = .5;
    for (let x = 0; x <= W; x += 25) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (const b of game.blocks) {
      ctx.fillStyle = colors[b.row]; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#ffffff66'; ctx.fillRect(b.x, b.y, b.w, 2);
    }
    const active = game.state === 'PLAYING';
    if (active) { trail.push({ x: game.ball.x, y: game.ball.y }); trail = trail.slice(-7); }
    trail.forEach((p, i) => { ctx.globalAlpha = (i + 1) / trail.length * .25; ctx.fillStyle = '#72f3ff'; ctx.beginPath(); ctx.arc(p.x, p.y, R * i / trail.length, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
    for (const p of particles) {
      if (active) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      ctx.globalAlpha = Math.max(0, p.life / .35); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3);
    }
    particles = particles.filter(p => p.life > 0); ctx.globalAlpha = 1;
    ctx.shadowColor = '#67efff'; ctx.shadowBlur = 8; ctx.fillStyle = '#a1f7ff';
    ctx.fillRect(game.paddle - PW / 2, PY, PW, 9);
    ctx.fillStyle = '#f4fdff'; ctx.beginPath(); ctx.arc(game.ball.x, game.ball.y, R, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff72bd'; ctx.fillRect(0, H - 2, W, 2);
  }
  function frame(now) {
    const dt = Math.min(Math.max((now - previousTime) / 1000, 0), .05); previousTime = now;
    game.move(game.paddle + ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * 420 * dt);
    game.update(dt); sync(); draw(dt); requestAnimationFrame(frame);
  }
  sync(); requestAnimationFrame(frame);
})();
