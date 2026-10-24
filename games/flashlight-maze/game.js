'use strict';
(() => {
  const { C, Game, Hold, goal, start: origin, format, record } = FlashlightMaze;
  const $ = id => document.getElementById(id), canvas = $('canvas'), ctx = canvas.getContext('2d');
  const prefix = 'my-arcade:flashlight-maze:';
  const read = key => { try { return localStorage.getItem(prefix + key); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(prefix + key, String(value)); } catch { /* Keep session records. */ } };
  const game = new Game(), buttons = [...document.querySelectorAll('[data-direction]')];
  let best = record(read('best')), sound = read('sound') !== 'off', audio, owner = null, lastFrame = performance.now();
  function unlock() {
    if (!sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ||= new Audio();
      if (audio.state === 'suspended') audio.resume()?.catch(() => {});
    } catch { /* Audio is optional. */ }
  }
  function beep(clear) {
    if (!sound || audio?.state !== 'running') return;
    try {
      (clear ? [523, 659, 784] : [330]).forEach((hz, i) => {
        const o = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + i * .08;
        o.type = 'sine'; o.frequency.value = hz; gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(.045, at + .008); gain.gain.exponentialRampToValueAtTime(.0001, at + .07);
        o.connect(gain); gain.connect(audio.destination); o.onended = () => { o.disconnect(); gain.disconnect(); };
        o.start(at); o.stop(at + .08);
      });
    } catch { /* Effects must never interrupt play. */ }
  }
  const hold = new Hold(direction => {
    if (!game.move(direction)) return;
    beep(game.state === 'CLEAR');
    if (game.state === 'CLEAR') {
      clearInput();
      if (best === null || game.elapsed < best) { best = game.elapsed; save('best', best); }
      $('final-time').textContent = format(game.elapsed); $('final-best').textContent = format(best);
      $('status').textContent = `クリア！ ${format(game.elapsed)}`;
      sync(); $('retry').focus({ preventScroll: true });
    }
    draw();
  });
  function clearInput() { hold.clear(); owner = null; buttons.forEach(b => b.classList.remove('pressed')); }
  function draw() {
    const size = canvas.width, cell = size / C.size;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
    if (!game.board || ['TITLE', 'PAUSED'].includes(game.state)) return;
    ctx.save();
    if (game.state === 'ESCAPE') {
      ctx.beginPath(); ctx.arc((game.player.x + .5) * cell, (game.player.y + .5) * cell, C.lightRadius * cell, 0, Math.PI * 2); ctx.clip();
    }
    ctx.fillStyle = '#fff4cb'; ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < C.size; y++) for (let x = 0; x < C.size; x++) {
      if (game.board[y][x]) {
        ctx.fillStyle = '#263650'; ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.strokeStyle = '#526481'; ctx.lineWidth = 1; ctx.strokeRect(x * cell + 2, y * cell + 2, cell - 4, cell - 4);
      }
    }
    ctx.font = `bold ${cell * .6}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#28697a'; ctx.fillText('S', (origin.x + .5) * cell, (origin.y + .5) * cell);
    // Hide the entire goal marker until its center is within the light circle.
    if (game.visible(goal.x, goal.y)) {
      ctx.fillStyle = '#ed398d'; ctx.fillRect((goal.x + .12) * cell, (goal.y + .12) * cell, cell * .76, cell * .76);
      ctx.fillStyle = '#fff'; ctx.fillText('G', (goal.x + .5) * cell, (goal.y + .5) * cell);
    }
    ctx.beginPath(); ctx.arc((game.player.x + .5) * cell, (game.player.y + .5) * cell, cell * .28, 0, Math.PI * 2);
    ctx.fillStyle = '#04c7e6'; ctx.fill(); ctx.strokeStyle = '#075064'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  function sync() {
    const state = game.state, active = ['MEMORY', 'ESCAPE'].includes(state);
    const clear = state === 'CLEAR';
    (clear ? $('result-slot') : document.querySelector('.arena')).append($('overlay'));
    $('result-slot').hidden = !clear;
    document.querySelector('.actions').hidden = document.querySelector('.dpad').hidden = clear;
    $('overlay').hidden = active; $('overlay').classList.toggle('clear', state === 'CLEAR');
    $('screen-title').innerHTML = state === 'TITLE' ? 'FLASHLIGHT<br>MAZE' : state === 'PAUSED' ? 'PAUSED' : 'CLEAR!';
    $('message').hidden = state === 'CLEAR';
    if (state === 'PAUSED') $('message').textContent = '迷路と時計を停止中。RESUMEで再開';
    $('start').hidden = state !== 'TITLE'; $('resume').hidden = state !== 'PAUSED';
    $('retry').hidden = $('results').hidden = state !== 'CLEAR'; $('home').hidden = !['PAUSED', 'CLEAR'].includes(state);
    $('pause').disabled = !active; $('restart').disabled = state === 'TITLE';
    buttons.forEach(b => { b.disabled = state !== 'ESCAPE'; });
    $('best').textContent = best === null ? '--:--.--' : format(best);
    $('sound').textContent = sound ? 'SOUND ON' : 'SOUND OFF'; $('sound').setAttribute('aria-pressed', String(sound));
    hud(); draw();
  }
  function hud() {
    const memory = game.state === 'MEMORY' || (game.state === 'PAUSED' && game.phase === 'MEMORY') || game.state === 'TITLE';
    $('phase').textContent = memory ? 'MEMORIZE' : 'ESCAPE TIME';
    $('time').textContent = memory ? String(Math.ceil(game.memory / 1000)) : format(game.elapsed);
  }
  function start() { clearInput(); unlock(); game.start(); lastFrame = performance.now(); sync(); $('pause').focus({ preventScroll: true }); $('status').textContent = '20秒間、迷路を記憶してください。'; }
  function pause(at = performance.now()) { clearInput(); if (at - lastFrame > C.sleepGap) at = lastFrame; if (game.pause(at)) { sync(); $('resume').focus({ preventScroll: true }); } }
  $('start').addEventListener('click', start); $('retry').addEventListener('click', start); $('restart').addEventListener('click', start);
  $('pause').addEventListener('click', () => pause());
  $('resume').addEventListener('click', () => {
    if (document.hidden || !game.resume()) return;
    clearInput(); unlock(); lastFrame = performance.now(); sync(); $('pause').focus({ preventScroll: true });
  });
  $('sound').addEventListener('click', () => { sound = !sound; save('sound', sound ? 'on' : 'off'); unlock(); sync(); });
  function press(direction, source) {
    if (performance.now() - lastFrame > C.sleepGap) pause(lastFrame);
    if (game.state !== 'ESCAPE' || owner !== null) return;
    owner = source; unlock(); hold.press(direction, performance.now());
    if (game.state === 'ESCAPE') $(direction).classList.add('pressed');
  }
  buttons.forEach(button => {
    button.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); press(button.dataset.direction, e.pointerId);
    });
    // Do not capture the pointer: leaving the button must stop a held move.
    button.addEventListener('pointerleave', e => { if (owner === e.pointerId) clearInput(); });
    button.addEventListener('lostpointercapture', clearInput);
    button.addEventListener('click', e => { if (e.detail === 0 && game.state === 'ESCAPE') { unlock(); hold.move(button.dataset.direction); } });
  });
  for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, e => { if (owner === e.pointerId) clearInput(); });
  window.addEventListener('pointermove', e => {
    if (owner !== e.pointerId || !hold.direction) return;
    const r = $(hold.direction).getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) clearInput();
  });
  const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  window.addEventListener('keydown', e => {
    const direction = keys[e.key] || keys[e.key.toLowerCase()];
    if (!direction || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); if (!e.repeat) press(direction, e.code);
  });
  window.addEventListener('keyup', e => { if (owner === e.code) clearInput(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', () => pause()); window.addEventListener('pagehide', () => pause());
  window.addEventListener('orientationchange', () => pause());
  screen.orientation?.addEventListener('change', () => pause());
  const orientation = matchMedia('(orientation: portrait)'); orientation.addEventListener('change', () => pause());
  function frame(at) {
    if (at - lastFrame > C.sleepGap) pause(lastFrame);
    lastFrame = at;
    const previous = game.state; game.update(at);
    if (previous !== game.state) {
      clearInput(); sync();
      if (game.state === 'ESCAPE') $('status').textContent = '脱出開始。方向ボタンか矢印キーでゴールへ。';
    }
    hold.update(at); hud(); draw(); requestAnimationFrame(frame);
  }
  sync(); requestAnimationFrame(frame);
})();
