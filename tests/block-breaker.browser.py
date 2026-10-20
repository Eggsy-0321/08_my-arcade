"""Optional Playwright checks. Serve /workspace on localhost:8000 first."""
import os
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
        page.goto(BASE);page.locator('#game-list .cabinet').last.wait_for()
        assert page.locator('#game-list .cabinet').count()==3
        page.get_by_role('link',name='BLOCK BREAKERを開く',exact=False).click()
        page.wait_for_function('typeof BlockBreaker !== "undefined"')
        page.evaluate('''() => {const update=BlockBreaker.Game.prototype.update;BlockBreaker.Game.prototype.update=function(dt){window.g=this;return update.call(this,dt);};tick(16);}''')
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
            page.locator('#launch').tap()
        else:
            page.keyboard.down('ArrowLeft');page.evaluate('tick(100)');page.keyboard.up('ArrowLeft')
            assert page.evaluate('g.paddle')<200
            page.keyboard.press('Space')
        page.evaluate('tick(1000)');assert page.locator('#time').inner_text()=='00:01.00'
        page.locator('#pause').click();page.evaluate('tick(3000)');assert page.locator('#time').inner_text()=='00:01.00'
        page.locator('#action').click();page.evaluate('tick(100)')
        page.evaluate('g.ball={x:20,y:585,vx:0,vy:290};tick(16)')
        assert page.locator('#life').inner_text()=='2';assert page.evaluate('g.misses')==1
        before=page.evaluate('g.time()');page.evaluate('tick(1000)');assert page.evaluate('g.time()')==before+1000
        page.evaluate('''Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));''')
        before=page.evaluate('g.time()');page.evaluate('tick(1000)');assert page.evaluate('g.time()')==before
        assert page.evaluate('g.state')=='PAUSED'
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:false})')
        page.locator('#action').click();assert page.evaluate('g.state')=='READY'
        page.locator('#launch').click()
        page.evaluate('for(let i=0;i<2;i++){g.miss();g.launch();}tick(16);')
        assert page.locator('#screen-title').inner_text()=='GAME OVER'
        assert page.evaluate('localStorage.getItem("my-arcade:block-breaker:best")') is None
        page.locator('#action').click();page.locator('#launch').click();page.evaluate('tick(500)')
        clear='for(let i=0;i<3;i++){g.blocks=[{x:20,y:64,w:42,h:18,row:0}];g.destroy(0);}tick(16);'
        page.evaluate(clear)
        assert page.locator('#screen-title').inner_text()=='ALL CLEAR'
        best=page.evaluate('localStorage.getItem("my-arcade:block-breaker:best")');assert float(best)==500
        page.evaluate('tick(1000)');assert page.locator('#time').inner_text()=='00:00.50'
        page.locator('#retry').click();assert page.locator('#time').inner_text()=='00:00.00'
        page.locator('#launch').click();page.evaluate('tick(1000)');page.evaluate(clear)
        assert page.evaluate('localStorage.getItem("my-arcade:block-breaker:best")')==best
        page.locator('#mute').click();assert page.locator('#mute').get_attribute('aria-pressed')=='true'
        page.reload();assert page.locator('#best').inner_text()=='00:00.50'
        assert page.locator('#mute').get_attribute('aria-pressed')=='true'
        page.locator('#action').click();page.evaluate('tick(16)')
        for w,h in [(320,568),(844,390),(430,932),(1100,844)]:
            page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(60);page.evaluate('tick(16)')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.evaluate('g.state')=='READY'
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(60);page.evaluate('tick(16)')
        page.screenshot(path=f'/tmp/block-breaker-{mobile}.png')
        page.get_by_role('link',name='← HOME / MY ARCADE').click()
        page.get_by_role('link',name='STACK TOWERを開く',exact=False).click()
        page.locator('#start').click();page.evaluate('tick(720)');page.locator('canvas').click()
        assert page.locator('#score').inner_text()=='1'
        assert not errors,errors
        print('PASS:', 'mobile touch' if mobile else 'desktop keyboard','navigation, timer, miss, pause, visibility, results, best, retry, mute, resize, STACK TOWER',flush=True)
        context.close()
    context=browser.new_context();context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})")
    page=context.new_page();page.goto(BASE+'games/block-breaker/');page.locator('#action').click();page.locator('#launch').click()
    assert page.locator('#pause').is_enabled()
    print('PASS: blocked localStorage remains playable')
    browser.close()
