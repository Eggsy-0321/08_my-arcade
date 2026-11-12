'use strict';

(() => {
  const { Game, format } = NumberMerge;
  const $ = id => document.getElementById(id), board = $('board');
  const key = 'my-arcade:number-merge:best';
  let stored;
  try { stored = localStorage.getItem(key); } catch { /* Storage is optional. */ }
  let best = stored !== null && stored !== undefined && stored.trim() !== '' && Number.isFinite(Number(stored)) && Number(stored) >= 0 ? Number(stored) : null;
  const game = new Game();
  let drag = null, newBest = false, lastFrame = null;
  const animations = new Set();
  const landscapeTouch = matchMedia('(orientation: landscape) and (pointer: coarse)');
  function animate(element, frames, options, finish = () => {}) {
    const animation = element.animate(frames, options);
    animations.add(animation);
    animation.onfinish = () => { animations.delete(animation); finish(); };
    animation.oncancel = () => animations.delete(animation);
  }
  function clearDrag() {
    const id = drag?.id;
    drag = null; // Clear first: releasing capture can dispatch lostpointercapture.
    if (id !== undefined && board.hasPointerCapture(id)) board.releasePointerCapture(id);
  }
  function pause(at = performance.now()) {
    if (game.state !== 'PLAYING') return;
    if (lastFrame !== null && at - lastFrame > 1000) at = lastFrame;
    game.pause(at); clearDrag();
    for (const animation of animations) animation.pause();
    sync(); $('resume').focus({ preventScroll: true });
  }
  function resume() {
    if (game.state !== 'PAUSED' || document.hidden || landscapeTouch.matches) return;
    clearDrag(); game.resume(); lastFrame = performance.now();
    for (const animation of animations) animation.play();
    sync(); board.focus({ preventScroll: true });
  }
  function checkInterruption(now = performance.now()) {
    // Exclude an unobserved sleep interval, including input arriving before the next frame.
    if (game.state === 'PLAYING' && lastFrame !== null && now - lastFrame > 1000) pause(lastFrame);
  }
  function orientationChanged() { pause(); sync(); }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function tile(value, index, ghost = false) {
    const element = document.createElement('div');
    element.className = ghost ? 'tile ghost' : 'tile'; element.dataset.value = value;
    element.style.setProperty('--col', index % 4); element.style.setProperty('--row', Math.floor(index / 4));
    element.textContent = value;
    if (ghost) element.setAttribute('aria-hidden', 'true');
    else element.setAttribute('aria-label', `${Math.floor(index / 4) + 1}行${index % 4 + 1}列: ${value}`);
    board.append(element); return element;
  }
  function render(result = {}) {
    for (const animation of animations) animation.cancel();
    animations.clear();
    board.replaceChildren();
    for (let i = 0; i < 16; i++) { const cell = document.createElement('div'); cell.className = 'cell'; cell.setAttribute('aria-hidden', 'true'); board.append(cell); }
    const step = (board.clientWidth - 12) / 4;
    game.board.forEach((value, i) => {
      if (!value) return;
      const element = tile(value, i), motion = result.motions?.find(m => m.to === i && !m.consumed);
      if (reducedMotion.matches) return;
      if (motion) {
        const dx = (motion.from % 4 - i % 4) * step, dy = (Math.floor(motion.from / 4) - Math.floor(i / 4)) * step;
        animate(element, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)', offset: .7 },
          { transform: motion.merged ? 'scale(1.1)' : 'scale(1)', offset: .85 }, { transform: 'scale(1)' }], { duration: 160 });
      } else if (result.spawned === i) animate(element, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 160 });
    });
    if (!reducedMotion.matches) result.motions?.filter(m => m.consumed).forEach(m => {
      const ghost = tile(m.value, m.to, true);
      const dx = (m.from % 4 - m.to % 4) * step, dy = (Math.floor(m.from / 4) - Math.floor(m.to / 4)) * step;
      animate(ghost, [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 1 }, { transform: 'translate(0, 0)', opacity: 0 }], { duration: 120 }, () => ghost.remove());
    });
  }
  function sync() {
    $('time').textContent = format(game.time());
    $('best').textContent = $('start-best').textContent = best === null ? '--:--.--' : format(best);
    const ended = ['GAME CLEAR', 'GAME OVER'].includes(game.state);
    $('overlay').hidden = game.state === 'PLAYING' || game.state === 'PAUSED';
    $('pause-overlay').hidden = game.state !== 'PAUSED';
    $('pause').disabled = game.state !== 'PLAYING';
    $('resume').disabled = document.hidden || landscapeTouch.matches;
    $('start').hidden = game.state !== 'START';
    $('result-actions').hidden = !ended;
    $('hint').hidden = ended;
    $('new-best').hidden = !newBest;
    if (ended) {
      $('screen-title').textContent = game.state;
      $('message').textContent = game.state === 'GAME CLEAR' ? `CLEAR TIME ${format(game.time())}` : '動かせるタイルがありません。';
    }
  }
  function start() {
    newBest = false; clearDrag(); game.start(); lastFrame = performance.now(); render(); sync();
    $('status').textContent = 'ゲーム開始。2048を目指しましょう。'; board.focus({ preventScroll: true });
  }
  function move(direction) {
    checkInterruption();
    const result = game.move(direction);
    if (!result.changed) return;
    if (game.state === 'GAME CLEAR' && (best === null || game.time() < best)) {
      newBest = true; best = game.time();
      try { localStorage.setItem(key, String(best)); } catch { /* Keep the session best. */ }
    }
    render(result); sync();
    if (game.state !== 'PLAYING') {
      $('status').textContent = `${game.state} ${$('message').textContent}${newBest ? ' 自己ベスト更新' : ''}`;
      $('retry').focus({ preventScroll: true });
    }
  }
  $('pause').addEventListener('click', () => pause());
  $('resume').addEventListener('click', resume);
  $('start').addEventListener('click', start); $('retry').addEventListener('click', start);
  document.addEventListener('keydown', e => {
    const directions = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (game.state !== 'PLAYING' || !directions[e.key] || e.altKey || e.ctrlKey || e.metaKey || e.target.closest('input, textarea, select')) return;
    e.preventDefault(); if (!e.repeat) move(directions[e.key]);
  });
  board.addEventListener('pointerdown', e => {
    checkInterruption();
    if (game.state !== 'PLAYING' || drag || !e.isPrimary || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; board.setPointerCapture(e.pointerId); e.preventDefault();
  });
  board.addEventListener('pointerup', e => {
    checkInterruption();
    if (game.state !== 'PLAYING' || drag?.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; clearDrag();
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  const cancel = e => { if (drag?.id === e.pointerId) drag = null; };
  board.addEventListener('pointercancel', cancel); board.addEventListener('lostpointercapture', cancel);
  window.addEventListener('blur', () => pause());
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); sync(); });
  window.addEventListener('pagehide', () => pause());
  window.addEventListener('pageshow', () => { pause(); sync(); });
  document.addEventListener('freeze', () => pause());
  document.addEventListener('resume', () => { pause(); sync(); });
  window.addEventListener('orientationchange', orientationChanged);
  screen.orientation?.addEventListener('change', orientationChanged);
  landscapeTouch.addEventListener('change', orientationChanged);
  function frame() {
    const now = performance.now();
    checkInterruption(now); lastFrame = now;
    if (game.state === 'PLAYING') $('time').textContent = format(game.time());
    requestAnimationFrame(frame);
  }
  render(); sync(); requestAnimationFrame(frame);
})();
