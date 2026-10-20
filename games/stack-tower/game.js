'use strict';

(() => {
  const rules = StackTowerRules;
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const stage = document.querySelector('#stage');
  const scoreText = document.querySelector('#score');
  const bestText = document.querySelector('#best');
  const startScreen = document.querySelector('#start-screen');
  const overScreen = document.querySelector('#over-screen');
  const feedback = document.querySelector('#feedback');
  const startButton = document.querySelector('#start');
  const retryButton = document.querySelector('#retry');
  const STORAGE_KEY = 'my-arcade.stack-tower.best';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = ['#7ce8e5', '#83bcff', '#b699f0', '#ff91c3', '#ffb282', '#f4df86'];
  let state = 'START';
  let width = 0, height = 0, dpr = 1;
  let score = 0, best = readBest(), tower = [], moving = null;
  let camera = 0, pieces = [], perfectTime = 0, failTime = 0;
  let previousTime = null, lastInput = -Infinity;

  function readBest() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    } catch { return 0; }
  }
  function updateScores() {
    scoreText.textContent = score;
    bestText.textContent = best;
  }
  function saveBest() {
    if (score <= best) return;
    best = score;
    try { localStorage.setItem(STORAGE_KEY, String(best)); } catch { /* Session best still works. */ }
  }
  function base() {
    const blockWidth = width * 0.52;
    return { x: (width - blockWidth) / 2, width: blockWidth, y: 0, level: 0 };
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const nextWidth = bounds.width;
    if (!nextWidth || !bounds.height) return;
    if (width) {
      const ratio = nextWidth / width;
      for (const block of [...tower, ...(moving ? [moving] : []), ...pieces]) {
        block.x *= ratio;
        block.width *= ratio;
      }
    }
    width = nextWidth;
    height = bounds.height;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (!tower.length) tower = [base()];
  }
  function start() {
    state = 'PLAYING';
    score = 0;
    tower = [base()];
    moving = rules.spawn(tower[0], score, width);
    camera = 0;
    pieces = [];
    perfectTime = failTime = 0;
    feedback.textContent = '';
    lastInput = performance.now();
    previousTime = null;
    startScreen.hidden = overScreen.hidden = true;
    updateScores();
    canvas.focus({ preventScroll: true });
  }
  function fragment(block, cut = block) {
    if (reducedMotion.matches || cut.width <= 0) return;
    pieces.push({ ...block, ...cut, fall: 0, velocity: 40, age: 0 });
  }
  function gameOver() {
    fragment(moving);
    moving = null;
    state = 'GAME_OVER';
    failTime = 0.45;
    feedback.textContent = '';
    perfectTime = 0;
    document.querySelector('#final-score').textContent = score;
    document.querySelector('#final-best').textContent = best;
    overScreen.hidden = false;
    retryButton.focus({ preventScroll: true });
  }
  function place(now) {
    if (state !== 'PLAYING' || document.hidden || now - lastInput < 140) return;
    lastInput = now;
    const below = tower[tower.length - 1];
    const result = rules.overlap(moving, below);
    if (!result.success) { gameOver(); return; }
    if (result.cut) fragment(moving, result.cut);
    tower.push({ x: result.x, width: result.width, y: moving.y, level: moving.level });
    score += 1;
    saveBest();
    updateScores();
    if (result.perfect) {
      feedback.textContent = 'PERFECT!';
      perfectTime = 0.65;
    }
    moving = rules.spawn(tower[tower.length - 1], score, width);
    // Blocks far below the visible world can never participate in a later collision.
    const lowestVisible = moving.y - height - rules.HEIGHT * 3;
    tower = tower.filter(block => block.y >= lowestVisible);
  }
  function updateEffects(seconds) {
    for (const piece of pieces) {
      piece.age += seconds;
      piece.velocity += 950 * seconds;
      piece.fall += piece.velocity * seconds;
    }
    pieces = pieces.filter(piece => piece.age < 1.6);
    if (perfectTime > 0) {
      perfectTime -= seconds;
      if (perfectTime <= 0) feedback.textContent = '';
    }
    failTime = Math.max(0, failTime - seconds);
  }
  function update(seconds) {
    if (state === 'PLAYING') rules.advance(moving, seconds, rules.speed(score), width);
    const top = moving || tower[tower.length - 1];
    const target = Math.max(0, top.y - (height - 76) * 0.55);
    camera += (target - camera) * (1 - Math.exp(-10 * seconds));
    updateEffects(seconds);
  }
  function drawBlock(block, falling = false) {
    const y = height - 54 - block.y + camera + (falling ? block.fall : 0);
    if (y > height + rules.HEIGHT || y < -rules.HEIGHT) return;
    const x = block.x;
    ctx.fillStyle = colors[block.level % colors.length];
    ctx.fillRect(x, y, block.width, rules.HEIGHT - 1);
    ctx.fillStyle = '#ffffff55';
    ctx.fillRect(x, y, block.width, 3);
    ctx.fillStyle = '#00000033';
    ctx.fillRect(x, y + rules.HEIGHT - 5, block.width, 4);
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#111324';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#25243b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 20; x < width; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = (camera % 40); y < height; y += 40) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
    ctx.fillStyle = '#4b445f';
    ctx.fillRect(0, height - 31 + camera, width, 3);
    tower.forEach(block => drawBlock(block));
    pieces.forEach(piece => drawBlock(piece, true));
    if (moving) drawBlock(moving);
    if (failTime > 0) {
      ctx.fillStyle = `rgba(255, 70, 120, ${failTime * 0.65})`;
      ctx.fillRect(0, 0, width, height);
    }
    stage.style.borderColor = failTime > 0 ? '#ff6499' : '#4b445f';
  }
  function frame(now) {
    // Pause hidden tabs and cap stall recovery to avoid an unreactable jump.
    const seconds = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    if (!document.hidden) {
      if (dpr !== (window.devicePixelRatio || 1)) resize();
      update(seconds);
      draw();
    }
    requestAnimationFrame(frame);
  }

  startButton.addEventListener('click', start);
  retryButton.addEventListener('click', start);
  // Use one pointer event path, never a touchstart + synthetic click pair.
  stage.addEventListener('pointerdown', event => {
    if (event.target !== canvas || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    place(performance.now());
  });
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey) return;
    // Native button keyboard activation is handled by its click listener.
    if (event.target.closest('button, a')) return;
    event.preventDefault();
    if (event.repeat) return;
    if (state === 'PLAYING') place(performance.now());
  });
  document.addEventListener('visibilitychange', () => { previousTime = null; });
  new ResizeObserver(resize).observe(stage);
  resize();
  updateScores();
  requestAnimationFrame(frame);
})();
