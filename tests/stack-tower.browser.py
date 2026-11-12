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
        if page.locator('#pause-overlay').is_visible():
            if w > h:
                assert page.locator('#resume').is_disabled()
                page.set_viewport_size({'width': h, 'height': w})
                page.wait_for_timeout(80)
            page.locator('#resume').tap()
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
    print('PASS: miss, GAME OVER, retry, persisted best, return link, ten published games', flush=True)
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
    # Observe closure values in the test response only; no production debug API.
    ctx = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    ctx.add_init_script(CLOCK)
    def instrument(route):
        response = route.fetch()
        source = response.text().replace('  resize();\n  updateScores();', '''
  window.snapshot = () => JSON.parse(JSON.stringify({state, score, best, tower, moving, camera, pieces, perfectTime, failTime}));
  window.align = x => { moving.x = tower[tower.length - 1].x + x; };
  resize();
  updateScores();''')
        route.fulfill(response=response, body=source)
    ctx.route('**/stack-tower/game.js', instrument)
    tab = ctx.new_page()
    tab.on('pageerror', lambda e: errors.append(str(e)))
    tab.goto(BASE + 'games/stack-tower/')
    # Lifecycle signals must leave START and GAME_OVER alone.
    signals = [('blur','window'), ('pagehide','window'), ('pageshow','window'),
               ('freeze','document'), ('resume','document'), ('orientationchange','window')]
    def signal(name, target):
        tab.evaluate('(v) => (v[1] === "window" ? window : document).dispatchEvent(new Event(v[0]))', [name,target])
    def snap():
        return tab.evaluate('snapshot()')
    for name,target in signals:
        signal(name,target)
        assert snap()['state'] == 'START'
    tab.locator('#start').tap()
    def pause_game():
        tab.locator('#pause').tap()
        assert snap()['state'] == 'PAUSED'
    def resume_game():
        before = snap()
        tab.locator('#resume').tap()
        assert snap() == dict(before, state='PLAYING')
        tab.evaluate('tick(16)')
        assert snap() == dict(before, state='PLAYING')
    # Camera still following, cut piece falling, PERFECT still visible.
    for offset in [0]*25 + [20,0]:
        tab.evaluate('(x) => { tick(200); align(x); }', offset)
        tab.locator('canvas').tap()
    assert snap()['pieces'] and snap()['perfectTime'] > 0 and snap()['camera'] > 0
    pause_game()
    frozen = snap()
    assert tab.locator('#pause-overlay').inner_text().split() == ['PAUSED','RESUME','HOME']
    tab.evaluate('tick(10000)')
    tab.locator('canvas').dispatch_event('pointerdown', {'isPrimary':True,'button':0,'pointerId':91})
    tab.locator('canvas').dispatch_event('pointerup', {'pointerId':91})
    tab.keyboard.press('Space')
    assert snap() == frozen
    resume_game()
    tab.evaluate('tick(16)')
    active = snap()
    assert active['moving']['x'] != frozen['moving']['x']
    assert active['moving']['direction'] == frozen['moving']['direction']
    expected = tab.evaluate('StackTowerRules.speed(snapshot().score)') * .016
    assert abs(abs(active['moving']['x']-frozen['moving']['x']) - expected) < 1e-8
    assert active['camera'] != frozen['camera'] and active['pieces'] != frozen['pieces']
    assert active['perfectTime'] < frozen['perfectTime']
    print('PASS: entire world frozen, effects/camera held, immediate resume and no time jump', flush=True)
    for w,h in [(320,568),(360,640),(390,844),(430,932),(1100,844)]:
        tab.set_viewport_size({'width':w,'height':h})
        tab.wait_for_timeout(80)
        if snap()['state'] == 'PLAYING':
            pause_game()
        assert tab.evaluate('''() => {
          const box = el => el.getBoundingClientRect();
          const p = box(document.querySelector('.pause-panel')), s = box(document.querySelector('#stage'));
          const hud = [...document.querySelector('.hud').children].map(box);
          return p.width === 260 && Math.abs(p.x+p.width/2-s.x-s.width/2)<1
            && Math.abs(p.y+p.height/2-s.y-s.height/2)<1 && p.y>=s.y && p.bottom<=s.bottom
            && [...document.querySelectorAll('#pause,#resume,#pause-home')].every(el => box(el).width>=44 && box(el).height>=44)
            && hud[0].right<=hud[1].left && hud[1].right<=hud[2].left
            && document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight;
        }''')
        tab.screenshot(path=f'/tmp/stack-tower-pause-{w}.png')
        if tab.locator('#resume').is_enabled():
            resume_game()
    print('PASS: five viewport sizes, centered 260px panel, HUD and 44px targets, no overflow', flush=True)
    tab.set_viewport_size({'width':390,'height':844})
    tab.wait_for_timeout(80)
    if snap()['state'] == 'PAUSED':
        resume_game()
    tab.evaluate('tick(200); align(0)')
    cdp = ctx.new_cdp_session(tab)
    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':180,'y':500,'id':1}]})
    count = snap()['score']
    tab.evaluate("document.querySelector('#pause').click(); document.querySelector('#resume').click()")
    cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':190,'y':510,'id':1}]})
    cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
    assert snap()['score'] == count
    tab.evaluate('tick(200); align(0)')
    tab.locator('canvas').tap()
    assert snap()['score'] == count+1
    tab.evaluate('tick(200); align(0)')
    tab.locator('canvas').focus()
    tab.keyboard.down('Space')
    count = snap()['score']
    tab.evaluate('tick(200); align(0)')
    tab.keyboard.down('Space')
    assert snap()['score'] == count
    pause_game()
    resume_game()
    tab.evaluate('tick(200); align(0)')
    tab.keyboard.down('Space')
    assert snap()['score'] == count
    tab.keyboard.up('Space')
    tab.keyboard.press('Space')
    assert snap()['score'] == count+1
    print('PASS: native residual touch, fresh touch/Space, held Space and repeat across pause', flush=True)
    for name,target in signals:
        before = snap()
        signal(name,target)
        signal(name,target)
        tab.evaluate('tick(2000)')
        assert snap() == dict(before,state='PAUSED')
        resume_game()
    before = snap()
    tab.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange'))")
    assert tab.locator('#resume').is_disabled()
    tab.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false}); document.dispatchEvent(new Event('visibilitychange'))")
    assert snap() == dict(before,state='PAUSED')
    resume_game()
    before = snap()
    tab.evaluate('testNow += 60000; const q = testFrames.splice(0); q.forEach(cb => cb(testNow))')
    assert snap() == dict(before,state='PAUSED')
    resume_game()
    portrait = snap()
    portrait_width = tab.locator('canvas').bounding_box()['width']
    tab.set_viewport_size({'width':844,'height':390})
    tab.wait_for_timeout(80)
    assert snap()['state'] == 'PAUSED' and tab.locator('#resume').is_disabled()
    frozen = snap()
    ratio = tab.locator('canvas').bounding_box()['width'] / portrait_width
    for old,new in zip(portrait['tower'] + [portrait['moving']] + portrait['pieces'], frozen['tower'] + [frozen['moving']] + frozen['pieces']):
        assert abs(new['x'] - old['x'] * ratio) < 1e-8
        assert abs(new['width'] - old['width'] * ratio) < 1e-8
        assert new['y'] == old['y']
    assert frozen['camera'] == portrait['camera']
    tab.evaluate("document.querySelector('#resume').click(); tick(1000)")
    assert snap() == frozen
    tab.set_viewport_size({'width':390,'height':844})
    tab.wait_for_timeout(80)
    assert snap()['state'] == 'PAUSED' and snap()['score'] == frozen['score']
    assert tab.locator('#resume').is_enabled()
    resume_game()
    print('PASS: lifecycle/visibility/60s stall, idempotent auto-pause, touch landscape resume lock', flush=True)
    pause_game()
    tab.locator('#pause-home').tap()
    tab.locator('#game-list .is-selected').wait_for()
    tab.goto(BASE+'games/stack-tower/')
    tab.locator('#start').tap()
    tab.evaluate('tick(200); align(1000)')
    tab.locator('canvas').tap()
    assert snap()['state'] == 'GAME_OVER'
    for name,target in signals:
        signal(name,target)
        assert snap()['state'] == 'GAME_OVER'
    ctx.close()
    # Exercise actual rAF and wall clock as well as deterministic state checks.
    real = browser.new_context(viewport={'width':1100,'height':844})
    live = real.new_page()
    live.goto(BASE+'games/stack-tower/')
    live.locator('#start').click()
    live.wait_for_timeout(250)
    live.locator('#pause').click()
    assert live.locator('.pause-panel').bounding_box()['width'] == 260
    assert live.locator('#resume').is_enabled()
    image = live.locator('canvas').screenshot()
    live.wait_for_timeout(250)
    assert live.locator('canvas').screenshot() == image
    live.locator('#resume').click()
    live.wait_for_timeout(100)
    assert live.locator('canvas').screenshot() != image
    real.close()
    assert not errors, errors
    print('PASS: pause HOME, lifecycle guards, real requestAnimationFrame pause/resume', flush=True)
    browser.close()
