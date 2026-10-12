"""Build a self-contained demo.html that also works with a file:// URL."""
import base64
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build():
    demo = ROOT / 'assets' / 'demo-melody.wav'
    if not demo.exists():
        raise RuntimeError('Generate demo-melody.wav first: python scripts/generate_audio.py')
    audio = base64.b64encode(demo.read_bytes()).decode('ascii')
    html = (ROOT / 'src' / 'page.template.html').read_text()
    css = (ROOT / 'style.css').read_text() + '\n' + (ROOT / 'simple.css').read_text()
    js = (ROOT / 'transcribe.js').read_text() + '\n' + (ROOT / 'app-shell.js').read_text()
    html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
    script = '<script>window.DEMO_AUDIO=' + json.dumps(audio) + ';</script><script>' + js.replace('</script', '<\\/script') + '</script>'
    # Run after the body exists; inline classic scripts do not honor defer.
    html = html.replace('<script src="transcribe.js"></script><script src="app-shell.js"></script>', script)
    (ROOT / 'demo.html').write_text(html)
    (ROOT / 'index.html').write_text(html)
    # Keep the historically shared filename previewable as a complete app too.
    (ROOT / 'page.template.html').write_text(html)
    build = hashlib.sha256(html.encode()).hexdigest()[:12]
    (ROOT / 'sw.js').write_text((ROOT / 'sw.template.js').read_text().replace('__BUILD__', build))
    print('Built index.html, demo.html, and page.template.html (fully offline)')

if __name__ == '__main__':
    build()
