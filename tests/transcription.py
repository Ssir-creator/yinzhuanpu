"""End-to-end checks for the monophonic audio-to-numbered-notation workflow."""
import os
from pathlib import Path
import tempfile
from xml.etree import ElementTree
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('DEMO_URL', 'http://127.0.0.1:8005')
EXPECTED = [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60]

with sync_playwright() as p, tempfile.TemporaryDirectory() as tmp:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    context = browser.new_context(
        viewport={'width': 390, 'height': 844},
        accept_downloads=True,
        ignore_https_errors=URL.startswith('https://'),
    )
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(URL)
    page.locator('#load-demo').click()
    page.wait_for_function('buffer !== undefined && buffer !== null')
    page.locator('#transcribe').click()
    page.wait_for_function('notes.length > 0 && document.querySelector("#analysis-progress").hidden')
    result = page.evaluate('notes.map(n => ({midi:n.midi, beats:n.beats, confidence:n.confidence}))')
    assert [note['midi'] for note in result] == EXPECTED, result
    assert all(note['beats'] == 1 for note in result), result
    assert page.locator('.score-note').count() == 14
    assert '1=C' in page.locator('.score-meta').inner_text()
    # Manual correction must update the underlying score.
    page.locator('.score-note').first.click()
    page.locator('[data-edit="up"]').click()
    assert page.evaluate('notes[0].midi') == 61
    page.locator('#undo-edit').click()
    assert page.evaluate('notes[0].midi') == 60
    page.locator('#redo-edit').click()
    assert page.evaluate('notes[0].midi') == 61
    page.locator('[data-edit="longer"]').click()
    assert page.evaluate('notes[0].beats') == 1.5
    page.locator('[data-edit="rest"]').click()
    assert page.evaluate('notes[0].rest') is True
    page.locator('[data-edit="rest"]').click()
    page.locator('#score-title').fill('小星星校对稿')
    # Both export formats contain the edited result.
    for selector, filename, marker in [('#export-text', 'score.txt', b'1=C'), ('#export-xml', 'score.musicxml', b'<score-partwise')]:
        with page.expect_download() as info:
            page.locator(selector).click()
        output = Path(tmp) / filename
        info.value.save_as(str(output))
        assert marker in output.read_bytes()
        if output.suffix == '.musicxml':
            root = ElementTree.parse(output).getroot()
            assert root.tag == 'score-partwise'
            assert root.findtext('./work/work-title') == '小星星校对稿'
            measures = root.findall('./part/measure')
            assert len(measures) == 4
            assert all(sum(int(note.findtext('duration')) for note in measure.findall('note')) <= 16 for measure in measures)
    page.locator('#save-score-direct').click()
    page.locator('[data-screen="library"]').click()
    assert page.locator('.library-entry').count() == 1
    page.reload()
    page.locator('[data-screen="library"]').click()
    assert page.locator('.library-entry').count() == 1
    page.locator('.library-entry button', has_text='打开').click()
    assert page.locator('.score-note').count() == 14
    overflow = page.evaluate("""[...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => [el.tagName, el.className, Math.round(el.getBoundingClientRect().right), el.scrollWidth])""")
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), overflow
    page.screenshot(path='/tmp/audio-to-score-mobile.png', full_page=True)
    assert not errors, errors
    print('PASS: known melody, note editing with undo/redo, measured MusicXML export, direct save/restore, and mobile layout.')
    browser.close()
