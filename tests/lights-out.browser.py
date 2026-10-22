"""Optional Playwright checks; serve the repository's parent on localhost:8000."""
import os
from arcade_helpers import launch_game
from playwright.sync_api import sync_playwright
BASE = os.environ.get('ARCADE_TEST_URL', 'http://127.0.0.1:8000/08_my-arcade/')
CLOCK = """
window.testNow=0;window.frames=[];
requestAnimationFrame=cb=>{frames.push(cb);return 1;};performance.now=()=>testNow;
window.tick=ms=>{testNow+=ms;frames.splice(0).forEach(cb=>cb(testNow));};
"""
OBSERVE = """() => {
  const start=LightsOut.Game.prototype.start;
  LightsOut.Game.prototype.start=function(){window.g=this;return start.call(this);};
}"""
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    for mobile in [False, True]:
        context = browser.new_context(viewport={'width': 390 if mobile else 1100, 'height': 844}, is_mobile=mobile, has_touch=mobile)
        context.add_init_script(CLOCK)
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE); page.locator('#game-list .is-selected').wait_for()
        assert page.locator('#game-list .cabinet').count() == 7
        launch_game(page, 'LIGHTS OUT')
        assert page.locator('#message').inner_text() == 'タップで十字に反転\nすべて点灯でクリア！'
        assert page.locator('#sound').inner_text() == 'SOUND ON'
        assert page.locator('.cell').count() == 25
        page.evaluate('tick(5000)'); assert page.locator('#time').inner_text() == '00:00.00'
        page.evaluate(OBSERVE); page.locator('#start').click()
        initial = page.evaluate('g.board.slice()')
        def activate(locator):
            locator.tap() if mobile else locator.click()
        activate(page.locator('.cell').nth(12)); assert page.locator('#moves').inner_text() == '1'
        page.evaluate('tick(1234)'); assert page.locator('#time').inner_text() == '00:01.23'
        page.locator('#reset').click(); assert page.evaluate('g.board') == initial
        assert page.locator('#moves').inner_text() == '0'; assert page.locator('#time').inner_text() == '00:00.00'
        page.evaluate('tick(500)'); page.locator('#pause').click()
        assert page.locator('#board').get_attribute('class') == 'concealed'
        assert page.locator('.cell:enabled').count() == 0
        page.evaluate('g.move(12); g.reset(); tick(9000)')
        assert page.evaluate('g.board') == initial; assert page.locator('#time').inner_text() == '00:00.50'
        page.locator('#resume').click(); page.evaluate('tick(250)')
        assert page.locator('#time').inner_text() == '00:00.75'
        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));tick(7000)")
        assert page.evaluate('g.state') == 'PAUSED'
        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));tick(4000)")
        assert page.evaluate('g.state') == 'PAUSED'; assert page.locator('#time').inner_text() == '00:00.75'
        page.locator('#resume').click()
        # Observe real Web Audio calls; the game must also work when audio is unavailable.
        page.evaluate("() => {window.tones=0;if(window.AudioContext){const create=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){tones++;return create.call(this);};}}")
        activate(page.locator('.cell').nth(0)); page.wait_for_timeout(80)
        audio_supported = page.evaluate('!!window.AudioContext')
        if audio_supported: assert page.evaluate('tones') == 1
        page.locator('#sound').click(); activate(page.locator('.cell').nth(0))
        if audio_supported: assert page.evaluate('tones') == 1
        assert page.evaluate('localStorage.getItem("my-arcade:lights-out:sound")') == 'off'
        page.locator('#sound').click()
        page.locator('#pause').click(); before = page.evaluate('tones')
        page.evaluate('document.querySelector(".cell").click()'); assert page.evaluate('tones') == before
        page.locator('#resume').click(); page.locator('#reset').click(); page.evaluate('tick(2500)')
        # Solve the generated puzzle through actual touch/click inputs.
        for index in page.evaluate('g.selected.slice()'):
            if page.evaluate('g.state') == 'PLAYING': activate(page.locator('.cell').nth(index))
        assert page.evaluate('g.state') == 'WAVE'; assert page.evaluate('g.time()') == 2500
        saved_moves = page.evaluate('g.moves')
        assert page.locator('#board.wave').is_visible()
        assert page.locator('.cell:enabled').count() == 0
        for name in ['reset', 'pause', 'sound']: assert page.locator('#' + name).is_disabled()
        page.evaluate('g.reset();g.pause();g.start();tick(999)'); assert page.evaluate('g.state') == 'WAVE'
        page.evaluate('tick(1)'); assert page.locator('#screen-title').inner_text() == 'CLEAR!'
        assert page.locator('#final-time').inner_text() == '00:02.50'
        assert page.locator('#moves-record').inner_text() == 'FIRST RECORD'
        assert page.locator('#time-record').inner_text() == 'FIRST RECORD'
        def check_actions():
            retry=page.locator('#retry').bounding_box(); home=page.locator('#home').bounding_box()
            assert retry and home and home['height'] >= 44 and home['y'] >= retry['y'] + retry['height'] + 8
            assert home['x'] >= 0 and home['x'] + home['width'] <= page.evaluate('innerWidth')
        check_actions()
        # Controlled completions verify independent records and ties without depending on puzzle difficulty.
        def complete(moves, duration):
            page.locator('#retry').click()
            page.evaluate('''({moves,duration})=>{g.board=Array(25).fill(true);LightsOut.flip(g.board,0);g.moves=moves-1;tick(duration);}''', {'moves': moves, 'duration': duration})
            activate(page.locator('.cell').nth(0)); page.evaluate('tick(1000)')
        complete(saved_moves + 2, 1500)
        assert page.locator('#best-moves').inner_text() == str(saved_moves)
        assert page.locator('#best-time').inner_text() == '00:01.50'
        assert page.locator('#time-record').inner_text() == 'NEW BEST!'
        complete(1, 3000)
        assert page.locator('#best-moves').inner_text() == '1'
        assert page.locator('#best-time').inner_text() == '00:01.50'
        complete(1, 1500)
        assert page.locator('#moves-record').inner_text() == page.locator('#time-record').inner_text() == 'BEST TIE'
        page.locator('#sound').click(); page.reload()
        assert page.locator('#start').is_visible(); assert page.locator('#time').inner_text() == '00:00.00'
        assert page.locator('#sound').inner_text() == 'SOUND OFF'
        assert page.evaluate('localStorage.getItem("my-arcade:lights-out:best-moves")') == '1'
        assert page.evaluate('localStorage.getItem("my-arcade:lights-out:best-time")') == '1500'
        page.evaluate(OBSERVE); page.locator('#start').click()
        for width, height in [(320,568), (360,640), (390,844), (430,932), (1100,844)]:
            page.set_viewport_size({'width':width,'height':height})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert page.locator('#sound').bounding_box()['y'] + page.locator('#sound').bounding_box()['height'] <= height
            cell = page.locator('.cell').first.bounding_box(); assert min(cell['width'], cell['height']) >= 44
        page.set_viewport_size({'width':390 if mobile else 1100,'height':844})
        old = page.evaluate('g.initial.slice()')
        page.evaluate('g.board=Array(25).fill(true);LightsOut.flip(g.board,0);tick(1000)')
        activate(page.locator('.cell').first); page.evaluate('tick(1000)')
        page.screenshot(path=f'/tmp/lights-out-clear-{mobile}.png'); check_actions()
        page.locator('#retry').click(); assert page.evaluate('g.initial') != old
        page.screenshot(path=f'/tmp/lights-out-play-{mobile}.png')
        page.evaluate('g.board=Array(25).fill(true);LightsOut.flip(g.board,0);tick(1000)')
        activate(page.locator('.cell').first); page.evaluate('tick(1000)')
        page.locator('#home').click(); page.wait_for_url(BASE+'index.html')
        assert not errors, errors
        context.close()
        print('PASS:', 'Android touch emulation' if mobile else 'PC mouse', 'navigation, puzzle, timer, reset, pause, visibility, wave, independent records, ties, audio, reload, retry, layout', flush=True)
    for failure in ['storage-get', 'storage-set', 'audio-missing', 'audio-throws', 'audio-rejects', 'invalid-records']:
        context=browser.new_context(); context.add_init_script(CLOCK)
        if failure.startswith('storage-'):
            method = 'getItem' if failure.endswith('get') else 'setItem'
            context.add_init_script(f'Storage.prototype.{method}=function(){{throw new Error("blocked")}}')
        elif failure == 'audio-missing': context.add_init_script('window.AudioContext=undefined;window.webkitAudioContext=undefined;')
        elif failure == 'audio-throws': context.add_init_script('window.AudioContext=class{constructor(){throw new Error("unsupported")}}')
        elif failure == 'audio-rejects': context.add_init_script('window.AudioContext=class{state="suspended";resume(){return Promise.reject(new Error("blocked"))}}')
        page=context.new_page(); errors=[]; page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(BASE+'games/lights-out/')
        if failure == 'invalid-records':
            page.evaluate('localStorage.setItem("my-arcade:lights-out:best-moves","1.5");localStorage.setItem("my-arcade:lights-out:best-time","NaN")');page.reload()
        page.evaluate(OBSERVE);page.locator('#start').click();page.evaluate('tick(1000)')
        for index in page.evaluate('g.selected.slice()'):
            if page.evaluate('g.state') == 'PLAYING': page.locator('.cell').nth(index).click()
        page.evaluate('tick(1000)');assert page.locator('#home').is_visible()
        assert page.locator('#moves-record').inner_text() == 'FIRST RECORD'
        assert page.locator('#time-record').inner_text() == 'FIRST RECORD'
        assert not errors, errors
        context.close();print('PASS:',failure,flush=True)
    # Real animation frames, rather than the controlled clock, also complete the wave.
    context=browser.new_context();page=context.new_page();page.goto(BASE+'games/lights-out/');page.evaluate(OBSERVE)
    page.locator('#start').click()
    for index in page.evaluate('g.selected.slice()'):
        if page.evaluate('g.state') == 'PLAYING': page.locator('.cell').nth(index).click()
    page.locator('#retry').wait_for(state='visible');assert page.evaluate('g.state') == 'CLEAR'
    context.close();browser.close()
    print('PASS: real-time wave completion',flush=True)
