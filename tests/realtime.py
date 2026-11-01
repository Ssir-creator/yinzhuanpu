"""End-to-end check for microphone-to-score updates while recording."""
import base64
import os
from pathlib import Path
import re
import tempfile

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get("DEMO_URL", "http://127.0.0.1:8005")
encoded = re.search(r'window\.DEMO_AUDIO="([^"]+)"', (ROOT / "demo-audio.js").read_text()).group(1)

with tempfile.TemporaryDirectory() as tmp, sync_playwright() as playwright:
    audio_path = Path(tmp) / "microphone.wav"
    audio_path.write_bytes(base64.b64decode(encoded))
    browser = playwright.chromium.launch(
        executable_path="/usr/bin/chromium",
        headless=True,
        args=[
            "--no-sandbox",
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            f"--use-file-for-fake-audio-capture={audio_path}",
        ],
    )
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(URL)
    page.locator("#record").click()
    page.wait_for_function("document.body.classList.contains('is-live')")
    page.wait_for_function("notes.length >= 14", timeout=15_000)
    assert page.locator("#score-section").is_visible()
    assert page.locator(".jianpu-measure").count() > 0
    assert "实时转谱中" in page.locator("#source-status").inner_text()
    assert page.evaluate("notes.slice(0,14).map(note => note.midi)") == [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60]
    page.wait_for_timeout(300)
    page.locator("#stop-record").click()
    page.wait_for_function("!document.body.classList.contains('is-live')")
    page.wait_for_function("buffer !== undefined && buffer !== null")
    assert (notes_count := page.evaluate("notes.length"))
    assert page.locator("#source-audio").get_attribute("src").startswith("blob:")
    assert "实时识别中" not in page.locator("#confidence-label").inner_text()
    page.evaluate("notes=[{midi:60,beats:.5,confidence:.9,start:0}]; liveLastPitchedIndex=0; liveLastEnd=1; beginLiveCandidate(62,.9,1.3)")
    assert page.evaluate("notes.length === 2 && !notes.some(note => note.rest)")
    page.evaluate("notes=[{midi:60,beats:.5,confidence:.9,start:0}]; liveCandidate=null; liveLastPitchedIndex=0; liveLastEnd=1; beginLiveCandidate(62,.9,2.2)")
    assert page.evaluate("notes[1].rest === true && notes[1].beats > 0")
    page.evaluate("notes=[{midi:60,beats:8,confidence:1,start:0,rest:true}]; liveCandidate=null; render()")
    assert page.locator(".jianpu-measure").count() == 2
    assert page.locator(".score-note .numeral", has_text="0").count() == 2
    assert page.locator(".continued-dash").count() == 0
    assert not errors, errors
    print(f"PASS: live microphone transcription rendered {notes_count} notes before recording stopped.")
    browser.close()
