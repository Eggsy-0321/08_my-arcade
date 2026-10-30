"""Development-only Chromium checks. Native Android touch emulation is not a real-device test."""
import os
from playwright.sync_api import sync_playwright
from arcade_helpers import launch_game
BASE=os.environ.get('ARCADE_TEST_URL','http://127.0.0.1:8000/08_my-arcade/')
CLOCK="""window.testNow=0;window.frames=[];requestAnimationFrame=cb=>{frames.push(cb);return 1};
window.tick=ms=>{testNow+=ms;frames.splice(0).forEach(cb=>cb(testNow))};
window.advance=ms=>{while(ms>0){const n=Math.min(ms,25);tick(n);ms-=n}};"""
OBSERVE="""() => {const start=BlockFall.Game.prototype.start;BlockFall.Game.prototype.start=function(){window.g=this;this.random=BlockFall.seeded(20261029);return start.call(this)};
const press=BlockFall.Input.prototype.press;BlockFall.Input.prototype.press=function(...args){window.inputs=this;return press.apply(this,args)};}"""
def begin(page):
    page.locator('#start').click();page.evaluate('tick(0)');assert page.locator('#countdown').inner_text()=='3'
    for expected in ['2','1']:
        page.evaluate('advance(1000)');assert page.locator('#countdown').inner_text()==expected;assert page.evaluate('g.active.y+g.score')==0
    page.evaluate('advance(1000)');assert page.evaluate('g.state')=='PLAYING'
def resume(page):
    page.locator('#resume').click();page.evaluate('tick(0);advance(2999)');assert page.evaluate('g.state')=='COUNTDOWN'
    page.evaluate('advance(1)');assert page.evaluate('g.state')=='PLAYING'
def point(page,action,id):
    b=page.locator(f'[data-action={action}]').bounding_box();return dict(x=b['x']+b['width']/2,y=b['y']+b['height']/2,id=id)
