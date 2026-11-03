"""Check the reference composition and actual FFT-band separation."""
import os
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
URL=os.environ.get('FLUID_URL','http://127.0.0.1:8060/fluid.html')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1200,'height':900},accept_downloads=True)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(URL+('&' if '?' in URL else '?')+'style=B')
    assert page.locator('#flow').is_visible()
    assert page.locator('.caption').is_hidden()
    assert page.locator('aside').is_hidden()
    assert page.locator('#original-star').is_visible()
    assert page.evaluate('smokeRenderer.featurePointCount')==89
    response=page.evaluate('''async()=>{
      endInput();await context().resume();setupAudio();analyser.smoothingTimeConstant=0;mode='test';playing=true;
      const oscillator=ac.createOscillator(),gain=ac.createGain();gain.gain.value=.12;oscillator.connect(gain).connect(analyser);oscillator.start();
      const results=[];
      for(const frequency of [180,1100,6200]){oscillator.frequency.setValueAtTime(frequency,ac.currentTime);await new Promise(resolve=>setTimeout(resolve,240));for(let i=0;i<40;i++)analyze(1/60);results.push({frequency,low,mid,high});}
      oscillator.stop();oscillator.disconnect();gain.disconnect();endInput();return results;
    }''')
    assert response[0]['low']>response[0]['mid'] and response[0]['low']>response[0]['high'],response
    assert response[1]['mid']>response[1]['low'] and response[1]['mid']>response[1]['high'],response
    assert response[2]['high']>response[2]['low'] and response[2]['high']>response[2]['mid'],response
    page.locator('#play').click()
    page.wait_for_function('energy>.01')
    page.wait_for_timeout(500)
    page.screenshot(path='/tmp/reference-desktop-final.png')
    image=Image.open('/tmp/reference-desktop-final.png').convert('RGB')
    assert image.getpixel((4,4))==(0,0,0)
    # The axis consists of isolated pixels beyond the top and bottom of the cloud.
    axis_marks=sum(1 for y in range(220,680) if max(image.getpixel((600,y)))>65)
    assert axis_marks>12,axis_marks
    assert page.evaluate('smokeRenderer.gl.getError()')==0
    page.set_viewport_size({'width':390,'height':844})
    page.wait_for_timeout(200)
    page.screenshot(path='/tmp/reference-mobile-final.png')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('#original-star').click()
    assert page.locator('#legacy').is_visible()
    assert not errors,errors
    print('PASS: real low/mid/high FFT separation, central features, pure black background, restrained UI, mobile layout, preserved galaxy.')
    print(response)
    browser.close()
