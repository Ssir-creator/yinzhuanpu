"""Publish the self-contained page to gh-pages without switching the checkout.

Requires Git push access. GitHub Pages must use gh-pages / (root).
Never force-push: concurrent updates fail safely and require a new invocation.
"""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def git(*args, env=None, content=None):
    return subprocess.check_output(['git', *args], cwd=ROOT, env=env, input=content).decode().strip()


def publish():
    page = (ROOT / 'index.html').read_bytes()
    if b'window.DEMO_AUDIO=' not in page or b'<style>' not in page:
        raise RuntimeError('Build the self-contained page before publishing.')
    remote = git('ls-remote', '--heads', 'origin', 'refs/heads/gh-pages')
    parent = remote.split()[0] if remote else None
    if parent:
        git('fetch', '--no-tags', 'origin', 'refs/heads/gh-pages')
    with tempfile.TemporaryDirectory(prefix='string-lens-publish-') as tmp:
        env = os.environ.copy()
        env['GIT_INDEX_FILE'] = str(Path(tmp) / 'index')
        env['GIT_AUTHOR_NAME'] = env['GIT_COMMITTER_NAME'] = 'github-actions[bot]'
        env['GIT_AUTHOR_EMAIL'] = env['GIT_COMMITTER_EMAIL'] = '41898282+github-actions[bot]@users.noreply.github.com'
        git('read-tree', '--empty', env=env)
        for name, contents in [('index.html', page), ('.nojekyll', b'')]:
            blob = git('hash-object', '-w', '--stdin', content=contents)
            git('update-index', '--add', '--cacheinfo', f'100644,{blob},{name}', env=env)
        tree = git('write-tree', env=env)
        if parent and git('rev-parse', f'{parent}^{{tree}}') == tree:
            print('gh-pages already contains this build; no update needed.')
            return
        source = git('rev-parse', '--short', 'HEAD')
        args = ['commit-tree', tree, '-m', f'Publish String Lens from {source}']
        if parent:
            args.extend(['-p', parent])
        commit = git(*args, env=env)
        subprocess.run(['git', 'push', 'origin', f'{commit}:refs/heads/gh-pages'], cwd=ROOT, check=True)
        print('Published gh-pages commit', commit)


if __name__ == '__main__':
    publish()
