"""Development-only Playwright checks. Serve the repository's parent on :8000."""
import os
from arcade_helpers import launch_game
from playwright.sync_api import sync_playwright
BASE = os.environ.get('ARCADE_TEST_URL', 'http://127.0.0.1:8000/08_my-arcade/')
CLOCK = """
window.testNow=0;window.frames=[];
requestAnimationFrame=cb=>{frames.push(cb);return 1;};performance.now=()=>testNow;
window.tick=ms=>{testNow+=ms;frames.splice(0).forEach(cb=>cb(testNow));};
window.advance=ms=>{while(ms>0){const step=Math.min(ms,1000);tick(step);ms-=step;}};
"""
OBSERVE = """() => {
 const start=FlashlightMaze.Game.prototype.start;
 FlashlightMaze.Game.prototype.start=function(){window.g=this;return start.call(this);};
}"""
NEXT = """() => {const route=FlashlightMaze.path(g.board),p=route[1];return Object.entries(FlashlightMaze.directions).find(([,d])=>p.x-1===d[0]&&p.y-1===d[1])[0];}"""
SOLVE = """() => {
 const route=FlashlightMaze.path(g.board);
 for (let i=1;i<route.length;i++) {
  const a=route[i-1],b=route[i];
  const d=Object.entries(FlashlightMaze.directions).find(([,v])=>b.x-a.x===v[0]&&b.y-a.y===v[1])[0];
  document.getElementById(d).click();
 }
}"""
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
    for mobile in [False,True]:
        context=browser.new_context(viewport={'width':390 if mobile else 1100,'height':844},is_mobile=mobile,has_touch=mobile)
        context.add_init_script(CLOCK);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE);launch_game(page,'FLASHLIGHT MAZE');page.evaluate(OBSERVE)
        assert page.locator('#start').is_visible()
        page.evaluate('advance(3000)');assert page.locator('#time').inner_text()=='10'
        page.locator('#start').click();initial=page.evaluate('JSON.stringify(g.board)')
        assert page.evaluate('g.state')=='MEMORY'
        assert page.evaluate('g.board.length===17 && g.board.every(row=>row.length===17)')
        if mobile:
            for width,height in [(320,568),(360,640),(390,844),(430,932)]:
                page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(60)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight')
                assert page.locator('canvas').bounding_box()['width']/17>=14
                page.screenshot(path=f'/tmp/flashlight-balance-memory-{width}.png')
            page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(60)
        page.keyboard.press('ArrowDown');assert page.evaluate('g.player.y')==1
        assert page.locator('#down').is_disabled()
        page.evaluate('advance(3000)');page.locator('#pause').click();assert page.evaluate('g.memory')==7000
        assert page.evaluate("Array.from(document.querySelector('canvas').getContext('2d').getImageData(0,0,520,520).data).filter((_,i)=>i%4!==3).every(v=>v===0)")
        page.evaluate('advance(9000)');assert page.evaluate('g.memory')==7000
        page.locator('#resume').click();page.evaluate('advance(6999)');assert page.evaluate('g.state')=='MEMORY'
        page.evaluate('tick(1)');assert page.evaluate('g.state')=='ESCAPE';assert page.locator('#time').inner_text()=='00:00.00'
        assert not page.locator('#down').is_disabled()
        # Raster output: fully black outside circle; near wall remains visible; goal hidden.
        assert page.evaluate("Array.from(document.querySelector('canvas').getContext('2d').getImageData(460,460,40,40).data).filter((_,i)=>i%4!==3).every(v=>v===0)")
        assert page.evaluate("document.querySelector('canvas').getContext('2d').getImageData(60,20,1,1).data[0]")>0
        assert not page.evaluate('g.visible(15,15)')
        direction=page.evaluate(NEXT)
        key={'up':'ArrowUp','down':'ArrowDown','left':'ArrowLeft','right':'ArrowRight'}[direction]
        # A single physical tap / keydown moves exactly one cell.
        if mobile:page.locator('#'+direction).tap()
        else:page.keyboard.press(key)
        assert page.evaluate('Math.abs(g.player.x-1)+Math.abs(g.player.y-1)')==1
        page.evaluate('advance(500)');assert page.evaluate('Math.abs(g.player.x-1)+Math.abs(g.player.y-1)')==1
        # Use a verified open straight segment to observe repeated movement through public input.
        page.evaluate('g.player={x:1,y:1}')
        if mobile:
            session=context.new_cdp_session(page);box=page.locator('#'+direction).bounding_box();x,y=box['x']+box['width']/2,box['y']+box['height']/2
            def touch(kind,points):session.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':points})
            touch('touchStart',[{'x':x,'y':y,'id':1}])
        else:page.keyboard.down(key)
        assert page.evaluate('Math.abs(g.player.x-1)+Math.abs(g.player.y-1)')==1
        page.evaluate('tick(279)');assert page.evaluate('Math.abs(g.player.x-1)+Math.abs(g.player.y-1)')==1
        page.evaluate('tick(1)');assert page.evaluate('Math.abs(g.player.x-1)+Math.abs(g.player.y-1)')==2
        if mobile:touch('touchEnd',[])
        else:page.keyboard.up(key)
        pos=page.evaluate('JSON.stringify(g.player)');page.evaluate('advance(500)');assert page.evaluate('JSON.stringify(g.player)')==pos
        if mobile:
            touch('touchStart',[{'x':x,'y':y,'id':1}]);touch('touchCancel',[])
            pos=page.evaluate('JSON.stringify(g.player)');page.evaluate('advance(500)');assert page.evaluate('JSON.stringify(g.player)')==pos
            touch('touchStart',[{'x':x,'y':y,'id':1}]);touch('touchMove',[{'x':1,'y':1,'id':1}])
            pos=page.evaluate('JSON.stringify(g.player)');page.evaluate('advance(500)');assert page.evaluate('JSON.stringify(g.player)')==pos
            touch('touchEnd',[]);session.detach()
        # WASD, walls, pause clears held state.
        page.evaluate('g.player={x:1,y:1}');page.keyboard.press('w');page.keyboard.press('a');assert page.evaluate('g.player.x+g.player.y')==2
        page.keyboard.down({'right':'d','down':'s'}[direction]);page.locator('#pause').click()
        page.keyboard.up({'right':'d','down':'s'}[direction]);before=page.evaluate('g.elapsed');pos=page.evaluate('JSON.stringify(g.player)')
        page.evaluate('advance(7000)');assert page.evaluate('g.elapsed')==before
        page.locator('#resume').click();page.evaluate('tick(250)');assert page.evaluate('g.elapsed')==before+250
        assert page.evaluate('JSON.stringify(g.player)')==pos
        for event in ['visibilitychange','blur','pagehide','orientationchange']:
            if event=='visibilitychange':page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
            else:page.evaluate('(e)=>dispatchEvent(new Event(e))',event)
            assert page.evaluate('g.state')=='PAUSED',event
            page.evaluate('advance(3000)')
            if event=='visibilitychange':page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))")
            assert page.evaluate('g.state')=='PAUSED';page.locator('#resume').click()
        # Missing frames after sleep pauses at the last rendered instant.
        before=page.evaluate('g.elapsed');page.evaluate('tick(5000)');assert page.evaluate('g.state')=='PAUSED';assert page.evaluate('g.elapsed')==before
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(80)
        page.locator('#restart').click();assert page.evaluate('g.state')=='MEMORY';assert page.evaluate('g.elapsed')==0
        assert page.evaluate('JSON.stringify(g.board)')!=initial
        page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(80);assert page.evaluate('g.state')=='PAUSED'
        page.set_viewport_size({'width':390 if mobile else 1100,'height':844});page.wait_for_timeout(80);assert page.evaluate('g.state')=='PAUSED'
        page.locator('#resume').click();page.evaluate('advance(10000)');page.evaluate('advance(1234)');page.evaluate(SOLVE)
        assert page.evaluate('g.state')=='CLEAR';assert page.locator('#final-time').inner_text()=='00:01.23'
        assert page.locator('#final-best').inner_text()=='00:01.23'
        assert page.evaluate('localStorage.getItem("my-arcade:flashlight-maze:best")')=='1234'
        assert page.evaluate('g.visible(0,0)')
        # Full maze is visible, with results outside the canvas.
        assert page.locator('#result-slot #overlay').is_visible()
        assert page.locator('#retry').is_visible() and page.locator('#home').is_visible()
        for width,height in [(320,568),(360,640),(390,844),(430,932),(1100,844)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(60)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,height)
            assert page.evaluate('document.documentElement.scrollHeight<=innerHeight'),(width,height,page.evaluate("Array.from(document.querySelector('.cabinet').children).map(n=>[n.tagName,n.id,n.getBoundingClientRect().y,n.getBoundingClientRect().height])"))
            assert page.locator('#home').bounding_box()['y']+page.locator('#home').bounding_box()['height']<=height
        page.screenshot(path=f'/tmp/flashlight-clear-{mobile}.png')
        for duration in [2000,1000]:
            page.locator('#retry').click();page.evaluate('advance(10000)');page.evaluate('advance('+str(duration)+')');page.evaluate(SOLVE)
            assert page.locator('#final-best').inner_text()==('00:01.23' if duration==2000 else '00:01.00')
        page.locator('#sound').click();page.reload();page.evaluate(OBSERVE);assert page.locator('#sound').inner_text()=='SOUND OFF';assert page.locator('#best').inner_text()=='00:01.00'
        page.locator('#start').click()
        for width,height in [(320,568),(360,640),(390,844),(430,932),(1100,844),(844,390)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(60)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,height)
            assert page.evaluate('document.documentElement.scrollHeight<=innerHeight'),(width,height,page.evaluate("Array.from(document.querySelector('.cabinet').children).map(n=>[n.tagName,n.id,n.getBoundingClientRect().y,n.getBoundingClientRect().height])"))
            for d in ['up','down','left','right']:
                box=page.locator('#'+d).bounding_box();assert box['width']>=44 and box['height']>=44 and box['y']+box['height']<=height
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(60)
        page.locator('#resume').click();page.evaluate('advance(10000)');page.screenshot(path=f'/tmp/flashlight-escape-{mobile}.png')
        page.locator('#pause').click();page.locator('#home').click();page.wait_for_url(BASE+'index.html')
        assert not errors,errors;context.close()
        print('PASS:', 'Android touch' if mobile else 'PC keyboard', 'title→CLEAR, memory, holds/cancel, rendering, pause/sleep/rotation, clocks, best, retry/home, layouts',flush=True)
    for failure in ['get','set','invalid','audio-missing','audio-throws','audio-rejects']:
        context=browser.new_context();context.add_init_script(CLOCK)
        if failure in ['get','set']:context.add_init_script(f'Storage.prototype.{failure}Item=function(){{throw Error("blocked")}}')
        elif failure=='audio-missing':context.add_init_script('window.AudioContext=undefined;window.webkitAudioContext=undefined')
        elif failure=='audio-throws':context.add_init_script('window.AudioContext=class{constructor(){throw Error("blocked")}}')
        elif failure=='audio-rejects':context.add_init_script('window.AudioContext=class{state="suspended";resume(){return Promise.reject(Error("blocked"))}}')
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'games/flashlight-maze/');page.evaluate(OBSERVE)
        if failure=='invalid':page.evaluate('localStorage.setItem("my-arcade:flashlight-maze:best","NaN")');page.reload();page.evaluate(OBSERVE)
        for duration in [1000,2000]:
            page.locator('#start' if duration==1000 else '#retry').click();page.evaluate('advance(10000)');page.evaluate(f'advance({duration})');page.evaluate(SOLVE)
            assert page.locator('#final-best').inner_text()=='00:01.00'
        assert not errors,errors;context.close();print('PASS:',failure,flush=True)
    context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();page.goto(BASE+'games/flashlight-maze/');page.evaluate(OBSERVE)
    page.evaluate("() => {window.tones=0;const make=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){tones++;return make.call(this)}}")
    page.locator('#start').click();page.wait_for_timeout(10100);assert page.evaluate('g.state')=='ESCAPE'
    direction=page.evaluate(NEXT);page.locator('#'+direction).click();assert page.evaluate('tones')>=1
    page.evaluate('g.player={x:1,y:1}');page.evaluate(SOLVE);assert page.evaluate('g.state')=='CLEAR';assert page.evaluate('tones')>=4
    assert page.evaluate('g.elapsed')>0;page.screenshot(path='/tmp/flashlight-real.png');context.close();browser.close()
    print('PASS: real 10-second transition, animation frames and Web Audio',flush=True)
