"""Portal regression checks; no dependencies are required by the website itself."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from arcade_helpers import launch_game
BASE = os.environ.get('ARCADE_TEST_URL', 'http://127.0.0.1:8000/08_my-arcade/')
GAMES = json.loads((Path(__file__).resolve().parents[1] / 'data/games.json').read_text())


def ready(page):
    page.goto(BASE)
    page.locator('#game-list[aria-busy="false"]').wait_for(state='attached')


def position(page, number, total=9):
    assert page.locator('#game-count').inner_text() == f'{number:02} / {total:02}'
    assert page.locator('.is-selected').count() == 1
    assert page.locator('.is-selected').get_attribute('tabindex') == '0'
    assert page.locator('#selected-title').inner_text() == GAMES[number - 1]['title']
    page.wait_for_timeout(280)


def swipe(page, dx, dy=0):
    box = page.locator('.is-selected').bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + 90
    session = page.context.new_cdp_session(page)
    session.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    for i in range(1, 6):
        session.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x+dx*i/5,'y':y+dy*i/5}]})
    session.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
    session.detach()


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    page = context.new_page(); errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    ready(page)
    assert page.locator('.cabinet .marquee-title').all_text_contents() == [g['title'] for g in GAMES]
    assert len(GAMES) == 9 and 'SAMPLE GAME' not in page.locator('#game-list').inner_text()
    position(page,1)
    swipe(page,-140);position(page,2)
    assert page.url == BASE
    swipe(page,140);position(page,1)
    swipe(page,140);position(page,9)
    swipe(page,-140);position(page,1)
    # A synthetic trailing click exercises the explicit post-swipe safety guard.
    page.locator('.is-selected').evaluate('(node)=>node.click()')
    assert page.url == BASE
    page.wait_for_timeout(200)
    swipe(page,18,2);position(page,1)
    swipe(page,70,95);position(page,1)
    page.wait_for_timeout(200)
    page.locator('.cabinet[data-offset="1"]').tap(position={'x':20,'y':80});position(page,2)
    page.locator('.cabinet[data-offset="-1"]').tap(position={'x':190,'y':80});position(page,1)
    # All nine URLs remain within the Pages subpath and launch the registered game.
    for game in GAMES:
        launch_game(page, game['title'])
        page.wait_for_url(BASE + game['url'].removeprefix('./'))
        ready(page)
    # Central cabinet tap launches; PLAY is covered above.
    page.locator('.is-selected').tap();page.wait_for_url(BASE + 'games/stack-tower/index.html')
    ready(page)
    for width,height in [(320,568),(360,640),(390,844),(430,932),(1280,800)]:
        page.set_viewport_size({'width':width,'height':height})
        page.wait_for_timeout(280)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.evaluate('document.documentElement.scrollHeight <= innerHeight'), (width, page.evaluate('document.documentElement.scrollHeight'))
        center = page.locator('.is-selected').bounding_box()
        stage = page.locator('#game-list').bounding_box()
        assert center['y'] + center['height'] + 13 <= stage['y'] + stage['height'], (width, center, stage)
        assert abs(center['x'] + center['width']/2 - width/2) < 1
        for offset in [-1, 1]:
            neighbor=page.locator(f'.cabinet[data-offset="{offset}"]').bounding_box()
            assert min(width, neighbor['x']+neighbor['width']) - max(0, neighbor['x']) >= 44
        for node in ['#play-game','#previous-game','#next-game']:
            box=page.locator(node).bounding_box(); assert box['height']>=44 and box['width']>=44
        page.screenshot(path=f'/tmp/arcade-v2-{width}.png')
    # Small heights and enlarged text may scroll, but all content remains reachable.
    page.set_viewport_size({'width':320,'height':400})
    page.add_style_tag(content='body {font-size: 28px} .selection-info p {font-size: 24px}')
    page.evaluate('scrollTo(0,0)')
    swipe(page,0,-100);page.wait_for_timeout(500)
    assert page.evaluate('scrollY > 0') and page.url == BASE
    assert page.locator('#game-count').inner_text() == '01 / 09'
    page.locator('#play-game').scroll_into_view_if_needed();assert page.locator('#play-game').is_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    context.close()
    print('PASS: touch swipes, wrap, tap, all nine URLs, fallback scrolling, five layouts',flush=True)

    context=browser.new_context(viewport={'width':1280,'height':800})
    page=context.new_page();desktop_errors=[]
    page.on('pageerror', lambda e: desktop_errors.append(str(e)))
    ready(page);position(page,1)
    page.keyboard.press('ArrowLeft');position(page,9)
    page.keyboard.press('ArrowRight');position(page,1)
    page.locator('.is-selected').focus();page.keyboard.press('ArrowRight');position(page,2)
    assert page.locator('.is-selected').evaluate('(n)=>n===document.activeElement')
    assert page.locator('.is-selected').evaluate('(n)=>getComputedStyle(n).outlineStyle') != 'none'
    page.evaluate("() => {for(let i=0;i<30;i++) document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));}")
    position(page,3)
    page.locator('#games').focus();page.keyboard.press('Enter');page.wait_for_url(BASE+'games/number-merge/index.html')
    ready(page);page.emulate_media(reduced_motion='reduce');page.keyboard.press('ArrowRight');position(page,2)
    assert page.locator('.is-selected').evaluate('(n)=>getComputedStyle(n).transitionDuration') == '0s'
    assert not desktop_errors, desktop_errors
    context.close();print('PASS: keyboard, focus, rapid input, reduced motion',flush=True)

    for size in [0,1,2,3,9]:
        context=browser.new_context();page=context.new_page()
        data=GAMES[:size] if size<9 else GAMES + [dict(GAMES[0], id=f'extra-{i}',title=f'EXTRA {i}') for i in range(9 - len(GAMES))]
        data += [dict(GAMES[0],id='draft',status='draft')]
        page.route('**/data/games.json',lambda route:route.fulfill(json=data))
        ready(page)
        if size==0:
            assert page.locator('#load-status').is_visible() and page.locator('#game-count').inner_text()=='00 / 00'
            assert page.locator('#game-selection').is_hidden()
        else:
            assert page.locator('#game-count').inner_text()==f'01 / {size:02}'
            assert page.locator('#previous-game').is_disabled()==(size==1)
            if size>1:
                for _ in range(size):
                    page.locator('#next-game').click();page.wait_for_timeout(270)
                    assert page.locator('.is-selected').count()==1
                assert page.locator('#game-count').inner_text()==f'01 / {size:02}'
                page.locator('#previous-game').click();page.wait_for_timeout(270)
                assert page.locator('#game-count').inner_text()==f'{size:02} / {size:02}'
        context.close()
    for failure in ['http','invalid-json','invalid-data','image','missing-image']:
        context=browser.new_context();page=context.new_page()
        if failure=='http': page.route('**/data/games.json',lambda r:r.fulfill(status=503))
        elif failure=='invalid-json': page.route('**/data/games.json',lambda r:r.fulfill(body='{'))
        elif failure=='invalid-data': page.route('**/data/games.json',lambda r:r.fulfill(json=[dict(GAMES[0],url='../outside.html')]))
        elif failure=='image': page.route('**/thumbnail.svg',lambda r:r.fulfill(status=404))
        else: page.route('**/data/games.json',lambda r:r.fulfill(json=[dict(GAMES[0],thumbnail='')]))
        ready(page)
        if failure in ['image','missing-image']:
            page.wait_for_function("Array.from(document.querySelectorAll('.pixel-scene')).every(i=>i.complete && i.naturalWidth>0)")
            assert page.locator('.game-thumbnail').count()==0
            assert page.locator('.is-selected .screen-fallback').is_visible()
        else:
            assert page.locator('#game-count').inner_text()=='OFFLINE'
            assert page.locator('#load-status.is-error').is_visible()
            assert page.locator('#game-selection').is_hidden()
        context.close()
    browser.close()
    print('PASS: 0/1/2/3/9 games, published filtering, data validation, fetch/image failures',flush=True)