def touch(session,kind,points):session.send('Input.dispatchTouchEvent',dict(type=kind,touchPoints=points))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
    for mobile in [False,True]:
        c=browser.new_context(viewport=dict(width=390 if mobile else 1100,height=844),is_mobile=mobile,has_touch=mobile)
        c.add_init_script(CLOCK);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE);launch_game(page,'BLOCK FALL');page.wait_for_url(BASE+'games/block-fall/index.html');page.evaluate(OBSERVE)
        page.evaluate('localStorage.setItem("my-arcade:cycle-runner:best","123")')
        assert page.locator('[data-action]').count()==5;assert page.locator('#heading').inner_text()=='BLOCK FALL';begin(page)
        assert page.locator('#next').get_attribute('aria-label')=='次のブロック '+page.evaluate('g.next')
        assert page.evaluate("document.querySelector('#next').getContext('2d').getImageData(0,0,160,120).data.some(v=>v)")
        page.evaluate("g.active={type:'O',x:4,y:0,rotation:0};tick(0)")
        if mobile:
            session=c.new_cdp_session(page);left=point(page,'left',1);soft=point(page,'soft',2)
            touch(session,'touchStart',[left]);assert page.evaluate('g.active.x')==3
            page.evaluate('advance(160)');assert page.evaluate('g.active.x')==3
            page.evaluate('advance(60)');assert page.evaluate('g.active.x')==1
            touch(session,'touchStart',[left,soft]);assert page.evaluate('g.score')==1
            page.evaluate('advance(140)');assert page.evaluate('g.score')>=5
            touch(session,'touchEnd',[left]);assert page.evaluate('inputs.has("soft") && !inputs.has("left")'),page.evaluate('[...inputs.sources]')
            touch(session,'touchEnd',[]);before=page.evaluate('[g.active.x,g.active.y,g.score]');page.evaluate('advance(150)');assert page.evaluate('[g.active.x,g.active.y,g.score]')==before
            page.locator('[data-action=rotate]').tap();assert page.evaluate('g.active.rotation')==1
            right=point(page,'right',3);touch(session,'touchStart',[right]);touch(session,'touchMove',[dict(right,y=right['y']-150)])
            assert page.evaluate('inputs.sources.size')==0;touch(session,'touchEnd',[])
            touch(session,'touchStart',[point(page,'soft',4)]);touch(session,'touchCancel',[]);assert page.evaluate('inputs.sources.size')==0
            page.locator('[data-action=hard]').tap()
        else:
            page.keyboard.down('ArrowLeft');assert page.evaluate('g.active.x')==3
            page.keyboard.down('ArrowLeft');assert page.evaluate('g.active.x')==3
            page.evaluate('advance(160)');assert page.evaluate('g.active.x')==3
            page.evaluate('advance(60)');assert page.evaluate('g.active.x')==1
            page.keyboard.up('ArrowLeft');page.keyboard.press('ArrowRight');assert page.evaluate('g.active.x')==2
            page.keyboard.press('ArrowUp');assert page.evaluate('g.active.rotation')==1
            page.keyboard.down('ArrowDown');page.evaluate('advance(140)');page.keyboard.up('ArrowDown');assert page.evaluate('g.score')>=5
            before=page.evaluate('[g.active.y,g.score]');page.evaluate('advance(150)');assert page.evaluate('[g.active.y,g.score]')==before
            assert page.evaluate("['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].every(code=>{const e=new KeyboardEvent('keydown',{code,bubbles:true,cancelable:true,repeat:true});document.body.dispatchEvent(e);return e.defaultPrevented})")
            page.keyboard.press('Space')
        assert page.evaluate('g.board.flat().filter(Boolean).length')==4;assert page.evaluate('scrollY')==0
        page.keyboard.down('ArrowDown');page.keyboard.down('ArrowLeft');page.keyboard.press('Escape');assert page.evaluate('g.state')=='PAUSED'
        before=page.evaluate('JSON.stringify([g.board,g.active,g.score,g.lockTime,g.fallTime])');page.evaluate('advance(5000)')
        page.keyboard.press('ArrowUp');page.keyboard.press('Space');assert page.evaluate('JSON.stringify([g.board,g.active,g.score,g.lockTime,g.fallTime])')==before
        assert page.evaluate('inputs.sources.size')==0
        page.keyboard.up('ArrowDown');page.keyboard.up('ArrowLeft');page.keyboard.press('Escape');assert page.evaluate('g.state')=='COUNTDOWN'
        page.evaluate('tick(0);advance(3000)');assert page.evaluate('JSON.stringify([g.board,g.active,g.score,g.lockTime,g.fallTime])')==before
        for event in ['blur','pagehide','orientationchange','visibilitychange','screen-orientation']:
            page.keyboard.down('ArrowLeft')
            if event=='visibilitychange':page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
            elif event=='screen-orientation':page.evaluate("screen.orientation.dispatchEvent(new Event('change'))")
            else:page.evaluate('(e)=>dispatchEvent(new Event(e))',event)
            page.keyboard.up('ArrowLeft');assert page.evaluate('g.state')=='PAUSED';assert page.evaluate('inputs.sources.size')==0
            if event=='visibilitychange':page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))")
            page.evaluate('advance(500)');assert page.evaluate('g.state')=='PAUSED';resume(page)
        page.evaluate('tick(5000)');assert page.evaluate('g.state')=='PAUSED';resume(page)
        page.set_viewport_size(dict(width=390,height=844));page.wait_for_timeout(100)
        if page.evaluate('g.state')=='PAUSED':resume(page)
        page.set_viewport_size(dict(width=844,height=390));page.wait_for_timeout(100);assert page.evaluate('g.state')=='PAUSED'
        page.set_viewport_size(dict(width=390,height=844));page.wait_for_timeout(100);resume(page)
        page.locator('#pause').click();page.locator('#resume').click();page.evaluate('tick(0);advance(1100)');page.evaluate("dispatchEvent(new Event('blur'))");resume(page)
        for width,height in [(320,568),(360,640),(390,844),(430,932),(1100,844),(844,390)]:
            page.set_viewport_size(dict(width=width,height=height));page.wait_for_timeout(60)
            for id in ['board','score','best','lines','level','next','sound','pause']:
                b=page.locator('#'+id).bounding_box();assert b['x']>=0 and b['y']>=0 and b['x']+b['width']<=width+1 and b['y']+b['height']<=height+1,(id,width,height,b)
            b=page.locator('#board').bounding_box();assert abs(b['width']/b['height']-.5)<.01,(width,height,b)
            for b in page.locator('[data-action]').all():
                box=b.bounding_box();assert box['width']>=44 and box['height']>=44 and box['y']+box['height']<=height
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'),(width,height)
        page.set_viewport_size(dict(width=390,height=844));page.wait_for_timeout(60)
        if page.evaluate('g.state')=='PAUSED':resume(page)
        page.evaluate("g.board=BlockFall.emptyBoard();g.active={type:'I',x:2,y:16,rotation:1};for(let y=16;y<20;y++){g.board[y].fill('J');g.board[y][4]=null;}g.lock();tick(0)")
        assert page.locator('#lines').inner_text()=='4';assert int(page.locator('#score').inner_text())>=800
        page.screenshot(path=f'/tmp/block-fall-playing-{mobile}.png')
        page.evaluate("g.board[0].fill('J');g.board[1].fill('J');g.spawn();tick(0)");assert page.locator('#heading').inner_text()=='GAME OVER'
        for label in ['SCORE','BEST','LINES']:assert label in page.locator('#results').inner_text()
        best=page.locator('#best').inner_text();assert int(best)>=800;page.screenshot(path=f'/tmp/block-fall-over-{mobile}.png')
        page.locator('#retry').click();assert page.evaluate('g.score+g.lines+g.fallTime+g.lockTime')==0;assert page.evaluate('g.level')==1;assert page.evaluate('g.board.flat().filter(Boolean).length')==0
        page.locator('#sound').click();page.reload();assert page.locator('#sound').inner_text()=='SOUND OFF';assert page.locator('#best').inner_text()==best
        assert page.evaluate('localStorage.getItem("my-arcade:cycle-runner:best")')=='123'
        page.locator('#home').click();page.wait_for_url(BASE+'index.html');assert not errors,errors;c.close()
        print('PASS:', 'Android emulated native multitouch' if mobile else 'PC keyboard', 'countdown, repeat/drop/release, rotation, NEXT, clear, pause/lifecycle/sleep, layouts, retry, storage, portal/HOME',flush=True)
    for failure in ['get','set','invalid','audio-missing','audio-throws','audio-rejects']:
        c=browser.new_context();c.add_init_script(CLOCK)
        if failure in ['get','set']:c.add_init_script(f'Storage.prototype.{failure}Item=function(){{throw Error("blocked")}}')
        elif failure=='invalid':c.add_init_script('localStorage.setItem("my-arcade:block-fall:best","NaN")')
        elif failure=='audio-missing':c.add_init_script('window.AudioContext=undefined;window.webkitAudioContext=undefined')
        elif failure=='audio-throws':c.add_init_script('window.AudioContext=class{constructor(){throw Error("blocked")}}')
        elif failure=='audio-rejects':c.add_init_script('window.AudioContext=class{state="suspended";resume(){return Promise.reject(Error("blocked"))}}')
        page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE+'games/block-fall/');page.evaluate(OBSERVE)
        begin(page);page.keyboard.press('Space');page.evaluate("g.over();tick(0)");assert int(page.locator('#best').inner_text())>0;assert page.locator('#retry').is_visible();assert not errors,errors
        c.close();print('PASS:',failure,flush=True)
    c=browser.new_context(viewport=dict(width=390,height=844));page=c.new_page();page.goto(BASE+'games/block-fall/');page.evaluate(OBSERVE)
    page.evaluate("() => {window.tones=0;const create=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){tones++;return create.call(this)}}")
    page.locator('#start').click();page.wait_for_function("g.state==='PLAYING'",timeout=5000)
    page.wait_for_function('g.active.y>0',timeout=2000);page.keyboard.press('ArrowLeft');page.keyboard.press('ArrowUp');page.keyboard.press('Space')
    page.evaluate("g.board=BlockFall.emptyBoard();g.active={type:'I',x:2,y:16,rotation:1};g.board[19].fill('J');g.board[19][4]=null;g.lock();g.over()")
    assert page.evaluate('tones')>=10;page.wait_for_timeout(250);page.screenshot(path='/tmp/block-fall-real-frame.png');c.close()
    print('PASS: real animation/countdown/gravity, move/rotate/land/clear/GAME OVER Web Audio',flush=True)
    browser.close()
