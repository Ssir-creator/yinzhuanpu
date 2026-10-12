"""Build a self-contained demo.html that also works with a file:// URL."""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build():
    audio = {p.name: base64.b64encode(p.read_bytes()).decode('ascii') for p in sorted((ROOT / 'assets').glob('roll-*.wav'))}
    if len(audio) != 2:
        raise RuntimeError('Generate the two roll audio fixtures first: python scripts/generate_audio.py')
    html = (ROOT / 'page.template.html').read_text()
    css = (ROOT / 'style.css').read_text()
    js = (ROOT / 'app.js').read_text()
    html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
    script = '<script>window.DEMO_AUDIO=' + json.dumps(audio) + ';</script><script>' + js.replace('</script', '<\\/script') + '</script>'
    # Run after the body exists; inline classic scripts do not honor defer.
    html = html.replace('<script src="app.js" defer></script>', '').replace('</body>', script + '</body>')
    (ROOT / 'demo.html').write_text(html)
    (ROOT / 'index.html').write_text(html)
    print('Built index.html and demo.html (fully offline, no external resources)')

if __name__ == '__main__':
    build()
