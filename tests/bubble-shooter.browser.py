"""Optional Playwright check; serve the repository's parent directory on port 8000."""
import os
from arcade_helpers import launch_game
from playwright.sync_api import sync_playwright
BASE=os.environ.get('ARCADE_TEST_URL','http://127.0.0.1:8000/08_my-arcade/')
KEY='my-arcade:bubble-shooter:best'
INIT="""
window.testNow=0;performance.now=()=>testNow;window.frames=new Map();window.frameSerial=0;
requestAnimationFrame=cb=>{frames.set(++frameSerial,cb);return frameSerial};
cancelAnimationFrame=id=>frames.delete(id);
window.tick=ms=>{testNow+=ms;const batch=[...frames.values()];frames.clear();batch.forEach(cb=>cb(testNow))};
window.advance=n=>{for(let i=0;i<n;i++)tick(16)};
document.addEventListener('pointerdown',e=>{window.lastPointer=e.pointerId},true);
"""
CAPTURE='\nconst Original=BubbleShooter.Game;BubbleShooter.Game=class extends Original{constructor(options){super(options);window.g=this}};'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
    def capture(route):
        response=route.fetch();route.fulfill(response=response,body=response.text()+CAPTURE)
    for mobile in [False,True]:
        context=browser.new_context(viewport={'width':390 if mobile else 1100,'height':844},is_mobile=mobile,has_touch=mobile,device_scale_factor=2)
        context.add_init_script(INIT)
        page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.route('**/bubble-shooter/model.js',capture)
        page.goto(BASE);page.locator('#game-list .is-selected').wait_for()
        assert page.locator('#game-list .cabinet').count()==10
        launch_game(page, 'BUBBLE SHOOTER')
        assert page.locator('#start').is_visible() and page.locator('#home').is_hidden()
        for w,h in [(320,568),(360,640),(390,844),(430,932),(1100,844)]:
            page.set_viewport_size({'width':w,'height':h})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
            for control in ['start','left','shoot','right']:
                box=page.locator('#'+control).bounding_box();assert box['height']>=44 and box['y']>=0 and box['y']+box['height']<=h
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path=f'/tmp/bubble-start-{mobile}.png')
        page.locator('#start').click();page.evaluate('tick(0)');assert page.evaluate('g.board.length')==48
        if mobile:
            box=page.locator('#left').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
            session=context.new_cdp_session(page)
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            assert page.evaluate('g.angle')==-3
            page.evaluate('advance(40)');assert page.evaluate('g.angle') < -20
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});session.detach()
        else:
            page.keyboard.down('ArrowLeft');assert page.evaluate('g.angle')==-3
            page.evaluate('advance(40)');page.keyboard.up('ArrowLeft');assert page.evaluate('g.angle') < -20
        angle=page.evaluate('g.angle');page.evaluate('advance(30)');assert page.evaluate('g.angle')==angle
        assert page.evaluate('scrollY')==0
        page.evaluate('g.board=[{row:0,col:8,color:4}];g.current=4;g.next=4')
        page.locator('#shoot').click();assert page.locator('#shoot').is_disabled()
        assert page.evaluate('g.shoot()') is False
        page.evaluate('advance(200)');assert page.evaluate('g.shot===null');assert page.locator('#shoot').is_enabled()
        page.evaluate('g.score=0;g.board=[{row:0,col:0,color:0},{row:0,col:1,color:0},{row:1,col:0,color:1},{row:0,col:8,color:4}];g.settle({row:0,col:2},0);advance(30)')
        assert page.locator('#score').inner_text()=='50';assert page.evaluate(f'localStorage.getItem("{KEY}")')=='50'
        page.screenshot(path=f'/tmp/bubble-playing-{mobile}.png')
        page.evaluate('g.board=[{row:14,col:0,color:1}];g.finishResolution();tick(16)')
        assert page.locator('#screen-title').inner_text()=='GAME OVER'
        assert page.locator('#message').inner_text()=='FINAL SCORE 50' and page.locator('#result-best').inner_text()=='50'
        assert page.locator('#home').is_visible() and page.evaluate('frames.size')==0
        old=page.evaluate('g.angle');page.keyboard.press('ArrowRight');assert page.evaluate('g.angle')==old
        page.screenshot(path=f'/tmp/bubble-over-{mobile}.png')
        page.locator('#retry').click();assert page.locator('#overlay').is_hidden()
        assert page.evaluate('g.score===0&&g.misses===0&&g.angle===0&&g.shot===null&&g.effects.length===0&&g.offset===0')
        assert page.evaluate('frames.size')==1
        page.reload();assert page.locator('#best').inner_text()=='50'
        page.locator('#start').click();page.evaluate('g.board=[{row:14,col:0,color:1}];g.finishResolution();tick(0)')
        page.locator('#home').click();page.locator('#game-list .is-selected').wait_for();assert page.url==BASE+'index.html'
        assert not errors,errors
        context.close();print('PASS','Android touch' if mobile else 'desktop keys','layout, hold, shot, score, storage, retry/home, stopped loop')
    # PAUSE-specific regression: model snapshots, controlled RAF and native touch.
    for mobile in [False, True]:
        context=browser.new_context(viewport={'width':390,'height':844},is_mobile=mobile,has_touch=mobile)
        context.add_init_script(INIT)
        page=context.new_page(); errors=[]; page.on('pageerror',lambda error:errors.append(str(error)))
        page.route('**/bubble-shooter/model.js',capture);page.goto(BASE+'games/bubble-shooter/')
        assert page.locator('#pause').is_disabled()
        page.locator('#start').click();page.evaluate('tick(0)')
        def snapshot():
            return page.evaluate("JSON.stringify([g.board,g.offset,g.score,g.misses,g.angle,g.shot,g.effects,g.remaining,g.current,g.next,document.querySelector('#game').toDataURL()])")
        def pause_resume(expected='PLAYING'):
            page.evaluate('tick(0)');before=snapshot();page.locator('#pause').click()
            assert page.evaluate('g.state')=='PAUSED'
            assert page.locator('#pause-overlay').inner_text().split()==['PAUSED','RESUME','HOME']
            assert page.evaluate('frames.size')==0
            page.evaluate("advance(500);g.update(3600);g.aim(3);g.shoot();document.querySelector('#left').click();document.querySelector('#shoot').click()")
            page.keyboard.press('ArrowRight');page.keyboard.press('Space') # resume has focus: native Space resumes
            # Pause again to check native RESUME does not shoot or change the world.
            assert page.evaluate('g.state')==expected
            assert snapshot()==before
            page.locator('#pause').click();page.evaluate('tick(3600000)')
            assert snapshot()==before
            page.locator('#resume').click();assert page.evaluate('g.state')==expected
            assert snapshot()==before
            page.evaluate('tick(0)');assert snapshot()==before
        pause_resume()
        for w,h in [(320,568),(360,640),(390,844),(430,932),(1100,844)]:
            page.set_viewport_size({'width':w,'height':h})
            if page.evaluate('g.state')!='PAUSED':page.locator('#pause').click()
            panel=page.locator('.pause-panel').bounding_box();arena=page.locator('.arena').bounding_box()
            assert panel['width']==260 and panel['x']>=0 and panel['y']>=0 and panel['y']+panel['height']<=h
            assert abs(panel['x']+panel['width']/2-arena['x']-arena['width']/2)<1
            assert abs(panel['y']+panel['height']/2-arena['y']-arena['height']/2)<1
            for control in ['pause','resume','pause-home','left','shoot','right']:
                box=page.locator('#'+control).bounding_box();assert min(box['width'],box['height'])>=44
                assert box['x']>=0 and box['x']+box['width']<=w and box['y']>=0 and box['y']+box['height']<=h
            assert page.evaluate("getComputedStyle(document.querySelector('#pause-overlay')).backgroundColor")=='rgba(0, 0, 0, 0.7)'
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
            hud=page.locator('#best').bounding_box();pb=page.locator('#pause').bounding_box();assert hud['x']+hud['width']<=pb['x']
            if w==320:page.screenshot(path=f'/tmp/bubble-pause-320-{mobile}.png')
        page.set_viewport_size({'width':390,'height':844});page.locator('#resume').click()
        # Flight immediately after launch and either side of the first wall bounce.
        for angle,steps in [(-70,0),(-70,5),(-70,6),(70,5),(70,6)]:
            page.evaluate(f'g.start();g.board=[{{row:0,col:0,color:4}}];g.current=4;g.next=4;g.angle={angle};tick(0)')
            page.locator('#shoot').click();page.evaluate(f'advance({steps})')
            assert page.evaluate('g.shot!==null');pause_resume()
            before=page.evaluate('({...g.shot})');page.evaluate('tick(16)');after=page.evaluate('({...g.shot})')
            assert abs(after['y']-before['y']-before['vy']*650*.016)<1e-7
            assert after['color']==before['color']
        # Resolution preserves effect positions, remaining time, score and NEXT.
        page.evaluate('g.start();g.board=[{row:0,col:0,color:0},{row:0,col:1,color:0},{row:1,col:0,color:1},{row:0,col:8,color:4}];g.settle({row:0,col:2},0);tick(0);tick(100)')
        assert page.evaluate('g.score')==50
        pause_resume('RESOLVING');page.evaluate('tick(100)');assert page.evaluate('g.state')=='RESOLVING'
        page.evaluate('advance(20)');assert page.evaluate('g.state')=='PLAYING' and page.evaluate('g.score')==50
        assert page.locator('#best').inner_text()=='50'
        # Fresh short/long left and right; release capture while the finger stays down.
        session=context.new_cdp_session(page) if mobile else None
        for control,key in [('left','ArrowLeft'),('right','ArrowRight')]:
            page.evaluate('g.angle=0;tick(0)')
            button=page.locator('#'+control);box=button.bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
            if mobile:
                session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
                page.evaluate('tick(16)') # delivers pending capture
                assert page.evaluate(f"document.querySelector('#{control}').hasPointerCapture(lastPointer)")
            else:page.keyboard.down(key)
            page.evaluate('advance(30)');assert abs(page.evaluate('g.angle'))>3
            if control=='right':page.evaluate("window.dispatchEvent(new Event('blur'))")
            else:page.locator('#pause').evaluate('(b)=>b.click()')
            before=snapshot()
            assert page.evaluate("!document.querySelector('#left').hasPointerCapture(lastPointer)&&!document.querySelector('#right').hasPointerCapture(lastPointer)")
            page.locator('#resume').evaluate('(b)=>b.click()');page.evaluate('advance(30)');assert snapshot()==before
            if mobile:session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            else:
                page.keyboard.down(key);page.evaluate('advance(30)');assert snapshot()==before
                page.keyboard.up(key)
            assert snapshot()==before
            # Fresh native touch works after the old finger has been released.
            if mobile:
                old=page.evaluate('g.angle')
                session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
                session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
                assert abs(page.evaluate('g.angle')-old)==3
            # Accessible clicks and fresh physical input still work.
            button.evaluate('(b)=>b.click()');assert snapshot()!=before
            page.keyboard.press(key);assert page.evaluate('Math.abs(g.angle)')>0
        if session:
            page.evaluate('g.start();tick(0)');box=page.locator('#shoot').bounding_box();sx=box['x']+box['width']/2;sy=box['y']+box['height']/2
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':sx,'y':sy}]})
            page.locator('#pause').evaluate('(b)=>b.click()');page.locator('#resume').evaluate('(b)=>b.click()')
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            assert page.evaluate('g.shot===null')
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':sx,'y':sy}]})
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            assert page.evaluate('g.shot!==null')
            session.detach()
        # A SHOOT contact begun before pause cannot become a shot after resume.
        page.evaluate('g.start();tick(0)');box=page.locator('#shoot').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2
        page.mouse.move(x,y);page.mouse.down();page.locator('#pause').evaluate('(b)=>b.click()');page.locator('#resume').evaluate('(b)=>b.click()');page.mouse.up()
        assert page.evaluate('g.shot===null');page.locator('#shoot').click();assert page.evaluate('g.shot!==null')
        # Lifecycle notifications never overwrite RESOLVING as the resume target.
        for event,target in [('blur','window'),('pagehide','window'),('pageshow','window'),('freeze','document'),('resume','document'),('orientationchange','window')]:
            page.evaluate('g.start();g.settle({row:5,col:0},0);tick(0)');before=snapshot()
            page.evaluate(f"{target}.dispatchEvent(new Event('{event}'));{target}.dispatchEvent(new Event('{event}'));tick(60000)")
            assert page.evaluate('g.state')=='PAUSED' and snapshot()==before
            page.locator('#resume').click();assert page.evaluate('g.state')=='RESOLVING' and snapshot()==before
        page.evaluate("g.start();tick(0);Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
        assert page.locator('#resume').is_disabled();assert page.evaluate('g.state')=='PAUSED'
        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))")
        assert page.evaluate('g.state')=='PAUSED';page.locator('#resume').click()
        # Suspension is caught both by RAF and by an input arriving before RAF.
        for first_frame in [True,False]:
            page.evaluate('g.start();g.shoot();tick(0)');before=snapshot()
            if first_frame:page.evaluate('tick(60000)')
            else:
                page.evaluate('testNow+=60000');page.keyboard.press('ArrowLeft')
            assert page.evaluate('g.state')=='PAUSED' and snapshot()==before
            page.locator('#resume').click();page.evaluate('tick(0)');assert snapshot()==before
        page.locator('#retry').evaluate('(b)=>b.click()');before=snapshot();page.evaluate('tick(60000)') # suspended before initial RAF
        assert page.evaluate('g.state')=='PAUSED' and snapshot()==before
        if mobile:
            page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(100)
            assert page.locator('#resume').is_disabled();page.locator('#resume').evaluate('(b)=>b.click()');assert page.evaluate('g.state')=='PAUSED'
            page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
            assert page.evaluate('g.state')=='PAUSED' and page.locator('#resume').is_enabled()
        page.locator('#resume').click();assert page.evaluate('g.state')=='PLAYING'
        page.locator('#pause').click();page.locator('#pause-home').click();page.locator('#game-list .is-selected').wait_for();assert page.url==BASE+'index.html'
        assert not errors,errors
        context.close();print('PASS PAUSE', 'touch emulation' if mobile else 'desktop', 'layout, flight/bounce, resolution, residual inputs, lifecycle, suspension, landscape, HOME')
    for blocked in ["Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}})","Storage.prototype.setItem=function(){throw Error('blocked')}"]:
        context=browser.new_context();context.add_init_script(blocked);context.add_init_script(INIT)
        page=context.new_page();page.route('**/bubble-shooter/model.js',capture);page.goto(BASE+'games/bubble-shooter/')
        page.locator('#start').click();page.evaluate('g.score=60;tick(0)');assert page.locator('#best').inner_text()=='60'
        context.close()
    print('PASS storage exceptions retain session BEST')
    context=browser.new_context(viewport={'width':320,'height':568},reduced_motion='reduce')
    page=context.new_page();page.route('**/bubble-shooter/model.js',capture);page.goto(BASE+'games/bubble-shooter/')
    page.locator('#start').click();page.keyboard.press('Space');page.wait_for_timeout(80)
    page.locator('#pause').click();assert page.evaluate('g.shot!==null')
    frozen=page.evaluate('JSON.stringify(g)');page.wait_for_timeout(1200);assert page.evaluate('JSON.stringify(g)')==frozen
    page.locator('#resume').click();page.wait_for_timeout(1200)
    assert page.evaluate('g.shot===null');assert page.evaluate('g.misses===1||g.score>0')
    page.screenshot(path='/tmp/bubble-real-frame.png');context.close()
    print('PASS real animation frames, Space and reduced motion');browser.close()
