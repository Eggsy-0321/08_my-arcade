"""Development-only Chromium checks; serve the repository parent on :8000."""
import os
from playwright.sync_api import sync_playwright
from arcade_helpers import launch_game
BASE=os.environ.get('ARCADE_TEST_URL','http://127.0.0.1:8000/08_my-arcade/')
CLOCK="""window.testNow=0;window.frames=[];requestAnimationFrame=cb=>{frames.push(cb);return 1};performance.now=()=>testNow;
window.tick=ms=>{testNow+=ms;frames.splice(0).forEach(cb=>cb(testNow))};
window.advance=ms=>{while(ms>0){const n=Math.min(ms,50);tick(n);ms-=n}};"""
OBSERVE="""() => {const start=CycleRunner.Game.prototype.start;CycleRunner.Game.prototype.start=function(){window.g=this;return start.call(this)}}"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
    for mobile in [False,True]:
        c=browser.new_context(viewport={'width':390 if mobile else 1100,'height':844},is_mobile=mobile,has_touch=mobile)
        c.add_init_script(CLOCK);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE);launch_game(page,'CYCLE RUNNER');page.wait_for_url(BASE+'games/cycle-runner/index.html');page.evaluate(OBSERVE)
        page.locator('#start').click();page.evaluate('tick(0)');assert page.locator('#countdown').inner_text()=='3'
        for text in ['2','1','GO!']:
            page.evaluate('advance(1000)');assert page.locator('#countdown').inner_text()==text
            assert page.evaluate('g.distance')==0 and page.evaluate('g.elapsed')==0
        page.evaluate('advance(350)');assert page.evaluate('g.state')=='RUNNING'
        if mobile:
            session=c.new_cdp_session(page);b=page.locator('#jump').bounding_box();point={'x':b['x']+b['width']/2,'y':b['y']+b['height']/2,'id':1}
            session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point]})
            assert page.evaluate('g.jumps')==1;page.evaluate('advance(200)');assert page.evaluate('g.jumps')==1
            session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.locator('#jump').tap()
        else:
            page.keyboard.down('Space');page.keyboard.down('Space');page.evaluate('advance(200)');assert page.evaluate('g.jumps')==1
            page.keyboard.up('Space');page.keyboard.press('Space')
        assert page.evaluate('g.jumps')==2;page.locator('#jump').dispatch_event('pointerdown',{'pointerId':99,'pointerType':'touch'});assert page.evaluate('g.jumps')==2
        page.evaluate('advance(1000)');assert page.evaluate('g.jumps')==0
        page.keyboard.press('Escape');assert page.evaluate('g.state')=='PAUSED';before=page.evaluate('[g.distance,g.elapsed,g.y]');page.evaluate('advance(5000)');assert page.evaluate('[g.distance,g.elapsed,g.y]')==before
        page.keyboard.press('Escape');assert page.evaluate('g.state')=='COUNTDOWN';page.evaluate('tick(0);advance(3350)');assert page.evaluate('g.distance')==before[0]
        for event in ['blur','pagehide','orientationchange','visibilitychange']:
            if event=='visibilitychange':page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
            else:page.evaluate('(e)=>dispatchEvent(new Event(e))',event)
            assert page.evaluate('g.state')=='PAUSED'
            if event=='visibilitychange':page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false})")
            page.locator('#resume').click();page.evaluate('tick(0);advance(3350)');assert page.evaluate('g.state')=='RUNNING'
        page.evaluate('tick(5000)');assert page.evaluate('g.state')=='PAUSED'
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);page.locator('#resume').click();page.evaluate('tick(0);advance(500)');page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(100);assert page.evaluate('g.state')=='PAUSED'
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100);page.locator('#resume').click();page.evaluate('tick(0);advance(3350)')
        page.evaluate("g.groups=[];g.next=1e6;advance(2000);g.over('test');tick(0)");assert page.locator('#heading').inner_text()=='GAME OVER'
        assert int(page.evaluate('localStorage.getItem("my-arcade:cycle-runner:best")'))>0
        best=page.locator('#best').inner_text();course=page.evaluate('JSON.stringify(g.groups)')
        for width,height in [(320,568),(360,640),(390,844),(430,932),(1100,844),(844,390)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(50)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'),(width,height)
            for id in ['retry','home','jump']:
                b=page.locator('#'+id).bounding_box();assert b['height']>=44 and b['y']+b['height']<=height,(id,width,height,b)
        page.set_viewport_size({'width':390,'height':844});page.screenshot(path=f'/tmp/cycle-result-{mobile}.png')
        page.locator('#retry').click();assert page.evaluate('g.distance+g.jumps+g.y+g.elapsed')==0;assert page.evaluate('g.speed')==110;assert page.evaluate('JSON.stringify(g.groups)')!=course
        page.locator('#sound').click();page.reload();assert page.locator('#sound').inner_text()=='SOUND OFF';assert page.locator('#best').inner_text()==best
        page.locator('#home').click();page.wait_for_url(BASE+'index.html');assert not errors,errors;c.close()
        print('PASS:', 'Android touch' if mobile else 'PC keyboard', 'countdown, holds, jumps, pause/resume, lifecycle/sleep/rotation, retry, storage, layouts, portal/home',flush=True)
    for failure in ['get','set','invalid','audio-missing','audio-throws','audio-rejects']:
        c=browser.new_context();c.add_init_script(CLOCK)
        if failure in ['get','set']:c.add_init_script(f'Storage.prototype.{failure}Item=function(){{throw Error("blocked")}}')
        elif failure=='invalid':c.add_init_script('localStorage.setItem("my-arcade:cycle-runner:best","NaN")')
        elif failure=='audio-missing':c.add_init_script('window.AudioContext=undefined;window.webkitAudioContext=undefined')
        elif failure=='audio-throws':c.add_init_script('window.AudioContext=class{constructor(){throw Error("blocked")}}')
        elif failure=='audio-rejects':c.add_init_script('window.AudioContext=class{state="suspended";resume(){return Promise.reject(Error("blocked"))}}')
        page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+'games/cycle-runner/');page.evaluate(OBSERVE)
        page.locator('#start').click();page.evaluate("tick(0);advance(3350);g.groups=[];g.next=1e6;advance(2000);g.over('test');tick(0)")
        assert page.locator('#best').inner_text()!='0 m';assert page.locator('#retry').is_visible();assert not errors,errors;c.close();print('PASS:',failure,flush=True)
    c=browser.new_context(viewport={'width':390,'height':844});page=c.new_page();page.goto(BASE+'games/cycle-runner/');page.evaluate(OBSERVE)
    page.evaluate("() => {window.tones=0;const make=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){tones++;return make.call(this)};}")
    page.locator('#start').click();page.wait_for_timeout(3550);assert page.evaluate('g.state')=='RUNNING';page.locator('#jump').click();page.wait_for_timeout(100);page.locator('#jump').click();page.wait_for_function('g.jumps===0',timeout=3000)
    assert page.evaluate('tones')>=6, page.evaluate('[tones,g.state,g.jumps,g.y]');assert page.evaluate('g.distance')>0;page.screenshot(path='/tmp/cycle-running.png');c.close();browser.close();print('PASS: real animation frames, countdown, jump/double/landing audio',flush=True)
