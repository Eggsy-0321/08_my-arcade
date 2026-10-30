"""Optional Playwright/Chromium checks; serve /workspace on localhost:8000 first.
Playwright is only a test tool, not a game dependency.
"""
import os
from arcade_helpers import launch_game
from playwright.sync_api import sync_playwright
BASE = os.environ.get('ARCADE_TEST_URL', 'http://127.0.0.1:8000/08_my-arcade/')
CLOCK = """
window.testNow = 0;
window.testFrames = [];
window.requestAnimationFrame = cb => { window.testFrames.push(cb); return 1; };
performance.now = () => window.testNow;
window.tick = ms => {
  for (let remaining = ms; remaining > 0;) {
    const step = Math.min(remaining, 16);
    remaining -= step;
    window.testNow += step;
    const queue = window.testFrames.splice(0);
    queue.forEach(cb => cb(window.testNow));
  }
};
"""
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    context.add_init_script(CLOCK)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.locator('#game-list .is-selected').wait_for()
    assert page.locator('#game-list .cabinet').count() == 10
    launch_game(page, 'STACK TOWER')
    page.wait_for_function('typeof StackTowerRules !== "undefined"')
    # Observe production rule calls without adding a debug API to the game.
    page.evaluate("""() => {
      const advance = StackTowerRules.advance;
      StackTowerRules.advance = (block, ...args) => { window.testBlock = block; advance(block, ...args); };
      const overlap = StackTowerRules.overlap;
      StackTowerRules.overlap = (...args) => { window.testResult = overlap(...args); return window.testResult; };
      const spawn = StackTowerRules.spawn;
      StackTowerRules.spawn = (below, ...args) => { window.testBelow = below; return spawn(below, ...args); };
    }""")
    page.get_by_role('button', name='START', exact=False).tap()
    page.evaluate('tick(720)')
    page.locator('canvas').tap()
    assert page.locator('#score').inner_text() == '1'
    page.locator('canvas').tap()
    assert page.locator('#score').inner_text() == '1'
    print('PASS: project subpath, card navigation, touch start/place, duplicate input', flush=True)
    def place(offset, key=False):
        page.evaluate('(offset) => { tick(200); testBlock.x = testBelow.x + offset; }', offset)
        if key:
            page.keyboard.press('Space')
        else:
            page.locator('canvas').tap()
        return page.evaluate('window.testResult')
    assert place(0)['perfect']
    assert place(4, key=True)['perfect']
    assert place(-4)['perfect']
    assert not place(4.01)['perfect']
    assert not place(-20)['perfect']
    assert page.locator('#score').inner_text() == '6'
    assert page.locator('#best').inner_text() == '6'
    print('PASS: exact, PERFECT boundaries, partial overlap, Space, scores', flush=True)
    for _ in range(50):
        assert place(0)['perfect']
    assert page.locator('#score').inner_text() == '56'
    page.evaluate('tick(1000)')
    assert page.evaluate('''() => {
      const calls = [], ctx = document.querySelector('canvas').getContext('2d'), original = ctx.fillRect;
      ctx.fillRect = function(...args) { calls.push(args); return original.apply(this,args); };
      tick(16); ctx.fillRect = original;
      return calls.some(([x,y,w,h]) => h === 21 && y > 50 && y < 600);
    }''')
    page.screenshot(path='/tmp/stack-tower-high.png')
    for w, h in [(320, 568), (430, 932), (844, 390), (390, 844)]:
        page.set_viewport_size({'width': w, 'height': h})
        page.wait_for_timeout(80)
        assert place(0)['perfect']
        metrics = page.evaluate('''() => {
          const c = document.querySelector('canvas'), r = c.getBoundingClientRect();
          return { doc: document.documentElement.scrollWidth, viewport: innerWidth,
            pixels: c.width, css: r.width, blockRight: testBlock.x + testBlock.width };
        }''')
        assert metrics['doc'] <= metrics['viewport']
        assert abs(metrics['pixels'] - metrics['css'] * 3) <= 1
        assert metrics['blockRight'] <= metrics['css'] + 0.01
    print('PASS: 56+ floors, camera drawing, resize/orientation, DPR 3, no horizontal overflow', flush=True)
    assert not place(1000)['success']
    assert page.locator('#over-screen').is_visible()
    assert page.locator('#final-score').inner_text() == '60'
    page.screenshot(path='/tmp/stack-tower-over.png')
    page.get_by_role('button', name='RETRY', exact=False).tap()
    assert page.locator('#score').inner_text() == '0'
    assert page.locator('#best').inner_text() == '60'
    assert place(0)['success']
    page.reload()
    assert page.locator('#best').inner_text() == '60'
    page.locator('.home').click()
    page.locator('#game-list .is-selected').wait_for()
    assert page.locator('#game-list .cabinet').count() == 10
    assert 'SAMPLE GAME' not in page.locator('#game-list').inner_text()
    print('PASS: miss, GAME OVER, retry, persisted best, return link, six published games', flush=True)
    assert not errors, errors
    context.close()
    for failure in ['get', 'set']:
        desktop = browser.new_context(viewport={'width': 1280, 'height': 800})
        desktop.add_init_script(CLOCK)
        desktop.add_init_script(f"Storage.prototype.{failure}Item = function() {{ throw new Error('blocked'); }};")
        tab = desktop.new_page()
        tab.goto(BASE + 'games/stack-tower/')
        tab.get_by_role('button', name='START', exact=False).focus()
        tab.keyboard.press('Space')
        tab.evaluate('tick(920)')
        tab.locator('canvas').click()
        assert tab.locator('#score').inner_text() == '1'
        assert tab.locator('#best').inner_text() == '1'
        desktop.close()
    print('PASS: localStorage get/set exceptions, desktop mouse, keyboard start', flush=True)
    browser.close()
