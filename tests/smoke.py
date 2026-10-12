"""Functional checks for the focused tremolo observation workflow."""
import json
import os
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
with sync_playwright() as p, tempfile.TemporaryDirectory() as tmp:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440,'height':1100}, accept_downloads=True)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(os.environ.get('DEMO_URL', 'http://127.0.0.1:8000')+'#compare')
    page.wait_for_function('!busy && tracks.practice !== null')
    assert page.locator('[data-technique]').count() == 1
    assert page.evaluate('getComputedStyle(document.querySelector(".comparison-grid")).display') == 'grid'
    assert (ROOT/'index.html').read_bytes() == (ROOT/'demo.html').read_bytes()
    review = page.evaluate('({a:reviewTrack(tracks.reference), b:reviewTrack(tracks.practice)})')
    assert review['a']['usable'] and review['b']['usable'], review
    assert review['a']['intervalCV'] < review['b']['intervalCV']
    assert len(review['b']['events']) > 0
    assert not review['a']['events'], review['a']
    # Independent known timing oracle, gain invariance and timing irregularity.
    oracle = page.evaluate('''() => {
      function fixture(times, gain=1) {
        const sr=22050, b=audioContext().createBuffer(1,sr*3,sr), d=b.getChannelData(0);
        times.forEach((t,n)=>{for(let j=0;j<sr*.07;j++) {
          const index=Math.round(t*sr)+j;
          if(index<d.length) d[index]+=gain*.4*Math.min(j/(sr*.002),1)*Math.exp(-j/(sr*.013))*Math.sin(2*Math.PI*300*j/sr);
        }});
        return {buffer:b,analysis:analyze(b),region:[0,3]};
      }
      const times=Array.from({length:18},(_,i)=>.2+i*.14);
      const irregular=times.map((t,i)=>i===8?t+.065:t);
      const a=reviewTrack(fixture(times)), quiet=reviewTrack(fixture(times,.2)), b=reviewTrack(fixture(irregular));
      const silence=reviewTrack({analysis:analyze(audioContext().createBuffer(1,22050,22050)),region:[0,1]});
      return {times,a,quiet,b,silence};
    }''')
    assert len(oracle['a']['onsets']) == len(oracle['times']), oracle
    assert max(abs(a-b) for a,b in zip(oracle['a']['onsets'],oracle['times'])) < .025
    assert oracle['a']['onsets'] == oracle['quiet']['onsets']
    assert abs(oracle['a']['attackSpreadDb']-oracle['quiet']['attackSpreadDb']) < .01
    assert len(oracle['b']['events']) >= 1
    assert not oracle['silence']['usable'] and not oracle['silence']['events']
    guards = page.evaluate('''() => {
      const slow=reviewTrack(tracks.reference);
      const fastTrack={...tracks.reference,analysis:{...tracks.reference.analysis,stats:{...tracks.reference.analysis.stats,onsetTimesSeconds:Array.from({length:30},(_,i)=>.1+i*.05)}}};
      const fast=reviewTrack(fastTrack);
      const b=audioContext().createBuffer(1,22050,22050), d=b.getChannelData(0);
      for(let i=0;i<d.length;i++)d[i]=i%2 ? 1 : -1;
      const clipped=reviewTrack({analysis:{...analyze(b),stats:{...analyze(b).stats,onsetTimesSeconds:Array.from({length:10},(_,i)=>i*.09)}},region:[0,1]});
      return {fast,clipped};
    }''')
    assert not guards['fast']['usable'] and not guards['fast']['events']
    assert not guards['clipped']['usable'] and '削波' in guards['clipped']['reason']
    # Selected region excludes earlier/later onsets; insufficient region emits no claims.
    page.locator('#practice-start').fill('2')
    page.locator('#practice-end').fill('4')
    page.locator('[data-region="practice"]').click()
    assert page.evaluate('reviewTrack(tracks.practice).onsets.every(t=>t>=2&&t<4)')
    page.locator('#practice-start').fill('5.5')
    page.locator('#practice-end').fill('5.9')
    page.locator('[data-region="practice"]').click()
    assert not page.evaluate('reviewTrack(tracks.practice).usable')
    assert '少于 8' in page.locator('#events').inner_text()
    page.locator('#practice-start').fill('4')
    page.locator('#practice-end').fill('2')
    page.locator('[data-region="practice"]').click()
    assert '选区无效' in page.locator('#status').inner_text()
    page.locator('[data-technique="roll"]').click()
    page.wait_for_function('!busy && tracks.practice.region[0]===0')
    page.locator('#events .event-button').first.click()
    page.wait_for_function('tracks.practice.source !== null || tracks.reference.source !== null')
    page.wait_for_function('!tracks.practice.source && !tracks.reference.source', timeout=5000)
    page.locator('[data-clip="practice"]').click()
    page.wait_for_function('tracks.practice.source !== null')
    page.locator('[data-play="practice"]').click()
    # Different source provenance cannot be overruled by the checkbox.
    page.locator('[data-upload="practice"]').set_input_files(str(ROOT/'assets/roll-practice.wav'))
    page.wait_for_function('!busy && !tracks.practice.synthetic')
    assert '停止跨侧比较' in page.locator('#review-summary').inner_text()
    page.locator('#comparable').check()
    assert '停止跨侧比较' in page.locator('#review-summary').inner_text()
    page.locator('[data-upload="reference"]').set_input_files(str(ROOT/'assets/roll-reference.wav'))
    page.wait_for_function('!busy && !tracks.reference.synthetic')
    assert '尚未确认' in page.locator('#review-summary').inner_text()
    page.locator('#comparable').check()
    assert '起音对齐' in page.locator('#review-summary').inner_text()
    page.locator('#comparable').uncheck()
    assert '尚未确认' in page.locator('#review-summary').inner_text()
    bad=Path(tmp)/'invalid.wav';bad.write_text('invalid')
    page.locator('[data-upload="practice"]').set_input_files(str(bad))
    page.wait_for_function('!busy && document.querySelector("#status").classList.contains("error")')
    assert page.evaluate('tracks.practice.name') == 'roll-practice.wav'
    with page.expect_download() as info: page.locator('#export').click()
    output=Path(tmp)/'result.json';info.value.save_as(str(output))
    result=json.loads(output.read_text())
    assert result['version']==3 and 'review' in result['tracks']['practice']
    assert result['tracks']['practice']['selectedRegionSeconds']==[0,6]
    page.locator('[data-technique="roll"]').click()
    page.wait_for_function('!busy && tracks.practice.synthetic')
    page.screenshot(path='/tmp/string-lens-v03-desktop.png',full_page=True)
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(250)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='/tmp/string-lens-v03-mobile.png',full_page=True)
    offline=browser.new_context(offline=True);doc=offline.new_page()
    doc.on('pageerror',lambda e:errors.append(str(e)))
    doc.set_content((ROOT/'demo.html').read_text())
    doc.wait_for_function('!busy && reviewTrack(tracks.practice).events.length>0')
    assert doc.evaluate('getComputedStyle(document.body).backgroundColor')=='rgb(241, 237, 229)'
    assert not errors, errors
    print('PASS: known-onset timing, fixed-gain invariance, irregular interval detection, silence guard, demo review, ROI filtering/validation, localized clip completion, provenance/comparability gates, invalid import, JSON review export, responsive layout and offline bundle.')
    print('Known fixture timing error <25 ms; 18/18 onsets. Demo CV:',review['a']['intervalCV'],review['b']['intervalCV'])
    browser.close()
