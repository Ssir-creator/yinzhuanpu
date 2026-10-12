"""Recording/storage integration with a simulated microphone; no real recording claim."""
import os
from pathlib import Path
import tempfile
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('DEMO_URL','http://127.0.0.1:8000')
with sync_playwright() as p, tempfile.TemporaryDirectory() as tmp:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',f'--use-file-for-fake-audio-capture={ROOT / "assets/roll-practice.wav"}'])
 context=browser.new_context(accept_downloads=True,viewport={'width':1440,'height':1100})
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(URL);page.wait_for_function('!busy && tracks.practice !== null')
 page.locator('[data-screen=history]').click()
 page.locator('#save-practice').click()
 assert '合成演示不作为' in page.locator('#history-status').inner_text()
 page.locator('[data-screen=practice]').click()
 page.locator('#record').click()
 page.wait_for_function('recorder && recorder.state === "recording"')
 assert page.evaluate('busy')
 assert page.locator('[data-upload="practice"]').is_disabled()
 page.wait_for_timeout(700);page.locator('#record-stop').click()
 page.wait_for_function('!busy && !tracks.practice.synthetic')
 assert page.evaluate('tracks.practice.buffer.duration')>.3
 assert page.evaluate('micStream === null && recorder === null')
 page.locator('[data-screen=practice]').click()
 page.locator('#promote').click()
 assert not page.evaluate('tracks.reference.synthetic')
 assert page.evaluate('tracks.reference !== tracks.practice && tracks.reference.region !== tracks.practice.region')
 page.locator('[data-screen=history]').click()
 page.locator('#practice-note').fill('<img src=x onerror=alert(1)> 更慢一点，先听力度。')
 page.locator('[data-screen=history]').click()
 page.locator('#save-practice').click()
 page.wait_for_function('!historyBusy && document.querySelectorAll(".history-entry").length===1')
 assert page.locator('.history-entry img').count()==0
 with page.expect_download() as download:
  page.locator('[data-screen=history]').click()
  page.locator('.history-entry button',has_text='下载 WAV').click()
 output=Path(tmp)/'record.wav';download.value.save_as(str(output))
 data=output.read_bytes();assert data[:4]==b'RIFF' and data[8:12]==b'WAVE'
 page.reload();page.wait_for_function('!busy && document.querySelectorAll(".history-entry").length===1')
 page.locator('[data-screen=history]').click()
 page.locator('.history-entry button',has_text='载入上一遍').click()
 page.wait_for_function('!busy && !tracks.reference.synthetic')
 assert not page.locator('#comparable').is_checked()
 page.locator('[data-screen=history]').click()
 page.locator('.history-entry button',has_text='载入练习侧').click()
 page.wait_for_function('!busy && !tracks.practice.synthetic')
 page.locator('[data-screen=history]').click()
 page.locator('.history-entry button',has_text='删除记录').click()
 page.wait_for_function('document.querySelectorAll(".history-entry").length===0')
 page.reload();page.wait_for_function('!busy')
 assert page.locator('.history-entry').count()==0
 page.locator('[data-screen=practice]').click()
 page.locator('#record-duration').select_option('5')
 page.locator('[data-screen=practice]').click()
 page.locator('#record').click();page.wait_for_function('recorder && recorder.state==="recording"')
 page.wait_for_function('!recordingPending && !tracks.practice.synthetic',timeout=12000)
 assert page.evaluate('tracks.practice.buffer.duration')>=4.5
 page.screenshot(path='/tmp/string-lens-v04-desktop.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(250)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 # A denied permission must preserve the existing demo and unlock controls.
 denied=browser.new_context();denied.grant_permissions([])
 reject_page=denied.new_page();reject_page.goto(URL);reject_page.wait_for_function('!busy')
 reject_page.evaluate('() => { navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException("denied","NotAllowedError")}; }')
 reject_page.locator('[data-screen=practice]').click()
 reject_page.locator('#record').click()
 reject_page.wait_for_function('!recordingPending')
 assert '未获授权' in reject_page.locator('#record-status').inner_text()
 assert reject_page.evaluate('tracks.practice.synthetic && !busy')
 print('PASS: simulated mic manual/automatic stop, busy locks, resource release, permission denial, previous-take copy, explicit local save, escaped notes, WAV backup, refresh restore, delete persistence, mobile layout. Real microphone/device testing pending.')
 browser.close()
