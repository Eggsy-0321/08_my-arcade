"""Run after serving the repository's parent directory on port 8000."""
import os
from playwright.sync_api import sync_playwright
BASE = os.environ.get('ARCADE_TEST_URL', 'http://127.0.0.1:8000/08_my-arcade/')
KEY = 'my-arcade:number-merge:best'
# Capture the instance only in test code; production has no debug API.
INIT = """
window.testNow=0;window.frames=[];
performance.now=()=>testNow;
requestAnimationFrame=cb=>{frames.push(cb);return 1;};
window.tick=ms=>{testNow+=ms;frames.splice(0).forEach(cb=>cb(testNow));};
"""
# Wrap model.js before game.js executes instead of depending on DOMContentLoaded order.
CAPTURE = "\nconst Original=NumberMerge.Game; NumberMerge.Game=class extends Original {constructor(options){super(options);window.g=this;}};"
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    for mobile in [False, True]:
        context = browser.new_context(viewport={'width': 390 if mobile else 1100, 'height': 844}, is_mobile=mobile, has_touch=mobile)
        context.add_init_script(INIT)
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def model_route(route):
            response = route.fetch()
            route.fulfill(response=response, body=response.text() + CAPTURE)
        page.route('**/number-merge/model.js', model_route)
        page.goto(BASE)
        page.locator('#game-list .cabinet').last.wait_for()
        assert page.locator('#game-list .cabinet').count() == 6
        page.get_by_role('link', name='NUMBER MERGEを開く', exact=False).click()
        assert page.locator('#start-best').inner_text() == '--:--.--'
        assert not page.locator('#retry').is_visible() and not page.locator('#home').is_visible()
        page.evaluate('tick(5000)'); assert page.locator('#time').inner_text() == '00:00.00'
        page.locator('#start').click()
        assert page.locator('.tile').count() == 2
        assert not page.locator('#retry').is_visible() and not page.locator('#home').is_visible()
        page.evaluate('tick(1234)'); assert page.locator('#time').inner_text() == '00:01.23'
        for direction, key, dx, dy in [('left','ArrowLeft',-90,0),('right','ArrowRight',90,0),('up','ArrowUp',0,-90),('down','ArrowDown',0,90)]:
            page.evaluate("g.board=[2,0,2,4,...Array(12).fill(0)];g.random=()=>0;")
            if direction == 'up': page.evaluate('g.board=[0,0,0,0,2,0,2,4,...Array(8).fill(0)]')
            if mobile:
                box=page.locator('#board').bounding_box(); x=box['x']+box['width']/2; y=box['y']+box['height']/2
                session=context.new_cdp_session(page)
                session.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
                session.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x+dx,'y':y+dy}]})
                session.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
                session.detach()
            else: page.keyboard.press(key)
            assert page.evaluate('g.board.filter(Boolean).length') == (3 if direction in ['left','right'] else 4)
            assert page.evaluate('scrollY') == 0
        # Invalid input leaves the entire board intact; gestures below threshold are ignored.
        page.evaluate('g.board=[2,4,...Array(14).fill(0)]')
        page.keyboard.press('ArrowLeft'); assert page.evaluate('g.board') == [2,4]+[0]*14
        page.evaluate('g.board=[1024,1024,...Array(14).fill(0)]')
        page.keyboard.press('ArrowLeft')
        assert page.locator('#screen-title').inner_text() == 'GAME CLEAR'
        assert page.locator('#message').inner_text() == 'CLEAR TIME 00:01.23'
        assert page.locator('#new-best').is_visible()
        assert page.locator('#retry').is_visible() and page.locator('#home').is_visible()
        assert page.evaluate(f'localStorage.getItem("{KEY}")') == '1234'
        page.evaluate('tick(1000)'); assert page.locator('#time').inner_text() == '00:01.23'
        page.screenshot(path=f'/tmp/number-merge-clear-{mobile}.png')
        page.locator('#retry').click(); assert page.locator('#time').inner_text() == '00:00.00'
        assert page.locator('.tile').count() == 2
        page.evaluate('tick(2000);g.board=[1024,1024,...Array(14).fill(0)]')
        page.keyboard.press('ArrowLeft'); assert not page.locator('#new-best').is_visible()
        assert page.evaluate(f'localStorage.getItem("{KEY}")') == '1234'
        page.locator('#retry').click(); page.evaluate('tick(500);g.board=[1024,1024,...Array(14).fill(0)]')
        page.keyboard.press('ArrowLeft'); assert page.locator('#new-best').is_visible()
        assert page.evaluate(f'localStorage.getItem("{KEY}")') == '500'
        page.reload()
        assert page.locator('#best').inner_text() == page.locator('#start-best').inner_text() == '00:00.50'
        page.locator('#start').click()
        for w,h in [(320,568),(390,844),(430,932),(844,390),(1100,844)]:
            page.set_viewport_size({'width':w,'height':h})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            if h>w: assert page.locator('#board').bounding_box()['y']+page.locator('#board').bounding_box()['height']<=h
        page.set_viewport_size({'width':390,'height':844})
        page.evaluate('g.board=[2,2,4,8,...Array(12).fill(0)]'); page.keyboard.press('ArrowLeft')
        page.wait_for_timeout(200)
        assert page.locator('.ghost').count()==0
        page.screenshot(path=f'/tmp/number-merge-playing-{mobile}.png')
        page.evaluate('g.board=[2,4,8,16,32,64,128,256,512,2,4,8,16,32,64,0];tick(200)')
        page.keyboard.press('ArrowRight')
        assert page.locator('#screen-title').inner_text()=='GAME OVER'
        assert page.evaluate(f'localStorage.getItem("{KEY}")') == '500'
        final=page.locator('#time').inner_text(); page.evaluate('tick(1000)'); assert page.locator('#time').inner_text()==final
        page.locator('#home').click(); page.locator('#game-list .cabinet').last.wait_for()
        assert page.locator('#game-list .cabinet').count()==6
        assert not errors,errors
        print('PASS', 'mobile native touch' if mobile else 'desktop keyboard', 'timer, clear/over, storage, retry/home, layout, animations')
        context.close()
    for storage in ["Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}})", "Storage.prototype.setItem=function(){throw Error('blocked')}" ]:
        context=browser.new_context()
        context.add_init_script(storage)
        page=context.new_page(); page.route('**/number-merge/model.js', model_route)
        page.goto(BASE+'games/number-merge/'); page.locator('#start').click()
        page.evaluate('g.board=[1024,1024,...Array(14).fill(0)]'); page.keyboard.press('ArrowLeft')
        assert page.locator('#screen-title').inner_text()=='GAME CLEAR'
        assert page.locator('#best').inner_text()!='--:--.--'
        page.locator('#retry').click(); assert page.locator('#overlay').is_hidden()
        context.close()
    print('PASS blocked storage read/write remains playable')
    context=browser.new_context(viewport={'width':320,'height':568}, reduced_motion='reduce')
    page=context.new_page(); page.goto(BASE+'games/number-merge/')
    page.screenshot(path='/tmp/number-merge-start-320.png')
    assert page.locator('#start').bounding_box()['height']>=44
    page.locator('#start').click(); page.wait_for_timeout(120)
    assert page.locator('#time').inner_text()!='00:00.00'
    assert page.evaluate('getComputedStyle(document.querySelector("#board")).touchAction')=='none'
    page.keyboard.press('ArrowRight')
    assert page.evaluate('document.querySelector("#board").getAnimations({subtree:true}).length')==0
    assert page.locator('#overlay').is_hidden()
    context.close()
    print('PASS real animation-frame timer, 320px start screen, reduced motion')
    browser.close()
