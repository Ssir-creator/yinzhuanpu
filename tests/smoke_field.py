"""Validate stateful motion, local impulses, lifetime reset, silence and audio routing."""
import math
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('FLUID_URL','http://127.0.0.1:8050/fluid.html')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1440,'height':950},accept_downloads=True)
    errors=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.goto(URL+('&' if '?' in URL else '?')+'style=B')
    assert page.locator('#flow').is_visible()
    assert page.locator('#fluid').is_hidden()
    assert page.evaluate('!!smokeRenderer && !smokeFailure')
    # Freeze the page loop so readbacks reflect controlled simulation steps.
    result=page.evaluate('''()=>{paused=true;const r=smokeRenderer;
      const audio={energy:.4,low:.2,high:.1,active:true};
      const run=(event)=>{r.reset();const before=r.snapshot();if(event)r.events.push([before.position[0],before.position[1],0,1.5]);for(let i=0;i<35;i++)r.advance(1/60,audio);return r.snapshot()};
      const quiet=run(false),pulse=run(true);
      r.events=[];const previous=r.snapshot();r.advance(1/60,{...audio,active:false,energy:0});const coast=r.snapshot();
      const gl=r.gl;gl.bindTexture(gl.TEXTURE_2D,r.banks[r.front].textures[0]);gl.texSubImage2D(gl.TEXTURE_2D,0,11,17,1,1,gl.RGBA,gl.FLOAT,new Float32Array([0,0,0,100]));r.advance(1/60,audio);const reborn=r.snapshot();
      r.reset();r.level=.7;for(let i=0;i<240;i++)r.update(1/60,{...audio,active:false,energy:0,impulse:0,centroid:0,strength:1});const silentLevel=r.level;
      return {quiet,pulse,previous,coast,reborn,silentLevel,error:gl.getError()};}''')
    assert result['error']==0,result
    assert all(math.isfinite(n) for state in ['quiet','pulse','coast','reborn'] for field in ['position','velocity'] for n in result[state][field])
    difference=sum(abs(a-b) for a,b in zip(result['quiet']['velocity'][:3],result['pulse']['velocity'][:3]))
    assert difference>.002, result
    assert any(abs(v)>.0001 for v in result['coast']['velocity'][:3]),result
    assert result['coast']['position'][:3]!=result['previous']['position'][:3]
    assert result['reborn']['position'][3]<.02,result
    assert result['silentLevel']<.03,result
    # Audio and UI integration.
    page.locator('#play').click()
    page.wait_for_function('energy>.01 && smokeRenderer.events.length>0')
    page.wait_for_timeout(1400)
    page.screenshot(path='/tmp/smoke-final-B.png')
    page.locator('#alternatives').evaluate('(el)=>el.open=true')
    for index,name in [(7,'BC'),(8,'BF')]:
        page.locator(f'[data-preset="{index}"]').click()
        page.wait_for_timeout(150)
        assert page.evaluate('mode')=='demo'
        assert page.locator('#flow').is_visible()
        page.screenshot(path=f'/tmp/smoke-final-{name}.png')
    page.locator('#pause').click()
    page.wait_for_function('paused')
    frozen=page.evaluate('smokeRenderer.snapshot()')
    page.wait_for_timeout(200)
    assert page.evaluate('smokeRenderer.snapshot()')==frozen
    page.locator('#pause').click()
    with page.expect_download() as info: page.locator('#save').click()
    assert info.value.suggested_filename.endswith('.png')
    reference=Path('/tmp/reference-music-test.wav')
    page.locator('#upload').set_input_files(str(reference if reference.exists() else ROOT/'assets/roll-reference.wav'))
    page.wait_for_function("mode==='file' && energy>.01")
    page.locator('#stop-audio').click()
    assert page.evaluate('mode')=='idle'
    page.locator('#original-star').click()
    assert page.locator('#legacy').is_visible()
    page.locator('[data-quick="B"]').click()
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.locator('#stop-audio').is_visible()
    page.screenshot(path='/tmp/smoke-final-mobile.png')
    assert page.evaluate('smokeRenderer.gl.getError()')==0
    assert not errors,errors
    print('PASS: GPU position/velocity persistence, local impulse response, inertia, lifetime reset, silence decay, real music file input, pause, export, original galaxy, mobile layout.')
    browser.close()
