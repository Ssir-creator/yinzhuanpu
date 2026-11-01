"""Browser checks for the six audio-driven particle previews."""
import os
from playwright.sync_api import sync_playwright

SCENES = ['cloud', 'ribbon', 'water', 'ring', 'sand', 'galaxy']
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1280,'height':900}, accept_downloads=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(os.environ.get('PARTICLE_URL', 'http://127.0.0.1:8040/particles.html'))
    page.locator('#tour').click()
    page.wait_for_timeout(500)
    assert page.evaluate('mode') == 'demo'
    assert page.evaluate('energy') > 0
    for name in SCENES:
        assert page.evaluate('style') == name
        page.evaluate('sceneStarted=time-11;performStep()')
        page.wait_for_timeout(550)
        assert '强奏' in page.locator('#chapter').inner_text()
        assert page.locator('[aria-pressed=true][data-style]').count() == 1
        assert page.evaluate("fieldPoints.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))")
        page.screenshot(path=f'/tmp/six-{name}.png')
        page.evaluate('sceneStarted=time-19;performStep()')
    assert page.evaluate('mode') == 'idle'
    assert '六幕结束' in page.locator('#chapter').inner_text()
    page.locator('[data-style=ribbon]').click()
    page.wait_for_timeout(300)
    assert page.evaluate('mode') == 'demo'
    page.locator('#immersive').click()
    assert page.locator('footer').is_hidden()
    page.locator('#immersive').click()
    with page.expect_download() as download:
        page.locator('#capture').click()
    assert download.value.suggested_filename.endswith('.png')
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(300)
    page.screenshot(path='/tmp/six-mobile.png')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    for name in SCENES:
        assert page.locator(f'[data-style={name}]').is_visible()
    page.locator('#stop').click()
    assert page.evaluate('mode') == 'idle'
    assert not errors, errors
    print('PASS: six-scene tour, audio response, finite positions, single replay, immersion, PNG export, mobile controls.')
    browser.close()
