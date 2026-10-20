'use strict';

(() => {
  const list = document.querySelector('#game-list');
  const status = document.querySelector('#load-status');
  const count = document.querySelector('#game-count');

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
    panel.append(element('span', 'cabinet-category', game.category), element('h3', 'cabinet-title', game.title), element('p', 'cabinet-description', game.description));
    const bottom = element('div', 'cabinet-bottom');
    bottom.append(element('span', 'cabinet-number', `NO. ${String(index + 1).padStart(2, '0')}`), element('span', 'play-label', 'PLAY ↗'));
    panel.append(bottom);
    link.append(top, bezel, controls, panel, element('div', 'cabinet-feet'));
    return link;
  }

  async function loadGames() {
    try {
      const response = await fetch('./data/games.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const games = await response.json();
      if (!Array.isArray(games)) throw new Error('Game data must be an array');
      const published = games.filter(game => game && game.status === 'published');
      const ids = new Set();
      for (const game of published) {
        if (!['id', 'title', 'description', 'category'].every(key => typeof game[key] === 'string' && game[key].trim()) ||
            !localPath(game.url) || ids.has(game.id)) throw new Error('Invalid published game');
        ids.add(game.id);
      }
      const fragment = document.createDocumentFragment();
      published.forEach((game, index) => fragment.append(cabinet(game, index)));
      list.replaceChildren(fragment);
      count.textContent = `${String(published.length).padStart(2, '0')} GAME${published.length === 1 ? '' : 'S'} / 遊べる筐体`;
      status.textContent = published.length ? '' : 'ただいま準備中です。ゲームの追加をお楽しみに。';
      status.hidden = published.length > 0;
    } catch (error) {
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
