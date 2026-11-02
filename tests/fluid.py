"""End-to-end checks for GPU fluid studies and their shared audio controls."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('FLUID_URL','http://127.0.0.1:8050/fluid.html')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
    page=browser.new_page(viewport={'width':1280,'height':900},accept_downloads=True)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(URL+("&" if "?" in URL else "?")+"style=S")
    page.locator('#alternatives').evaluate('(el)=>el.open=true')
    assert page.evaluate('ready')
    assert page.evaluate('presets[0].id')=='S'
    assert page.locator('#legacy').is_visible()
    assert page.locator('#fluid').is_hidden()
    assert page.locator('[data-preset]').count()==10
    page.locator('#tour').click()
    page.wait_for_function('energy > .01')
    for index in range(10):
        assert page.evaluate('selected')==index
        assert page.locator('#legacy').is_visible() == (index==0)
        page.screenshot(path=f'/tmp/fluid-study-{index}.png')
        assert page.evaluate('gl.getError()')==0
        if index==9:
            assert page.evaluate('targetWidth===canvas.width && targetHeight===canvas.height')
            assert page.locator('#title').inner_text()=='层叠粒子风暴'
        page.evaluate('phaseTime=16.1')
        if index<9:page.wait_for_function(f'selected==={index+1}')
    page.wait_for_function("mode==='idle'")
    assert '十幕结束' in page.locator('#phase').inner_text()
    page.locator('[data-preset="6"]').click()
    page.wait_for_function("mode==='demo'")
    page.locator('#pause').click()
    page.wait_for_function('paused')
    frozen=page.evaluate('visualTime')
    page.wait_for_timeout(150)
    assert page.evaluate('visualTime')==frozen
    page.locator('#pause').click()
    page.wait_for_function('!paused')
    page.locator('#immersive').click()
    assert page.locator('footer').is_hidden()
    page.locator('#immersive').click()
    with page.expect_download() as info:page.locator('#save').click()
    assert info.value.suggested_filename.endswith('.png')
    page.locator('#mic').click()
    page.wait_for_function("mode==='mic' && stream.active")
    page.locator('[data-preset="7"]').click()
    assert page.evaluate('mode')=='mic'
    page.locator('#upload').set_input_files(str(ROOT/'assets/demo-melody.wav'))
    page.wait_for_function("mode==='file'")
    page.locator('[data-preset="2"]').click()
    assert page.evaluate('mode')=='file'
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(100)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert all(page.locator(f'[data-preset="{i}"]').is_visible() for i in range(10))
    page.screenshot(path='/tmp/fluid-study-mobile.png')
    assert not errors,errors
    print('PASS: ten presets including the preserved galaxy, tour completion, pause/resume, immersion, PNG export, microphone, file audio, mobile layout.')
    browser.close()
