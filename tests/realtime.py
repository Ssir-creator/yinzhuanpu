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
    page.wait_for_function("notes.length > 0", timeout=15_000)
    assert page.locator("#score-section").is_visible()
    assert page.locator(".jianpu-measure").count() > 0
    assert "实时转谱中" in page.locator("#source-status").inner_text()
    page.wait_for_timeout(800)
    page.locator("#stop-record").click()
    page.wait_for_function("!document.body.classList.contains('is-live')")
    page.wait_for_function("buffer !== undefined && buffer !== null")
    assert (notes_count := page.evaluate("notes.length"))
    assert page.locator("#source-audio").get_attribute("src").startswith("blob:")
    assert "实时识别中" not in page.locator("#confidence-label").inner_text()
    page.evaluate("notes=[]; liveLastEnd=1; beginLiveCandidate(60,.9,2)")
    assert page.evaluate("notes[0].rest === true && notes[0].beats > 0")
    assert not errors, errors
    print(f"PASS: live microphone transcription rendered {notes_count} notes before recording stopped.")
    browser.close()
