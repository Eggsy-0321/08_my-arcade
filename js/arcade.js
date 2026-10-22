'use strict';

(() => {
  const list = document.querySelector('#game-list');
  const status = document.querySelector('#load-status');
  const count = document.querySelector('#game-count');
  const selection = document.querySelector('#game-selection');
  const play = document.querySelector('#play-game');
  const previous = document.querySelector('#previous-game');
  const next = document.querySelector('#next-game');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let games = [];
  let cabinets = [];
  let selected = 0;
  let moving = false;
  let suppressClickUntil = 0;
  let gesture = null;

  // JSON paths are relative to the portal, even when hosted in a Pages subdirectory.
  function localPath(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const path = value.trim();
    if (/^(?:[a-z][a-z\d+.-]*:|[\\/]|[?#])/i.test(path) || path.includes('\\')) return null;
    const base = new URL('./', document.baseURI);
    const resolved = new URL(path, base);
    if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) return null;
    return resolved.href;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function cabinet(game, index) {
    const link = element('a', 'cabinet');
    link.href = localPath(game.url);
    link.draggable = false;
    link.setAttribute('aria-label', `${game.title}を開く：${game.description}`);
    const top = element('div', 'cabinet-marquee');
    top.append(element('span', 'marquee-star', '✦'), element('span', 'marquee-title', game.title), element('span', 'marquee-star', '✦'));
    const bezel = element('div', 'cabinet-bezel');
    const screen = element('div', 'cabinet-screen');
    const fallback = element('div', 'screen-fallback');
    fallback.setAttribute('aria-hidden', 'true');
    fallback.append(element('img', 'pixel-scene'));
    fallback.firstChild.src = './assets/pixel-scene.svg';
    screen.append(fallback);
    const thumbnail = localPath(game.thumbnail);
    if (thumbnail) {
      const img = element('img', 'game-thumbnail');
      img.alt = '';
      img.addEventListener('error', () => img.remove(), { once: true });
      img.src = thumbnail;
      screen.append(img);
    }
    screen.append(element('span', 'screen-prompt', 'PRESS TO START'));
    bezel.append(screen, element('span', 'screen-label', 'MY ARCADE • SYSTEM 01'));
    const controls = element('div', 'cabinet-controls');
    controls.setAttribute('aria-hidden', 'true');
    controls.append(element('span', 'joystick'), element('span', 'control-button pink'), element('span', 'control-button cyan'));
    const panel = element('div', 'cabinet-panel');
    panel.append(element('span', 'cabinet-category', game.category));
    const bottom = element('div', 'cabinet-bottom');
    bottom.append(element('span', 'cabinet-number', `NO. ${String(index + 1).padStart(2, '0')}`), element('span', 'play-label', 'PLAY ↗'));
    panel.append(bottom);
    link.append(top, bezel, controls, panel, element('div', 'cabinet-feet'));
    return link;
  }

  function updateSelection() {
    const game = games[selected % games.length];
    cabinets.forEach((node, index) => {
      let offset = (index - selected + cabinets.length) % cabinets.length;
      if (offset > cabinets.length / 2) offset -= cabinets.length;
      // Reposition the invisible back of the ring without sweeping across the front.
      const oldOffset = Number(node.dataset.offset);
      node.classList.toggle('reposition', Math.abs(offset - oldOffset) > 1);
      node.dataset.offset = offset;
      node.style.setProperty('--offset', offset);
      node.classList.toggle('is-selected', offset === 0);
      node.classList.toggle('is-neighbor', Math.abs(offset) === 1);
      node.tabIndex = offset === 0 ? 0 : -1;
      node.setAttribute('aria-hidden', String(Math.abs(offset) > 1));
      node.setAttribute('aria-label', offset === 0
        ? `${game.title}を開く：${game.description}`
        : `${games[index % games.length].title}を選択`);
      if (offset === 0) node.setAttribute('aria-current', 'true');
      else node.removeAttribute('aria-current');
    });
    count.textContent = `${String(selected % games.length + 1).padStart(2, '0')} / ${String(games.length).padStart(2, '0')}`;
    document.querySelector('#selected-title').textContent = game.title;
    document.querySelector('#selected-description').textContent = game.description;
    play.href = localPath(game.url);
    play.setAttribute('aria-label', `${game.title}をPLAY`);
  }

  function move(direction) {
    if (moving || games.length < 2) return;
    moving = true;
    const refocus = cabinets.includes(document.activeElement);
    selected = (selected + direction + cabinets.length) % cabinets.length;
    updateSelection();
    if (refocus) cabinets[selected].focus({ preventScroll: true });
    // A fixed guard also works when a transition is cancelled by resizing/backgrounding.
    setTimeout(() => { moving = false; }, reducedMotion.matches ? 0 : 250);
  }

  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  play.addEventListener('click', event => {
    if (moving || performance.now() < suppressClickUntil) event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
        event.target.closest('input, textarea, select, [contenteditable="true"]') || !games.length) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (!event.repeat) move(event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.key === 'Enter' &&
        !event.target.closest('a, button')) {
      event.preventDefault();
      if (!event.repeat && !moving) play.click();
    }
  });

  list.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  });
  window.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 10) gesture.moved = true;
  });
  window.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.moved || Math.hypot(dx, dy) > 10) {
      suppressClickUntil = performance.now() + 450;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) move(dx < 0 ? 1 : -1);
    }
    gesture = null;
  });
  window.addEventListener('pointercancel', () => {
    if (gesture) suppressClickUntil = performance.now() + 450;
    gesture = null;
  });

  async function loadGames() {
    try {
      const response = await fetch('./data/games.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Game data must be an array');
      const published = data.filter(game => game && game.status === 'published');
      const ids = new Set();
      for (const game of published) {
        if (!['id', 'title', 'description', 'category'].every(key => typeof game[key] === 'string' && game[key].trim()) ||
            !localPath(game.url) || ids.has(game.id)) throw new Error('Invalid published game');
        ids.add(game.id);
      }
      games = published;
      const fragment = document.createDocumentFragment();
      // Two games need mirrored neighbors so either direction has the same animation.
      const ring = games.length === 2 ? [...games, ...games] : games;
      cabinets = ring.map((game, index) => {
        const node = cabinet(game, index % games.length);
        node.addEventListener('click', event => {
          const offset = Number(node.dataset.offset);
          if (moving || performance.now() < suppressClickUntil) event.preventDefault();
          else if (offset !== 0) {
            event.preventDefault();
            move(Math.sign(offset));
          }
        });
        fragment.append(node);
        return node;
      });
      list.replaceChildren(fragment);
      count.textContent = '00 / 00';
      selection.hidden = !games.length;
      list.hidden = !games.length;
      previous.disabled = next.disabled = games.length < 2;
      if (games.length) updateSelection();
      status.textContent = published.length ? '' : 'ただいま準備中です。ゲームの追加をお楽しみに。';
      status.hidden = published.length > 0;
    } catch (error) {
      list.hidden = true;
      count.textContent = 'OFFLINE';
      status.textContent = 'ゲーム一覧を読み込めませんでした。通信環境を確認し、ページを再読み込みしてください。';
      status.classList.add('is-error');
      console.error('Game list could not be loaded:', error);
    } finally {
      list.setAttribute('aria-busy', 'false');
    }
  }

  loadGames();
})();
