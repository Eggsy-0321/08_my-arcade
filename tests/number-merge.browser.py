"""Run after serving the repository's parent directory on port 8000."""
import os
from arcade_helpers import launch_game
from playwright.sync_api import sync_playwright
BASE = os.environ.get('ARCADE_TEST_URL', 'http://127.0.0.1:8000/08_my-arcade/')
KEY = 'my-arcade:number-merge:best'
# Capture the instance only in test code; production has no debug API.
INIT = """
window.testNow=0;window.frames=[];
performance.now=()=>testNow;
requestAnimationFrame=cb=>{frames.push(cb);return 1;};
window.rawTick=ms=>{testNow+=ms;frames.splice(0).forEach(cb=>cb(testNow));};
window.tick=ms=>{while(ms>0){const step=Math.min(ms,100);rawTick(step);ms-=step;}};
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
        page.locator('#game-list .is-selected').wait_for()
        assert page.locator('#game-list .cabinet').count() == 10
        launch_game(page, 'NUMBER MERGE')
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
        for w,h in [(320,568),(360,640),(390,844),(430,932),(844,390),(1100,844)]:
            page.set_viewport_size({'width':w,'height':h})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            if h>w: assert page.locator('#board').bounding_box()['y']+page.locator('#board').bounding_box()['height']<=h
        page.set_viewport_size({'width':390,'height':844})
        if page.evaluate('g.state') == 'PAUSED': page.locator('#resume').click()
        page.evaluate('g.board=[2,2,4,8,...Array(12).fill(0)]'); page.keyboard.press('ArrowLeft')
        page.wait_for_timeout(200)
        assert page.locator('.ghost').count()==0
        page.screenshot(path=f'/tmp/number-merge-playing-{mobile}.png')
        page.evaluate('g.board=[2,4,8,16,32,64,128,256,512,2,4,8,16,32,64,0];tick(200)')
        page.keyboard.press('ArrowRight')
        assert page.locator('#screen-title').inner_text()=='GAME OVER'
        assert page.evaluate(f'localStorage.getItem("{KEY}")') == '500'
        final=page.locator('#time').inner_text(); page.evaluate('tick(1000)'); assert page.locator('#time').inner_text()==final
        page.locator('#home').click(); page.locator('#game-list .is-selected').wait_for()
        assert page.locator('#game-list .cabinet').count()==10
        assert not errors,errors
        print('PASS', 'mobile native touch' if mobile else 'desktop keyboard', 'timer, clear/over, storage, retry/home, layout, animations')
        context.close()
    # Dedicated PAUSE regression: reproducible game clock plus real Web Animations.
    for mobile in [False, True]:
        context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=mobile, has_touch=mobile)
        context.add_init_script(INIT)
        page = context.new_page(); errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/number-merge/model.js', model_route)
        page.goto(BASE+'games/number-merge/')
        assert page.locator('#pause').is_disabled()
        for event in ['blur', 'pagehide', 'pageshow', 'orientationchange']:
            page.evaluate('(event)=>window.dispatchEvent(new Event(event))', event)
            assert page.evaluate('g.state') == 'START'
        page.locator('#start').click(); page.evaluate('tick(1234)')
        page.locator('#pause').click()
        assert page.evaluate('g.state') == 'PAUSED'
        assert page.locator('#pause-overlay').inner_text().split() == ['PAUSED','RESUME','HOME']
        assert page.locator('#overlay').is_hidden()
        assert page.evaluate('getComputedStyle(document.querySelector("#pause-overlay")).backgroundColor') == 'rgba(0, 0, 0, 0.7)'
        assert page.evaluate('document.querySelector("#pause-overlay").getAnimations({subtree:true}).length') == 0
        assert page.locator('#pause').is_disabled()
        assert page.evaluate('document.activeElement.id') == 'resume'
        saved = page.evaluate('({board:g.board.slice(),time:g.time()})')
        markup = page.locator('#board').inner_html()
        page.evaluate('window.oldTiles=[...document.querySelectorAll(".tile")];tick(3600000)')
        for key in ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown']:
            page.keyboard.press(key)
        # Even direct board events cannot bypass the PAUSED guard.
        page.dispatch_event('#board','pointerdown',{'pointerId':91,'isPrimary':True,'button':0,'clientX':200,'clientY':200})
        page.dispatch_event('#board','pointerup',{'pointerId':91,'clientX':100,'clientY':200})
        assert page.evaluate('({board:g.board.slice(),time:g.time()})') == saved
        assert page.locator('#time').inner_text() == '00:01.23'
        assert page.locator('#board').inner_html() == markup
        page.locator('#resume').click()
        assert page.evaluate('g.state') == 'PLAYING'
        assert page.evaluate('g.time()') == 1234
        assert page.evaluate('oldTiles.every(t=>t.isConnected)')
        assert page.evaluate('g.board') == saved['board']
        assert page.evaluate('document.activeElement.id') == 'board'
        page.evaluate('tick(567)'); assert page.evaluate('g.time()') == 1801
        page.locator('#pause').click(); page.evaluate('tick(60000)'); page.locator('#resume').click()
        page.evaluate('tick(199)'); assert page.locator('#time').inner_text() == '00:02.00'
        # Native capture, residual contact, sub-20px threshold and one move per release.
        box=page.locator('#board').bounding_box(); x=box['x']+box['width']/2; y=box['y']+box['height']/2
        session=context.new_cdp_session(page)
        def touch(kind, points):
            session.send('Input.dispatchTouchEvent', {'type':kind,'touchPoints':points})
        def down():
            if mobile:
                touch('touchStart',[{'x':x,'y':y,'id':1}]); touch('touchMove',[{'x':x+1,'y':y,'id':1}])
            else: page.mouse.move(x,y); page.mouse.down(); page.mouse.move(x+1,y)
        def up(dx):
            if mobile:
                touch('touchMove',[{'x':x+dx,'y':y,'id':1}]); touch('touchEnd',[])
            else: page.mouse.move(x+dx,y); page.mouse.up()
        page.evaluate('g.board=[2,2,4,8,...Array(12).fill(0)];g.random=()=>0;window.moves=0;const originalMove=g.move.bind(g);g.move=d=>{moves++;return originalMove(d);};void 0;')
        before=page.evaluate('g.board')
        down()
        page.evaluate('window.lostCapture=false;document.querySelector("#board").addEventListener("lostpointercapture", e=>{window.lostCapture=true;});')
        page.locator('#pause').evaluate('(b)=>b.click()')
        assert page.evaluate('g.state') == 'PAUSED'
        assert page.evaluate('moves') == 0
        page.wait_for_timeout(30)
        page.locator('#resume').evaluate('(b)=>b.click()')
        up(-90)
        assert page.evaluate('g.board') == before
        assert page.evaluate('moves') == 0
        assert page.evaluate('lostCapture')
        down(); up(19)
        assert page.evaluate('moves') == 0
        down(); up(-90)
        assert page.evaluate('moves') == 1
        assert page.evaluate('g.board.slice(0,4)') == [4,4,8,2]
        # Native cancellation/lost capture must discard the current gesture.
        down()
        if mobile: touch('touchCancel',[])
        else:
            page.evaluate('const b=document.querySelector("#board");for(let id=1;id<10;id++)if(b.hasPointerCapture(id))b.releasePointerCapture(id)')
            page.wait_for_timeout(30); page.mouse.up()
        assert page.evaluate('moves') == 1
        session.detach()
        # Hold an arrow across PAUSE: repeats after RESUME must not move tiles.
        page.keyboard.down('ArrowRight'); count=page.evaluate('moves')
        page.locator('#pause').click(); page.locator('#resume').click()
        page.keyboard.down('ArrowRight'); assert page.evaluate('moves') == count
        page.keyboard.up('ArrowRight'); page.keyboard.press('ArrowRight')
        assert page.evaluate('moves') == count+1
        # Stop the animations in the same task that creates them, before they finish.
        page.evaluate('''g.board=[2,2,4,8,...Array(12).fill(0)];
          document.querySelector('#board').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
          window.tilesBefore=[...document.querySelectorAll('.tile')];
          window.anims=document.querySelector('#board').getAnimations({subtree:true});
          document.querySelector('#pause').click();''')
        assert page.locator('.ghost').count() == 1
        page.wait_for_timeout(50)
        frozen=page.evaluate('anims.map(a=>({time:a.currentTime,state:a.playState}))')
        assert frozen and all(a['state']=='paused' for a in frozen)
        page.wait_for_timeout(250)
        assert page.evaluate('anims.map(a=>({time:a.currentTime,state:a.playState}))') == frozen
        assert page.locator('.ghost').count() == 1
        assert page.evaluate('tilesBefore.every(t=>t.isConnected)')
        page.locator('#resume').click()
        assert page.evaluate('anims.every(a=>a.playState==="running")')
        page.wait_for_timeout(220)
        assert page.locator('.ghost').count() == 0
        assert page.evaluate('anims.every(a=>a.playState==="finished")')
        # Each lifecycle signal pauses only active play, never auto-resumes.
        for target,event in [('window','blur'),('window','pagehide'),('window','pageshow'),('document','freeze'),('document','resume'),('window','orientationchange'),('screen.orientation','change')]:
            before=page.evaluate('({board:g.board.slice(),time:g.time()})')
            page.evaluate(f'{target}.dispatchEvent(new Event("{event}"))')
            assert page.evaluate('g.state') == 'PAUSED'
            page.evaluate('tick(60000)')
            assert page.evaluate('({board:g.board.slice(),time:g.time()})') == before
            page.locator('#resume').click(); assert page.evaluate('g.state') == 'PLAYING'
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))')
        assert page.evaluate('g.state') == 'PAUSED' and page.locator('#resume').is_disabled()
        page.locator('#resume').evaluate('(b)=>b.click()'); assert page.evaluate('g.state') == 'PAUSED'
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"))')
        assert page.evaluate('g.state') == 'PAUSED'
        page.locator('#resume').click()
        before=page.evaluate('g.time()'); page.evaluate('rawTick(60000)')
        assert page.evaluate('g.state') == 'PAUSED' and page.evaluate('g.time()') == before
        page.locator('#resume').click()
        # Input before the first returning frame must also detect the interruption.
        page.evaluate('testNow+=60000')
        before=page.evaluate('g.board'); page.keyboard.press('ArrowLeft')
        assert page.evaluate('g.state') == 'PAUSED' and page.evaluate('g.board') == before
        page.locator('#resume').click()
        for w,h in [(320,568),(360,640),(390,844),(430,932),(1100,844)]:
            page.set_viewport_size({'width':w,'height':h})
            if page.evaluate('g.state') == 'PLAYING': page.locator('#pause').click()
            panel=page.locator('.pause-panel').bounding_box(); arena=page.locator('.arena').bounding_box()
            assert abs(panel['width']-260)<1
            assert abs(panel['x']+panel['width']/2-arena['x']-arena['width']/2)<1
            assert abs(panel['y']+panel['height']/2-arena['y']-arena['height']/2)<1
            assert panel['x']>=0 and panel['y']>=0 and panel['x']+panel['width']<=w and panel['y']+panel['height']<=h
            for selector in ['#pause','#resume','#pause-home']:
                bounds=page.locator(selector).bounding_box()
                assert bounds['width']>=44 and bounds['height']>=44
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'), page.evaluate('({w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollHeight,body:document.body.getBoundingClientRect().toJSON(),cabinet:document.querySelector(".cabinet").getBoundingClientRect().toJSON()})')
            assert page.evaluate('''[...document.querySelectorAll('.hud strong')].every(e=>{
              const a=e.getBoundingClientRect(),b=document.querySelector('#pause').getBoundingClientRect();return a.right<=b.left && e.scrollWidth<=e.clientWidth;
            })''')
            page.screenshot(path=f'/tmp/number-merge-pause-{mobile}-{w}.png')
        if mobile:
            page.set_viewport_size({'width':844,'height':390})
            page.wait_for_function('matchMedia("(orientation: landscape) and (pointer: coarse)").matches', polling=50)
            assert page.locator('#resume').is_disabled()
            page.locator('#resume').evaluate('(b)=>b.click()'); assert page.evaluate('g.state') == 'PAUSED'
            page.set_viewport_size({'width':390,'height':844})
            page.wait_for_function('!document.querySelector("#resume").disabled', polling=50)
            assert page.evaluate('g.state') == 'PAUSED'
        page.locator('#resume').click()
        page.evaluate('tick(250);g.board=[1024,1024,...Array(14).fill(0)]')
        elapsed=page.evaluate('g.time()'); page.keyboard.press('ArrowLeft')
        assert page.evaluate('g.state') == 'GAME CLEAR'
        assert page.evaluate(f'Number(localStorage.getItem("{KEY}"))') == elapsed
        page.evaluate('window.dispatchEvent(new Event("blur"))')
        assert page.evaluate('g.state') == 'GAME CLEAR' and page.locator('#pause').is_disabled()
        page.locator('#retry').click(); assert page.evaluate('g.time()') == 0
        page.evaluate('tick(300);g.board=[2,4,8,16,32,64,128,256,512,2,4,8,16,32,64,0]')
        page.locator('#pause').click(); page.evaluate('tick(60000)'); page.locator('#resume').click()
        page.evaluate('tick(100)'); page.keyboard.press('ArrowRight')
        assert page.evaluate('g.state') == 'GAME OVER' and page.evaluate('g.time()') == 400
        page.evaluate('document.dispatchEvent(new Event("freeze"))')
        assert page.evaluate('g.state') == 'GAME OVER'
        page.locator('#retry').click(); page.locator('#pause').click(); page.locator('#pause-home').click()
        page.locator('#game-list .is-selected').wait_for()
        assert page.url == BASE+'index.html'
        assert not errors,errors
        print('PASS PAUSE', 'native touch' if mobile else 'keyboard/mouse', 'clock, input/capture, animations, lifecycle, layout, records, HOME')
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
    page.locator('#pause').click(); frozen=page.locator('#time').inner_text()
    page.wait_for_timeout(250); assert page.locator('#time').inner_text()==frozen
    page.locator('#resume').click(); page.wait_for_timeout(120)
    assert page.locator('#time').inner_text()!=frozen
    context.close()
    print('PASS real animation-frame timer and pause/resume, 320px start screen, reduced motion')
    browser.close()
