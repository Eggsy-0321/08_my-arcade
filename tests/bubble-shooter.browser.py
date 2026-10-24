"""Optional Playwright check; serve the repository's parent directory on port 8000."""
import os
from arcade_helpers import launch_game
from playwright.sync_api import sync_playwright
BASE=os.environ.get('ARCADE_TEST_URL','http://127.0.0.1:8000/08_my-arcade/')
KEY='my-arcade:bubble-shooter:best'
INIT="""
window.testNow=0;window.frames=new Map();window.frameSerial=0;
requestAnimationFrame=cb=>{frames.set(++frameSerial,cb);return frameSerial};
cancelAnimationFrame=id=>frames.delete(id);
window.tick=ms=>{testNow+=ms;const batch=[...frames.values()];frames.clear();batch.forEach(cb=>cb(testNow))};
window.advance=n=>{for(let i=0;i<n;i++)tick(16)};
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
        assert page.locator('#game-list .cabinet').count()==8
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
    for blocked in ["Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}})","Storage.prototype.setItem=function(){throw Error('blocked')}"]:
        context=browser.new_context();context.add_init_script(blocked);context.add_init_script(INIT)
        page=context.new_page();page.route('**/bubble-shooter/model.js',capture);page.goto(BASE+'games/bubble-shooter/')
        page.locator('#start').click();page.evaluate('g.score=60;tick(0)');assert page.locator('#best').inner_text()=='60'
        context.close()
    print('PASS storage exceptions retain session BEST')
    context=browser.new_context(viewport={'width':320,'height':568},reduced_motion='reduce')
    page=context.new_page();page.route('**/bubble-shooter/model.js',capture);page.goto(BASE+'games/bubble-shooter/')
    page.locator('#start').click();page.keyboard.press('Space');page.wait_for_timeout(1200)
    assert page.evaluate('g.shot===null');assert page.evaluate('g.misses===1||g.score>0')
    page.screenshot(path='/tmp/bubble-real-frame.png');context.close()
    print('PASS real animation frames, Space and reduced motion');browser.close()
