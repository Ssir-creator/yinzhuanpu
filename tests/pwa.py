"""Test app navigation, caching, offline use and user-controlled updates."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
import shutil,tempfile,threading,json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
 target=Path(tmp)
 for name in ['index.html','sw.js','manifest.webmanifest']:
  shutil.copyfile(ROOT/name,target/name)
 shutil.copytree(ROOT/'icons',target/'icons')
 server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=tmp))
 thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844})
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 url=f'http://127.0.0.1:{server.server_port}/'
 page.goto(url);page.wait_for_function('!busy')
 assert page.locator('#screen-practice').is_visible()
 assert not page.locator('#screen-compare').is_visible()
 assert page.locator('#record').is_visible()
 page.locator('[data-screen=compare]').click()
 assert page.locator('#screen-compare').is_visible()
 assert page.locator('[data-screen=compare]').get_attribute('aria-current')=='page'
 page.locator('[data-screen=history]').click()
 assert page.locator('#history-list').is_visible()
 page.locator('[data-screen=practice]').click()
 page.locator('#install-app').click()
 assert page.locator('#install-help').is_visible()
 page.locator('#close-install').click()
 page.wait_for_function('navigator.serviceWorker.controller !== null')
 cached=page.evaluate('async()=>{const names=await caches.keys();const cache=await caches.open(names.find(n=>n.startsWith("string-lens-app-")));return (await cache.keys()).map(r=>r.url)}')
 assert any(u.endswith('/index.html') for u in cached)
 assert any(u.endswith('/icons/icon-192.png') for u in cached)
 manifest=json.loads((ROOT/'manifest.webmanifest').read_text())
 assert manifest['display']=='standalone' and manifest['start_url']=='./'
 page.screenshot(path='/tmp/string-lens-app-home.png',full_page=True)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 # A new worker must wait while the old app is open, and only activate on explicit action.
 sw=(target/'sw.js').read_text().replace("const CACHE=", "const UPDATED=true;\nconst CACHE=").replace("string-lens-app-", "string-lens-app-test-")
 (target/'sw.js').write_text(sw)
 page.evaluate('async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()}')
 page.wait_for_function('waitingWorker !== null && !document.querySelector("#app-update").hidden')
 page.evaluate('recordingPending=true')
 page.locator('#apply-update').click()
 assert page.evaluate('navigator.serviceWorker.controller.scriptURL.endsWith("sw.js") && waitingWorker !== null')
 page.evaluate('recordingPending=false')
 page.locator('#apply-update').click()
 page.wait_for_function('!busy && document.querySelector("#app-update").hidden')
 page.wait_for_function('navigator.serviceWorker.controller !== null')
 context.set_offline(True)
 page.reload();page.wait_for_function('!busy && tracks.practice !== null')
 assert page.locator('#screen-practice').is_visible()
 page.locator('[data-screen=compare]').click()
 assert page.locator('#events .event-button').count()>0
 page.screenshot(path='/tmp/string-lens-app-compare.png',full_page=True)
 assert not errors,errors
 browser.close();server.shutdown();server.server_close()
 print('PASS: app navigation, install instructions, manifest, icons cache, waiting update, recording update guard, explicit activation and offline reload/analysis.')
