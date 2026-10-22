"""Playwright checks. Serve the repository parent on localhost:8000."""
import os
from arcade_helpers import launch_game
from playwright.sync_api import sync_playwright
BASE=os.environ.get('ARCADE_TEST_URL','http://127.0.0.1:8000/08_my-arcade/')
KEY='my-arcade:snake-invaders:best'
INIT="""
window.testNow=0;window.frames=[];
requestAnimationFrame=cb=>{frames.push(cb);return 1};
window.tick=ms=>{for(let left=ms;left>0;){const dt=Math.min(left,10);left-=dt;testNow+=dt;frames.splice(0).forEach(cb=>cb(testNow));}};
"""
CAPTURE='\nconst Original=SnakeInvaders.Game;SnakeInvaders.Game=class extends Original{constructor(options){super(options);window.g=this}};'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
    def capture(route):
        response=route.fetch();route.fulfill(response=response,body=response.text()+CAPTURE)
    for mobile in [False,True]:
        context=browser.new_context(viewport={'width':390 if mobile else 1100,'height':844},is_mobile=mobile,has_touch=mobile,device_scale_factor=2)
        context.add_init_script(INIT)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('**/snake-invaders/model.js',capture)
        page.goto(BASE);page.locator('#game-list .is-selected').wait_for()
        assert page.locator('#game-list .cabinet').count()==7
        launch_game(page, 'SNAKE INVADERS')
        assert page.locator('#sound').inner_text()=='SOUND OFF'
        assert page.locator('#pause').is_disabled()
        for w,h in [(320,568),(360,640),(390,844),(430,932),(1100,844),(844,390)]:
            page.set_viewport_size({'width':w,'height':h})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
            box=page.locator('canvas').bounding_box();assert abs(box['width']/box['height']-9/16)<.001
            assert box['x']>=0 and box['y']>=0 and box['y']+box['height']<=h
            for control in ['start','sound']:
                b=page.locator('#'+control).bounding_box();assert b['height']>=44 and b['y']>=0 and b['y']+b['height']<=h
        page.set_viewport_size({'width':390 if mobile else 1100,'height':844})
        page.screenshot(path=f'/tmp/snake-start-{mobile}.png')
        page.locator('#sound').click();assert page.locator('#sound').get_attribute('aria-pressed')=='true'
        page.locator('#start').click();assert page.evaluate('g.snakes.length')==1
        assert page.locator('#overlay').is_hidden() and page.locator('#sound').is_hidden()
        page.evaluate('g.fireClock=-10000;tick(10)')
        if mobile:
            box=page.locator('canvas').bounding_box();x=box['x']+box['width']*.25;y=box['y']+box['height']*.9
            session=context.new_cdp_session(page)
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            assert abs(page.evaluate('g.ship')-90)<1
            session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+box['width']*.5,'y':y}]})
            assert abs(page.evaluate('g.ship')-270)<1
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});session.detach()
            assert page.evaluate('scrollY')==0
        else:
            page.keyboard.down('ArrowLeft');page.evaluate('tick(500)');page.keyboard.up('ArrowLeft');assert page.evaluate('g.ship')<100
            page.keyboard.down('ArrowRight');page.evaluate('tick(1500)');page.keyboard.up('ArrowRight');assert page.evaluate('g.ship')==344
        page.evaluate('g.snakes=[];g.fireClock=0;tick(510)');assert page.evaluate('g.bullets.length')>0
        page.screenshot(path=f'/tmp/snake-playing-{mobile}.png')
        page.locator('#pause').click();snapshot=page.evaluate('JSON.stringify(g)');page.evaluate('tick(5000)');assert page.evaluate('JSON.stringify(g)')==snapshot
        assert page.locator('#screen-title').inner_text()=='PAUSED'
        page.locator('#resume').click();page.evaluate('tick(100)');assert page.evaluate('g.state')=='PLAYING'
        page.evaluate('g.snakes=[SnakeInvaders.createSnake(()=>0)];g.bullets=[];g.hit({snake:g.snakes[0],index:1})')
        assert page.evaluate(f'localStorage.getItem("{KEY}")')=='10'
        page.evaluate('tick(10)');assert page.locator('#best').inner_text()=='10'
        page.evaluate('g.hit({snake:g.snakes[0],index:0});tick(10)')
        assert page.locator('#score').inner_text()=='150' and page.locator('#best').inner_text()=='150'
        page.evaluate('g.snakes=[SnakeInvaders.createSnake(()=>0)];g.snakes[0].y=SnakeInvaders.LIMIT-SnakeInvaders.R;tick(10)')
        assert page.locator('#screen-title').inner_text()=='GAME OVER'
        assert page.locator('#result-score').inner_text()=='SCORE 150'
        page.screenshot(path=f'/tmp/snake-over-{mobile}.png')
        for w,h in [(320,568),(360,640),(430,932),(844,390)]:
            page.set_viewport_size({'width':w,'height':h})
            for control in ['retry','home']:
                b=page.locator('#'+control).bounding_box();assert b['height']>=44 and b['x']>=0 and b['y']>=0 and b['x']+b['width']<=w and b['y']+b['height']<=h
        page.set_viewport_size({'width':390 if mobile else 1100,'height':844})
        page.locator('#retry').click();assert page.evaluate('g.time===0&&g.score===0&&g.snakes.length===1')
        assert page.locator('#sound').inner_text()=='SOUND OFF' and page.locator('#best').inner_text()=='150'
        page.evaluate('tick(300);g.events=[]')
        page.evaluate('''Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));''')
        assert page.evaluate('g.state')=='PAUSED';snapshot=page.evaluate('JSON.stringify(g)');page.evaluate('tick(1000)');assert page.evaluate('JSON.stringify(g)')==snapshot
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:false})')
        page.locator('#resume').click();page.evaluate('g.snakes[0].y=SnakeInvaders.LIMIT;tick(20)')
        page.locator('#home').click();page.wait_for_url(BASE+'index.html')
        launch_game(page, 'SNAKE INVADERS')
        assert page.locator('#best').inner_text()=='150' and page.locator('#sound').inner_text()=='SOUND OFF'
        assert not errors,errors
        context.close();print('PASS', 'Android touch' if mobile else 'PC keys','9:16 layout, start, firing, pause/resume, BEST, sound reset, retry/home, visibility',flush=True)
    for blocked in ["Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}})","Storage.prototype.setItem=function(){throw Error('blocked')}"]:
        context=browser.new_context();context.add_init_script(INIT);context.add_init_script(blocked)
        page=context.new_page();page.route('**/snake-invaders/model.js',capture);page.goto(BASE+'games/snake-invaders/')
        page.locator('#start').click();page.evaluate('g.snakes=[SnakeInvaders.createSnake(()=>0)];g.hit({snake:g.snakes[0],index:0});tick(10)')
        assert page.locator('#best').inner_text()=='160';context.close()
    print('PASS storage exceptions retain session BEST',flush=True)
    context=browser.new_context(viewport={'width':390,'height':844})
    page=context.new_page();page.route('**/snake-invaders/model.js',capture);page.goto(BASE+'games/snake-invaders/')
    page.locator('#start').click();page.wait_for_timeout(1100)
    assert page.evaluate('g.time')>.7 and page.evaluate('g.bullets.length')>=1
    page.screenshot(path='/tmp/snake-real-frame.png')
    context.close();print('PASS real animation frames',flush=True)
    # Observe Web Audio scheduling without adding production debug hooks.
    context=browser.new_context();page=context.new_page();page.route('**/snake-invaders/model.js',capture)
    page.goto(BASE+'games/snake-invaders/')
    page.evaluate('''() => {window.frequencies=[];const original=AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator=function(){const o=original.call(this),set=o.frequency.setValueAtTime.bind(o.frequency);o.frequency.setValueAtTime=(value,time)=>{frequencies.push(value);return set(value,time)};return o}}''')
    page.locator('#sound').click();page.locator('#start').click();page.wait_for_timeout(650)
    assert 650 in page.evaluate('frequencies')
    page.evaluate('g.hit({snake:g.snakes[0],index:1})');page.wait_for_timeout(50)
    assert 180 in page.evaluate('frequencies')
    page.evaluate('g.hit({snake:g.snakes[0],index:0})');page.wait_for_timeout(50)
    assert 880 in page.evaluate('frequencies')
    page.locator('#pause').click();page.wait_for_timeout(50);before=page.evaluate('frequencies.length');page.wait_for_timeout(350)
    assert page.evaluate('frequencies.length')==before
    context.close();print('PASS three Web Audio effects and paused audio scheduling',flush=True);browser.close()
