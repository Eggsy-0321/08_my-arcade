'use strict';

(() => {
  const { Game, format, record } = LightsOut;
  const $ = id => document.getElementById(id), board = $('board');
  const prefix = 'my-arcade:lights-out:';
  const read = name => { try { return localStorage.getItem(prefix + name); } catch { return null; } };
  const save = (name, value) => { try { localStorage.setItem(prefix + name, String(value)); } catch { /* Keep session settings and records. */ } };
  let bestMoves = record(read('best-moves'), true), bestTime = record(read('best-time'));
  let sound = read('sound') !== 'off', audio = null;
  const game = new Game();
  const landscapeTouch = matchMedia('(orientation: landscape) and (pointer: coarse)');
  const boardPointers = new Set();
  function unlockAudio() {
    if (!sound) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      audio ||= new Context();
      if (audio.state === 'suspended') audio.resume()?.catch(() => {});
    } catch { /* Audio is optional. */ }
  }
  function beep(clear = false) {
    if (!sound || !audio || audio.state !== 'running') return;
    try {
      const start = audio.currentTime;
      (clear ? [523.25, 659.25, 783.99] : [440]).forEach((frequency, i) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        const t = start + i * .09, duration = clear ? .16 : .07;
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(.08, t + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(t); oscillator.stop(t + duration);
      });
    } catch { /* Failure must not interrupt play. */ }
  }
  const cells = Array.from({ length: 25 }, (_, i) => {
    const cell = document.createElement('button');
    cell.className = 'cell'; cell.style.setProperty('--i', i);
    cell.addEventListener('pointerdown', event => {
      if (game.state === 'PLAYING') boardPointers.add(event.pointerId);
    });
    cell.addEventListener('pointercancel', event => boardPointers.delete(event.pointerId));
    cell.addEventListener('click', event => {
      // A pointer that began before PAUSE must not become a move after RESUME.
      if (event.detail > 0 && !boardPointers.delete(event.pointerId)) return;
      move(i);
    });
    board.append(cell); return cell;
  });
  function sync() {
    $('moves').textContent = game.moves; $('time').textContent = format(game.time());
    board.classList.toggle('concealed', ['START', 'PAUSED', 'CLEAR'].includes(game.state));
    board.classList.toggle('wave', game.state === 'WAVE');
    cells.forEach((cell, i) => {
      cell.classList.toggle('on', game.board[i]); cell.textContent = game.board[i] ? '●' : '○';
      cell.setAttribute('aria-pressed', String(game.board[i]));
      cell.setAttribute('aria-label', `${Math.floor(i / 5) + 1}行${i % 5 + 1}列 ${game.board[i] ? 'ON' : 'OFF'}`);
      cell.disabled = game.state !== 'PLAYING';
    });
    $('overlay').hidden = game.state !== 'START' && game.state !== 'CLEAR';
    $('pause-overlay').hidden = game.state !== 'PAUSED';
    $('resume').disabled = document.hidden || landscapeTouch.matches;
    $('start').hidden = game.state !== 'START';
    $('result-actions').hidden = $('results').hidden = game.state !== 'CLEAR';
    $('reset').disabled = $('pause').disabled = game.state !== 'PLAYING';
    $('sound').disabled = game.state === 'WAVE';
    $('sound').textContent = sound ? 'SOUND ON' : 'SOUND OFF';
    $('sound').setAttribute('aria-pressed', String(sound));
    $('screen-title').textContent = game.state === 'CLEAR' ? 'CLEAR!' : 'LIGHTS OUT';
    $('message').hidden = game.state === 'CLEAR';
  }
  function resultRecord(value, previous, name, formatValue) {
    const best = previous === null ? value : Math.min(value, previous);
    save(name, best);
    const message = previous === null ? 'FIRST RECORD' : value < previous ? 'NEW BEST!' : value === previous ? 'BEST TIE' : `BESTとの差 +${formatValue(value - previous)}`;
    return { best, message };
  }
  function finish() {
    const moves = resultRecord(game.moves, bestMoves, 'best-moves', String);
    const time = resultRecord(game.time(), bestTime, 'best-time', format);
    bestMoves = moves.best; bestTime = time.best;
    $('final-moves').textContent = game.moves; $('best-moves').textContent = bestMoves;
    $('final-time').textContent = format(game.time()); $('best-time').textContent = format(bestTime);
    $('moves-record').textContent = moves.message; $('time-record').textContent = time.message;
    $('status').textContent = `クリア！ ${game.moves}手、${format(game.time())}`;
  }
  function start() {
    if (!game.start()) return;
    unlockAudio(); sync(); cells[0].focus({ preventScroll: true });
    $('status').textContent = 'ゲーム開始。すべてのライトを点灯させましょう。';
  }
  function move(index) {
    if (!game.move(index)) return;
    unlockAudio();
    if (game.state === 'WAVE') { finish(); beep(true); } else beep();
    sync();
  }
  function pause() {
    if (!game.pause()) return;
    boardPointers.clear();
    sync();
    if (!$('resume').disabled) $('resume').focus({ preventScroll: true });
  }
  $('start').addEventListener('click', start); $('retry').addEventListener('click', start);
  $('reset').addEventListener('click', () => { if (game.reset()) { sync(); $('status').textContent = '同じ問題を最初から再開しました。'; } });
  $('pause').addEventListener('click', pause);
  $('resume').addEventListener('click', () => {
    if (document.hidden || landscapeTouch.matches || !game.resume()) return;
    boardPointers.clear();
    unlockAudio(); sync(); $('pause').focus({ preventScroll: true });
  });
  $('sound').addEventListener('click', () => {
    if (game.state === 'WAVE') return;
    sound = !sound; save('sound', sound ? 'on' : 'off');
    if (sound) unlockAudio(); sync();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
    sync();
  });
  window.addEventListener('blur', pause);
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', sync);
  window.addEventListener('orientationchange', () => { pause(); sync(); });
  landscapeTouch.addEventListener('change', () => { pause(); sync(); });
  document.addEventListener('keydown', event => {
    if (event.repeat && [' ', 'Enter'].includes(event.key) &&
        (event.target.matches('.cell') || event.target === $('resume') || event.target === $('pause'))) event.preventDefault();
  });
  function frame() {
    const previous = game.state; game.update();
    if (previous !== game.state) { sync(); $('retry').focus({ preventScroll: true }); }
    if (game.state === 'PLAYING') $('time').textContent = format(game.time());
    requestAnimationFrame(frame);
  }
  sync(); requestAnimationFrame(frame);
})();
