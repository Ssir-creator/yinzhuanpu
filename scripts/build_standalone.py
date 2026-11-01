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
    source_html = (ROOT / 'src' / 'page.template.html').read_text()
    css = (ROOT / 'style.css').read_text() + '\n' + (ROOT / 'simple.css').read_text()
    js = (ROOT / 'transcribe.js').read_text() + '\n' + (ROOT / 'app-shell.js').read_text()
    demo_js = 'window.DEMO_AUDIO=' + json.dumps(audio) + ';\n'
    (ROOT / 'demo-audio.js').write_text(demo_js)
    html = source_html.replace(
        '<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="simple.css">',
        '<style>' + css + '</style>',
    )
    script = '<script>window.DEMO_AUDIO=' + json.dumps(audio) + ';</script><script>' + js.replace('</script', '<\\/script') + '</script>'
    # Run after the body exists; inline classic scripts do not honor defer.
    html = html.replace('<script src="demo-audio.js"></script><script src="transcribe.js"></script><script src="app-shell.js"></script>', script)
    (ROOT / 'demo.html').write_text(html)
    (ROOT / 'index.html').write_text(html)
    # The companion Page preview strips inline style/script blocks. Keep this alias
    # as a conventional multi-file page and anchor relative assets to Pages.
    asset_hash = hashlib.sha256((css + js + demo_js).encode()).hexdigest()[:12]
    preview = source_html.replace('<head>', '<head><base href="https://ssir-creator.github.io/yinzhuanpu/">')
    for asset in ('style.css', 'simple.css', 'demo-audio.js', 'transcribe.js', 'app-shell.js'):
        preview = preview.replace(f'"{asset}"', f'"{asset}?v={asset_hash}"')
    (ROOT / 'page.template.html').write_text(preview)
    build = hashlib.sha256(html.encode()).hexdigest()[:12]
    (ROOT / 'sw.js').write_text((ROOT / 'sw.template.js').read_text().replace('__BUILD__', build))
    print('Built offline index/demo plus multi-file page.template preview')

if __name__ == '__main__':
    build()
