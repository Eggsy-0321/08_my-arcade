"""Playwright development checks; serve the repository's parent on localhost:8000."""
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
 const start=AlienInvaders.Game.prototype.start;
 AlienInvaders.Game.prototype.start=function(){window.g=this;return start.call(this);};
}"""
COMPLETE = """({duration,hits})=>{
 g.elapsed=duration;g.hits=hits;
 g.enemies=[{col:2,row:0,hp:1,armored:false}];
 const r=g.rect(g.enemies[0]);g.lasers=[{x:r.x+14,y:r.y+22}];
 g.lives=1;g.bullets=[{x:g.ship,y:AlienInvaders.C.shipY}];tick(1);
}"""
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    for mobile in [False, True]:
        context = browser.new_context(viewport={'width':390 if mobile else 1100,'height':844}, is_mobile=mobile, has_touch=mobile)
        context.add_init_script(CLOCK)
        page = context.new_page(); errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE); launch_game(page,'ALIEN INVADERS'); page.evaluate(OBSERVE)
        assert page.locator('#screen-title').inner_text() == 'ALIEN\nINVADERS'
        page.evaluate('tick(3000)'); assert page.locator('#time').inner_text() == '0.00s'
        page.locator('#start').click(); assert page.evaluate('g.state') == 'PLAYING'
        assert page.evaluate('g.enemies.length') == 20
        if mobile:
            session=context.new_cdp_session(page)
            page.evaluate("document.getElementById('stick').addEventListener('pointerdown',e=>window.stickId=e.pointerId)")
            stick=page.locator('#stick').bounding_box(); fire=page.locator('#fire').bounding_box()
            sx,sy=stick['x']+stick['width']/2,stick['y']+stick['height']/2
            fx,fy=fire['x']+fire['width']/2,fire['y']+fire['height']/2
            def touches(kind,points):
                session.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':x,'y':y,'id':i} for x,y,i in points]})
                page.wait_for_timeout(50)
            touches('touchStart',[(sx,sy,1)])
            assert page.evaluate('g.direction') == 0
            touches('touchMove',[(sx+40,sy,1)])
            assert page.evaluate('g.direction') == 1
            touches('touchStart',[(sx+40,sy,1),(fx,fy,2)])
            assert page.evaluate('g.lasers.length') == 1
            assert page.locator('#fire').evaluate('n=>n.classList.contains("pressed")')
            page.evaluate('tick(349)'); assert page.evaluate('g.lasers.length') == 1
            page.evaluate('tick(1)'); assert page.evaluate('g.lasers.length') == 2
            assert page.evaluate('g.ship') > 180
            touches('touchMove',[(sx,sy,1),(fx,fy,2)]); assert page.evaluate('g.direction') == 0
            touches('touchMove',[(sx-40,sy,1),(fx,fy,2)]); assert page.evaluate('g.direction') == -1
            # Check one-pointer release while the other finger still holds FIRE.
            page.evaluate("document.getElementById('stick').dispatchEvent(new PointerEvent('pointerup',{pointerId:stickId,bubbles:true}))")
            assert page.evaluate('g.direction') == 0 and page.evaluate('g.firing')
            touches('touchEnd',[]); assert page.evaluate('g.direction') == 0
            assert not page.evaluate('g.firing')
            touches('touchStart',[(fx,fy,2)]); assert page.evaluate('g.firing')
            touches('touchCancel',[]); assert not page.evaluate('g.firing')
            assert page.locator('#knob').evaluate('n=>n.style.transform') == ''
            touches('touchStart',[(sx+40,sy,1),(fx,fy,2)]); page.locator('#pause').click()
            touches('touchEnd',[]); session.detach()
        else:
            page.keyboard.down('ArrowRight');page.keyboard.down('Space')
            assert page.evaluate('g.lasers.length') == 1
            page.evaluate('tick(349)');assert page.evaluate('g.lasers.length') == 1
            page.evaluate('tick(1)');assert page.evaluate('g.lasers.length') == 2
            assert page.evaluate('g.ship') > 180
            assert page.evaluate('scrollY') == 0
            page.locator('#pause').click();page.keyboard.up('Space');page.keyboard.up('ArrowRight')
        assert page.evaluate('g.state') == 'PAUSED'
        before=page.evaluate('g.elapsed'); page.evaluate('tick(9000)');assert page.evaluate('g.elapsed') == before
        assert page.evaluate('g.direction') == 0 and not page.evaluate('g.firing')
        page.locator('#resume').click();page.evaluate('tick(100)');assert abs(page.evaluate('g.elapsed')-before-.1)<1e-6
        assert not page.evaluate('g.firing')
        page.evaluate('g.lasers=Array.from({length:3},()=>({x:1,y:400}));g.cooldown=0')
        page.keyboard.down('Space');page.evaluate('tick(350)');page.keyboard.up('Space')
        assert page.evaluate('g.lasers.length') == 3
        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));tick(9000)")
        assert page.evaluate('g.state') == 'PAUSED'
        page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));tick(1000)")
        assert page.evaluate('g.state') == 'PAUSED'
        page.locator('#resume').click();page.evaluate("dispatchEvent(new Event('pagehide'))")
        assert page.evaluate('g.state') == 'PAUSED'
        page.locator('#resume').click();page.evaluate("dispatchEvent(new Event('blur'))")
        assert page.evaluate('g.state') == 'PAUSED'
        page.locator('#restart').click();assert page.evaluate('g.elapsed') == 0
        assert page.evaluate('g.bullets.length') == 0 and page.evaluate('g.lives') == 3
        if mobile:
            page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(100)
            assert page.evaluate('g.state') == 'PAUSED'; assert page.locator('#resume').is_disabled()
            page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(100)
            assert page.evaluate('g.state') == 'PAUSED';page.locator('#resume').click()
        # Fail at the defense line; this must never save a BEST or display extra stats.
        page.evaluate('g.formation.y=AlienInvaders.C.defenseY;tick(1)')
        assert page.locator('#screen-title').inner_text() == 'GAME OVER'
        assert page.locator('#results').is_hidden();assert page.evaluate('localStorage.getItem("my-arcade:alien-invaders:best")') is None
        page.locator('#retry').click();page.evaluate(COMPLETE,{'duration':42.123,'hits':1})
        assert page.evaluate('g.state') == 'CLEAR'; assert page.evaluate('g.hits') == 1
        assert page.locator('#raw-time').inner_text() == '42.12s'
        assert page.locator('#penalty').inner_text() == '+3.00s'
        assert page.locator('#final-time').inner_text() == page.locator('#best').inner_text() == '45.12s'
        assert page.locator('#new-best').is_visible()
        assert page.evaluate('localStorage.getItem("my-arcade:alien-invaders:best")') == '4512'
        page.screenshot(path=f'/tmp/alien-invaders-clear-{mobile}.png')
        if mobile:
            page.set_viewport_size({'width':320,'height':568});page.wait_for_timeout(80)
            home=page.locator('#home').bounding_box();assert home['y']+home['height'] <= page.locator('.playfield').bounding_box()['y']+page.locator('.playfield').bounding_box()['height']
            page.screenshot(path='/tmp/alien-invaders-clear-320.png')
            page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(80)
        page.evaluate('tick(9999)');assert page.locator('#time').inner_text() == '42.12s'
        for duration in [42.123,50,40]:
            page.locator('#retry').click();page.evaluate(COMPLETE,{'duration':duration,'hits':1})
            assert page.locator('#new-best').is_visible() == (duration==40)
        assert page.locator('#best').inner_text() == '43.00s'
        page.locator('#sound').click();assert page.locator('#sound').inner_text() == 'SOUND OFF'
        page.reload();page.evaluate(OBSERVE);assert page.locator('#sound').inner_text() == 'SOUND OFF'
        assert page.evaluate('localStorage.getItem("my-arcade:alien-invaders:best")') == '4300'
        page.locator('#start').click()
        for width,height in [(320,568),(360,640),(390,844),(430,932),(1100,844)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(60)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert page.evaluate('document.documentElement.scrollHeight <= innerHeight'),(width,height)
            for name in ['stick','fire']:
                box=page.locator('#'+name).bounding_box();assert box['y']+box['height'] <= height and box['width']>=76
            box=page.locator('canvas').bounding_box();assert abs(box['width']/box['height']-.75)<.01
        page.set_viewport_size({'width':390 if mobile else 1100,'height':844});page.wait_for_timeout(60)
        page.screenshot(path=f'/tmp/alien-invaders-play-{mobile}.png')
        if page.evaluate('g.state') == 'PAUSED': page.locator('#resume').click()
        page.locator('#pause').click();page.locator('#home').click();page.wait_for_url(BASE+'index.html')
        assert not errors, errors
        context.close();print('PASS:', 'Android multitouch' if mobile else 'PC keyboard', 'shooting, pause, visibility, blur, orientation, restart, results, best, reload, layouts, home',flush=True)
    # Storage/audio failures must preserve play and session records.
    for failure in ['get','set','invalid','audio-missing','audio-throws','audio-rejects']:
        context=browser.new_context();context.add_init_script(CLOCK)
        if failure in ['get','set']:context.add_init_script(f'Storage.prototype.{failure}Item=function(){{throw Error("blocked")}}')
        elif failure=='audio-missing':context.add_init_script('window.AudioContext=undefined;window.webkitAudioContext=undefined')
        elif failure=='audio-throws':context.add_init_script('window.AudioContext=class{constructor(){throw Error("blocked")}}')
        elif failure=='audio-rejects':context.add_init_script('window.AudioContext=class{state="suspended";resume(){return Promise.reject(Error("blocked"))}}')
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'games/alien-invaders/');page.evaluate(OBSERVE)
        if failure=='invalid':page.evaluate('localStorage.setItem("my-arcade:alien-invaders:best","NaN")');page.reload();page.evaluate(OBSERVE)
        page.locator('#start').click();page.evaluate(COMPLETE,{'duration':40,'hits':0})
        assert page.locator('#best').inner_text() == '40.00s'
        page.locator('#retry').click();page.evaluate(COMPLETE,{'duration':50,'hits':0})
        assert page.locator('#best').inner_text() == '40.00s';assert not errors,errors
        context.close();print('PASS:',failure,flush=True)
    # Real animation and Web Audio, independently of the controlled clock.
    context=browser.new_context();page=context.new_page();page.goto(BASE+'games/alien-invaders/');page.evaluate(OBSERVE)
    page.evaluate('''() => {window.tones=0;const make=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){tones++;return make.call(this)}}''')
    page.locator('#start').click();page.keyboard.down('ArrowLeft');page.keyboard.down('Space');page.wait_for_timeout(420)
    page.keyboard.up('ArrowLeft');page.keyboard.up('Space')
    assert page.evaluate('g.ship')<180 and page.evaluate('g.elapsed')>.35
    assert page.evaluate('tones')>=2
    page.evaluate('''() => {g.events.push('destroy','hit','clear')}''');page.wait_for_timeout(80)
    assert page.evaluate('tones')>=7
    page.locator('#sound').click();tones=page.evaluate('tones');page.keyboard.press('Space');page.wait_for_timeout(400);assert page.evaluate('tones')==tones
    page.screenshot(path='/tmp/alien-invaders-real.png');context.close();browser.close()
    print('PASS: real animation frames and four Web Audio effects, sound OFF',flush=True)
