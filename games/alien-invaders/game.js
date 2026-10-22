'use strict';

(() => {
  const { C, Game, format, record } = AlienInvaders;
  const $ = id => document.getElementById(id), canvas = $('canvas'), ctx = canvas.getContext('2d');
  const game = new Game(), prefix = 'my-arcade:alien-invaders:';
  const read = name => { try { return localStorage.getItem(prefix + name); } catch { return null; } };
  const save = (name, value) => { try { localStorage.setItem(prefix + name, String(value)); } catch { /* Keep session records/settings. */ } };
  let best = record(read('best')), sound = read('sound') !== 'off', audio = null;
  let last = performance.now(), stickPointer = null, firePointer = null, stickDirection = 0;
  const keys = new Set(), voices = new Set();
  const shipSprite = ['000010000', '000111000', '000111000', '011111110', '111111111', '111111111', '110000011'];
  const armoredSprite = ['0011111100', '0111111110', '1111111111', '1101001011', '1111111111', '0011001100', '0110110110'];
  const brokenSprite = ['0011011100', '0101111010', '1110111111', '1101001011', '0111101110', '0011000100', '0100010010'];
  const alienSprite = ['0010000100', '0001001000', '0011111100', '0110110110', '1111111111', '1010000101', '0011001100'];
  const explosionSprite = ['100010001', '010101010', '001111100', '011010110', '001111100', '010101010', '100010001'];
  // Static stars are deterministic and do not consume the gameplay random stream.
  const stars = Array.from({ length: 65 }, (_, i) => ({ x: (i * 137 + 13) % C.width, y: (i * 89 + 17) % C.height, bright: i % 4 === 0 }));
  function unlockAudio() {
    if (!sound) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio ||= new Context();
      if (audio.state === 'suspended') audio.resume()?.catch(() => {});
    } catch { /* Optional audio must never block play. */ }
  }
  function silence() {
    for (const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } }
    voices.clear();
  }
  function beep(event) {
    if (!sound || !audio || audio.state !== 'running') return;
    try {
      const notes = event === 'clear' ? [523, 659, 784] : [event === 'shoot' ? 720 : event === 'destroy' ? 190 : 95];
      notes.forEach((frequency, i) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime + i * .09;
        const duration = event === 'shoot' ? .035 : .12;
        oscillator.type = 'square'; oscillator.frequency.setValueAtTime(frequency, t);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * (event === 'clear' ? 1 : .5), t + duration);
        gain.gain.setValueAtTime(event === 'shoot' ? .018 : .035, t);
        gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
        oscillator.connect(gain); gain.connect(audio.destination); voices.add(oscillator);
        oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(t); oscillator.stop(t + duration);
      });
    } catch { /* Unsupported audio must not interrupt play. */ }
  }
  function portraitRequired() { return matchMedia('(pointer: coarse)').matches && innerWidth > innerHeight; }
  function input() {
    game.direction = stickPointer === null ? Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')) : stickDirection;
    game.setFiring(firePointer !== null || keys.has('Space'));
  }
  function cancelInput() {
    keys.clear(); stickDirection = 0; game.cancelInput();
    const oldStick = stickPointer, oldFire = firePointer; stickPointer = firePointer = null;
    for (const [element, id] of [[$('stick'), oldStick], [$('fire'), oldFire]]) {
      if (id !== null && element.hasPointerCapture(id)) element.releasePointerCapture(id);
    }
    $('knob').style.transform = ''; $('fire').classList.remove('pressed');
  }
  function sprite(rows, x, y, w, h, color) {
    ctx.fillStyle = color;
    rows.forEach((row, j) => [...row].forEach((pixel, i) => { if (pixel === '1') ctx.fillRect(x + i * w / row.length, y + j * h / rows.length, w / row.length + .1, h / rows.length + .1); }));
  }
  function draw() {
    ctx.fillStyle = '#02050c'; ctx.fillRect(0, 0, C.width, C.height);
    stars.forEach(s => { ctx.fillStyle = s.bright ? '#6d819d' : '#23364f'; ctx.fillRect(s.x, s.y, s.bright ? 2 : 1, 1); });
    ctx.strokeStyle = '#f35467'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(0, C.defenseY); ctx.lineTo(C.width, C.defenseY); ctx.stroke(); ctx.setLineDash([]);
    if (!game.enemies) return;
    game.enemies.forEach(e => { const r = game.rect(e); sprite(e.armored ? (e.hp === 2 ? armoredSprite : brokenSprite) : alienSprite, r.x, r.y, r.w, r.h, e.armored ? (e.hp === 2 ? '#c5a5ff' : '#ffbd78') : '#78eed3'); });
    if (!game.invincible || Math.floor(game.invincible * 12) % 2 === 0) sprite(shipSprite, game.ship - C.shipWidth / 2, C.shipY - C.shipHeight / 2, C.shipWidth, C.shipHeight, '#78ffd0');
    ctx.fillStyle = '#d1ffff'; game.lasers.forEach(b => ctx.fillRect(b.x - 1.5, b.y - 10, 3, 10));
    ctx.strokeStyle = '#ff536b'; ctx.lineWidth = 3;
    game.bullets.forEach(b => { ctx.beginPath(); ctx.moveTo(b.x - 2, b.y); ctx.lineTo(b.x + 2, b.y + 4); ctx.lineTo(b.x - 2, b.y + 8); ctx.lineTo(b.x + 2, b.y + 12); ctx.stroke(); });
    game.effects.forEach(e => sprite(explosionSprite, e.x, e.y, C.enemyWidth, C.enemyHeight, '#ffe6a0'));
  }
  function sync() {
    const state = game.state, playing = state === 'PLAYING', paused = state === 'PAUSED', clear = state === 'CLEAR', ended = clear || state === 'GAME OVER';
    $('overlay').hidden = playing; $('start').hidden = state !== 'START';
    $('resume').hidden = $('restart').hidden = !paused; $('retry').hidden = !ended;
    $('home').hidden = !(ended || paused); $('results').hidden = !clear;
    $('instructions').hidden = state !== 'START'; $('orientation').hidden = !paused || !portraitRequired();
    $('resume').disabled = portraitRequired(); $('pause').disabled = !playing; $('fire').disabled = !playing;
    $('screen-title').innerHTML = state === 'START' ? 'ALIEN<br>INVADERS' : state;
    $('sound').textContent = sound ? 'SOUND ON' : 'SOUND OFF'; $('sound').setAttribute('aria-pressed', String(sound));
    $('time').textContent = format(game.elapsed || 0);
    $('lives').innerHTML = Array.from({ length: game.lives ?? 3 }, () => '<svg viewBox="0 0 9 7" aria-hidden="true"><path d="M4 0h1v1h1v2h1v1h2v3H7V6H2v1H0V4h2V3h1V1h1z"/></svg>').join('');
    $('lives').setAttribute('aria-label', `ライフ${game.lives ?? 3}`);
    draw();
  }
  function finish() {
    cancelInput(); silence();
    if (game.state === 'CLEAR') {
      const score = game.finalCents(), isBest = best === null || score < best;
      if (isBest) { best = score; save('best', best); }
      $('raw-time').textContent = format(game.elapsed); $('penalty').textContent = `+${format(game.hits * C.penalty)}`;
      $('final-time').textContent = format(score / 100); $('best').textContent = format(best / 100);
      $('new-best').hidden = !isBest;
    }
    sync(); $('retry').focus({ preventScroll: true });
  }
  function drainEvents() { for (const event of game.events || []) beep(event); if (game.events) game.events.length = 0; }
  function advance(now) {
    const before = game.state;
    game.update(Math.max(0, (now - last) / 1000)); last = now;
    if (before === 'PLAYING' && game.state !== 'PLAYING') finish();
    drainEvents();
  }
  function start() {
    cancelInput(); silence(); game.start(); last = performance.now(); unlockAudio();
    if (document.hidden || portraitRequired()) game.pause();
    sync(); $('pause').focus({ preventScroll: true });
  }
  function pause() {
    advance(performance.now());
    if (!game.pause()) return;
    cancelInput(); silence(); sync(); $('resume').focus({ preventScroll: true });
  }
  $('start').addEventListener('click', start); $('retry').addEventListener('click', start); $('restart').addEventListener('click', start);
  $('pause').addEventListener('click', pause);
  $('resume').addEventListener('click', () => {
    if (document.hidden || portraitRequired() || !game.resume()) return;
    cancelInput(); last = performance.now(); unlockAudio(); sync(); $('pause').focus({ preventScroll: true });
  });
  $('sound').addEventListener('click', () => { sound = !sound; save('sound', sound ? 'on' : 'off'); if (sound) unlockAudio(); else silence(); sync(); });
  function moveStick(event) {
    const rect = $('stick').getBoundingClientRect(), offset = Math.max(-1, Math.min(1, (event.clientX - rect.x - rect.width / 2) / (rect.width / 2)));
    stickDirection = Math.abs(offset) < .18 ? 0 : Math.sign(offset);
    $('knob').style.transform = `translateX(${offset * rect.width * .26}px)`; input();
  }
  $('stick').addEventListener('pointerdown', event => {
    if (game.state !== 'PLAYING' || stickPointer !== null || event.button !== 0) return;
    event.preventDefault(); advance(performance.now());
    if (game.state !== 'PLAYING') return;
    stickPointer = event.pointerId; $('stick').setPointerCapture(event.pointerId); moveStick(event);
  });
  $('stick').addEventListener('pointermove', event => { if (event.pointerId === stickPointer) { event.preventDefault(); advance(performance.now()); if (game.state === 'PLAYING') moveStick(event); } });
  function releaseStick(event) {
    if (event.pointerId !== stickPointer) return;
    advance(performance.now()); stickPointer = null; stickDirection = 0; $('knob').style.transform = ''; input();
  }
  $('stick').addEventListener('pointerup', releaseStick);
  $('fire').addEventListener('pointerdown', event => {
    if (game.state !== 'PLAYING' || firePointer !== null || event.button !== 0) return;
    event.preventDefault(); advance(performance.now()); if (game.state !== 'PLAYING') return;
    firePointer = event.pointerId; $('fire').setPointerCapture(event.pointerId); $('fire').classList.add('pressed'); unlockAudio(); input(); drainEvents(); draw();
  });
  function releaseFire(event) {
    if (event.pointerId !== firePointer) return;
    advance(performance.now()); firePointer = null; $('fire').classList.remove('pressed'); input();
  }
  $('fire').addEventListener('pointerup', releaseFire);
  for (const element of [$('stick'), $('fire')]) {
    for (const name of ['pointercancel', 'lostpointercapture']) element.addEventListener(name, event => {
      if (event.pointerId !== stickPointer && event.pointerId !== firePointer) return;
      advance(performance.now()); cancelInput();
    });
  }
  document.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code) || !['PLAYING', 'PAUSED'].includes(game.state)) return;
    event.preventDefault(); if (game.state !== 'PLAYING' || event.repeat) return;
    advance(performance.now()); if (game.state !== 'PLAYING') return;
    keys.add(event.code); unlockAudio(); input(); drainEvents();
  });
  document.addEventListener('keyup', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) return;
    if (['PLAYING', 'PAUSED'].includes(game.state)) event.preventDefault();
    advance(performance.now()); keys.delete(event.code); input();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', pause); window.addEventListener('pagehide', pause);
  function resize() { if (portraitRequired()) pause(); sync(); }
  window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize);
  function frame(now) { advance(now); if (game.state === 'PLAYING') sync(); requestAnimationFrame(frame); }
  sync(); requestAnimationFrame(frame);
})();
