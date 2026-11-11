"""Optional Playwright checks. Serve /workspace on localhost:8000 first."""
import os
from arcade_helpers import launch_game
from playwright.sync_api import sync_playwright
BASE=os.environ.get('ARCADE_TEST_URL','http://127.0.0.1:8000/08_my-arcade/')
CLOCK="""
window.testNow=0;window.frames=[];
requestAnimationFrame=cb=>{frames.push(cb);return 1;};performance.now=()=>testNow;
window.tick=ms=>{for(let left=ms;left>0;){let dt=Math.min(left,16);left-=dt;testNow+=dt;frames.splice(0).forEach(cb=>cb(testNow));}};
"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
    for mobile in [False,True]:
        context=browser.new_context(viewport={'width':390 if mobile else 1100,'height':844},is_mobile=mobile,has_touch=mobile)
        context.add_init_script(CLOCK)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE);page.locator('#game-list .is-selected').wait_for()
        assert page.locator('#game-list .cabinet').count()==10
        launch_game(page, 'BLOCK BREAKER')
        page.evaluate('localStorage.setItem("my-arcade:block-breaker:best","123456")')
        page.reload()
        assert page.locator('#best').inner_text()=='--:--.--'
        assert page.locator('#stage').inner_text()=='1/1'
        page.wait_for_function('typeof BlockBreaker !== "undefined"')
        page.evaluate('''() => {const update=BlockBreaker.Game.prototype.update;BlockBreaker.Game.prototype.update=function(dt){window.g=this;return update.call(this,dt);};tick(16);}''')
        assert not page.locator('#result-home').is_visible()
        page.locator('#action').click();page.evaluate('tick(1000)')
        assert page.locator('#time').inner_text()=='00:00.00'
        if mobile:
            box=page.locator('canvas').bounding_box();x=box['x']+40;y=box['y']+box['height']*.8
            session=context.new_cdp_session(page)
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            assert page.evaluate('g.paddle')==200
            session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+50,'y':y}]})
            assert page.evaluate('g.paddle')>240
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            assert page.evaluate('g.state')=='READY'
            session.detach()
            # Keep raw CDP touch gestures separate from button activation.
            page.locator('#launch').click()
        else:
            page.keyboard.down('ArrowLeft');page.evaluate('tick(100)');page.keyboard.up('ArrowLeft')
            assert page.evaluate('g.paddle')<200
            page.keyboard.press('Space')
        page.evaluate('tick(1000)');assert page.locator('#time').inner_text()=='00:01.00', page.evaluate('({state:g.state,time:g.time(),hidden:document.hidden})')
        page.locator('#pause').click();page.evaluate('tick(3000)');assert page.locator('#time').inner_text()=='00:01.00'
        assert not page.locator('#result-home').is_visible()
        page.locator('#resume').click();page.evaluate('tick(100)')
        page.evaluate('g.ball={x:20,y:585,vx:0,vy:319};tick(16)')
        assert page.locator('#life').inner_text()=='2';assert page.evaluate('g.misses')==1
        before=page.evaluate('g.time()');page.evaluate('tick(1000)');assert page.evaluate('g.time()')==before+1000
        page.evaluate('''Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));''')
        before=page.evaluate('g.time()');page.evaluate('tick(1000)');assert page.evaluate('g.time()')==before
        assert page.evaluate('g.state')=='PAUSED'
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"))')
        page.locator('#resume').click();assert page.evaluate('g.state')=='READY'
        page.locator('#launch').click()
        page.evaluate('for(let i=0;i<2;i++){g.miss();g.launch();}tick(16);')
        assert page.locator('#screen-title').inner_text()=='GAME OVER'
        def check_result_actions():
            retry=page.locator('#action');home=page.locator('#result-home')
            assert retry.is_visible() and retry.inner_text()=='RETRY ↻'
            assert home.is_visible() and home.get_attribute('href')=='../../index.html'
            button=retry.bounding_box();link=home.bounding_box()
            assert link['height']>=44 and link['y']>=button['y']+button['height']+8
            assert link['x']>=0 and link['x']+link['width']<=page.evaluate('innerWidth')
        check_result_actions()
        assert page.evaluate('localStorage.getItem("my-arcade:block-breaker:v1.1:best")') is None
        page.locator('#action').click();page.locator('#launch').click();page.evaluate('tick(500)')
        clear='g.blocks=[{x:20,y:64,w:42,h:18,row:0}];g.destroy(0);tick(16);'
        page.evaluate(clear)
        assert page.evaluate('g.stage')==1
        assert page.evaluate('localStorage.getItem("my-arcade:block-breaker:best")')=='123456'
        assert page.locator('#screen-title').inner_text()=='ALL CLEAR'
        check_result_actions()
        best=page.evaluate('localStorage.getItem("my-arcade:block-breaker:v1.1:best")');assert float(best)==500
        page.evaluate('tick(1000)');assert page.locator('#time').inner_text()=='00:00.50'
        page.locator('#retry').click();assert page.locator('#time').inner_text()=='00:00.00'
        page.locator('#launch').click();page.evaluate('tick(1000)');page.evaluate(clear)
        assert page.evaluate('localStorage.getItem("my-arcade:block-breaker:v1.1:best")')==best
        page.locator('#mute').click();assert page.locator('#mute').get_attribute('aria-pressed')=='true'
        page.reload();assert page.locator('#best').inner_text()=='00:00.50'
        # Reload creates a new realm; restore test-only instance observation.
        page.evaluate('''() => {const update=BlockBreaker.Game.prototype.update;BlockBreaker.Game.prototype.update=function(dt){window.g=this;return update.call(this,dt);};tick(16);}''')
        assert page.locator('#mute').get_attribute('aria-pressed')=='true'
        page.locator('#action').click();page.evaluate('tick(16)')
        for w,h in [(320,568),(844,390),(430,932),(1100,844)]:
            page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(60);page.evaluate('tick(16)')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.evaluate('g.state') in ['READY','PAUSED']
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(60);page.evaluate('tick(16)')
        page.screenshot(path=f'/tmp/block-breaker-{mobile}.png')
        for width in [320,360,390,430]:
            page.set_viewport_size({'width':width,'height':844});page.wait_for_timeout(60)
            page.evaluate('g.state="ALL CLEAR";tick(16)');check_result_actions()
        page.get_by_role('link',name='← MY ARCADEへ戻る',exact=True).click()
        page.wait_for_url(BASE+'index.html')
        launch_game(page, 'STACK TOWER')
        page.locator('#start').click();page.evaluate('tick(720)');page.locator('canvas').click()
        assert page.locator('#score').inner_text()=='1'
        assert not errors,errors
        print('PASS:', 'mobile touch' if mobile else 'desktop keyboard','navigation, timer, miss, pause, visibility, results, best, retry, mute, resize, STACK TOWER',flush=True)
        context.close()
    # Shared pause UI, lifecycle and stale touch checks use the actual controller.
    for mobile in [False, True]:
        context=browser.new_context(viewport={'width':390,'height':844},is_mobile=mobile,has_touch=mobile)
        context.add_init_script(CLOCK);page=context.new_page();page.goto(BASE+'games/block-breaker/')
        page.evaluate("const update=BlockBreaker.Game.prototype.update;BlockBreaker.Game.prototype.update=function(dt){window.g=this;return update.call(this,dt)};tick(16)")
        page.locator('#action').click();page.locator('#launch').click();page.evaluate('tick(200)')
        page.keyboard.down('ArrowRight');page.locator('#pause').click()
        frozen=page.evaluate('JSON.stringify([g.ball,g.paddle,g.blocks,g.life,g.misses,g.time()])')
        page.keyboard.press('KeyP');page.evaluate('tick(3000)')
        assert page.evaluate('g.state')=='PAUSED'
        assert page.evaluate('JSON.stringify([g.ball,g.paddle,g.blocks,g.life,g.misses,g.time()])')==frozen
        for width,height in [(320,568),(360,640),(390,844),(430,932),(1100,844)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(80);page.evaluate('tick(16);scrollTo(0,0)')
            assert page.locator('.pause-panel').inner_text().split()==['PAUSED','RESUME','HOME']
            assert page.locator('.pause-panel button, .pause-panel a').count()==2
            assert page.locator('#overlay').is_hidden()
            box=page.locator('.pause-panel').bounding_box();arena=page.locator('.arena').bounding_box()
            assert 240<=box['width']<=280 and box['x']>=0 and box['x']+box['width']<=width
            assert box['y']>=0 and box['y']+box['height']<=height
            assert abs(box['y']+box['height']/2-arena['y']-arena['height']/2)<1
            assert page.locator('#pause').bounding_box()['y']+44<=arena['y']
            for selector in ['#resume','#pause-home']:
                button=page.locator(selector).bounding_box();assert button['width']>=44 and button['height']>=44
            assert page.evaluate("getComputedStyle(document.querySelector('#pause-overlay')).backgroundColor")=='rgba(0, 0, 0, 0.7)'
            assert page.evaluate("Array.from(document.querySelectorAll('#pause-overlay, #pause-overlay *')).every(e=>{const s=getComputedStyle(e);return s.animationName==='none'&&s.transitionDuration==='0s'})")
            page.screenshot(path=f'/tmp/block-breaker-pause-{mobile}-{width}.png')
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(80)
        paddle=page.evaluate('g.paddle');time=page.evaluate('g.time()');page.locator('#resume').click()
        assert page.evaluate('g.state')=='PLAYING' and page.evaluate('g.time()')==time
        page.keyboard.down('ArrowRight');page.evaluate('tick(100)');assert page.evaluate('g.paddle')==paddle
        assert page.evaluate('g.time()')==time+100;page.keyboard.up('ArrowRight')
        # Lifecycle recovery never resumes by itself, including a frame-loop sleep gap.
        for event in ['blur','pagehide','orientationchange','freeze','visibilitychange','sleep']:
            before=page.evaluate('g.time()')
            if event=='sleep':page.evaluate('testNow+=5000;frames.splice(0).forEach(cb=>cb(testNow))')
            elif event=='visibilitychange':page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
            elif event=='freeze':page.evaluate("document.dispatchEvent(new Event('freeze'))")
            else:page.evaluate('(type)=>dispatchEvent(new Event(type))',event)
            assert page.evaluate('g.state')=='PAUSED' and page.evaluate('g.time()')==before
            page.evaluate('tick(2000)');assert page.evaluate('g.time()')==before
            page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));dispatchEvent(new Event('pageshow'))")
            assert page.evaluate('g.state')=='PAUSED';page.locator('#resume').click()
            assert page.evaluate('g.state')=='PLAYING'
        if mobile:
            # Keep the pre-pause finger down while activating pause/resume with a second pointer.
            box=page.locator('canvas').bounding_box();x=box['x']+80;y=box['y']+box['height']*.7
            session=context.new_cdp_session(page)
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+30,'y':y}]})
            page.evaluate("document.querySelector('#pause').click()")
            paddle=page.evaluate('g.paddle');page.evaluate("document.querySelector('#resume').click()")
            session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+60,'y':y}]})
            assert page.evaluate('g.paddle')==paddle
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x-20,'y':y}]})
            assert page.evaluate('g.paddle')<paddle
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});session.detach()
            page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(100)
            assert page.evaluate('g.state')=='PAUSED' and page.locator('#resume').is_disabled()
            page.evaluate("document.querySelector('#resume').click()")
            assert page.evaluate('g.state')=='PAUSED'
            page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
            assert page.evaluate('g.state')=='PAUSED' and page.locator('#resume').is_enabled()
            page.locator('#resume').click();assert page.evaluate('g.state')=='PLAYING'
        page.locator('#pause').click();page.locator('#retry').click();assert page.evaluate('g.state')=='READY'
        page.locator('#pause').click();page.locator('#pause-home').click();page.wait_for_url(BASE+'index.html')
        context.close();print('PASS: shared pause layouts, frozen state, immediate resume, stale keys/touch, lifecycle/sleep, orientation, RETRY and HOME',mobile,flush=True)
    context=browser.new_context();context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})")
    page=context.new_page();page.goto(BASE+'games/block-breaker/');page.locator('#action').click();page.locator('#launch').click()
    assert page.locator('#pause').is_enabled()
    print('PASS: blocked localStorage remains playable')
    # Real animation, mouse launch/hover and existing Web Audio effects.
    context=browser.new_context(viewport={'width':1100,'height':900});page=context.new_page()
    page.goto(BASE+'games/block-breaker/')
    page.evaluate("() => {const update=BlockBreaker.Game.prototype.update;BlockBreaker.Game.prototype.update=function(dt){window.g=this;return update.call(this,dt)};window.tones=0;const make=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){tones++;return make.call(this)}}")
    page.locator('#action').click();box=page.locator('canvas').bounding_box()
    page.mouse.move(box['x']+box['width']*.3,box['y']+box['height']*.7)
    assert page.evaluate('g.paddle')<200
    page.mouse.click(box['x']+box['width']*.3,box['y']+box['height']*.7)
    assert page.evaluate('g.state')=='PLAYING';page.wait_for_timeout(100)
    page.locator('#pause').click();before=page.evaluate('g.time()');paddle=page.evaluate('g.paddle')
    page.wait_for_timeout(250);assert page.evaluate('g.time()')==before
    page.locator('#resume').click();page.wait_for_timeout(100)
    assert before<page.evaluate('g.time()')<before+250 and page.evaluate('g.paddle')==paddle
    page.evaluate('g.destroy(0)');assert page.evaluate('tones')>0
    page.locator('#mute').click();tones=page.evaluate('tones');page.evaluate('g.destroy(0)')
    assert page.evaluate('tones')==tones
    context.close();browser.close();print('PASS: real frames, mouse movement/launch, pause clock and Web Audio mute',flush=True)
