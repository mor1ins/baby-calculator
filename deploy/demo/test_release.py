"""Exercise release state/rollback with a fake Docker CLI; no SSH or daemon needed."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).with_name('release.sh').read_text()
REPOSITORY = 'ghcr.io/example/tishe/demo'


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.root = self.base / 'demo' / 'dev'
        (self.root / 'releases').mkdir(parents=True)
        (self.root / '.env').write_text('DEMO_PORT=8083\n')
        self.bin = self.base / 'bin'
        self.bin.mkdir()
        self.log = self.base / 'docker.log'
        self.env = dict(os.environ, PATH=f'{self.bin}:{os.environ["PATH"]}',
                        DEMO_REPOSITORY=REPOSITORY, TEST_LOG=str(self.log))
        self.env.pop('GHCR_USER', None)
        self.command('flock', '#!/bin/sh\nexit 0\n')
        self.command('mv', '''#!/usr/bin/env python3
import os,sys
os.replace(sys.argv[-2],sys.argv[-1])
''')
        self.command('docker', '''#!/usr/bin/env python3
import os,sys
from pathlib import Path
args=sys.argv[1:]
with open(os.environ['TEST_LOG'],'a') as out: out.write(' '.join(args)+'\\n')
files=[args[i+1] for i,a in enumerate(args) if a=='--env-file']
manifest=Path(files[-1]).read_text() if files else ''
if os.environ.get('FAIL_IMAGE','!') in manifest and os.environ.get('FAIL_COMMAND','up') in args:
    sys.exit(1)
''')

    def command(self, name, text):
        path = self.bin / name
        path.write_text(text)
        path.chmod(0o755)

    def bundle(self, name, digest):
        path = self.root / 'releases' / f'release.{name}'
        path.mkdir()
        (path / 'release.sh').write_text(SOURCE.replace('/srv/baby/demo', str(self.base / 'demo')))
        (path / 'compose.yaml').write_text('services: {}\n')
        (path / 'release.env').write_text(
            f'DEMO_IMAGE={REPOSITORY}@sha256:{digest * 64}\nDEMO_REVISION={digest * 40}\n')
        return path

    def run_release(self, bundle):
        return subprocess.run(['bash', str(bundle / 'release.sh'), 'dev'], env=self.env,
                              capture_output=True, text=True)

    def test_success_tracks_current_and_previous_bundles(self):
        first, second = self.bundle('first', 'a'), self.bundle('second', 'b')
        self.assertEqual(self.run_release(first).returncode, 0)
        self.assertEqual(self.run_release(second).returncode, 0)
        self.assertEqual((self.root / 'current').resolve(), second)
        self.assertEqual((self.root / 'previous').resolve(), first)
        self.assertIn('baby-demo-dev', self.log.read_text())

    def test_unhealthy_candidate_rolls_back_using_previous_compose(self):
        first, second = self.bundle('first', 'a'), self.bundle('second', 'b')
        self.assertEqual(self.run_release(first).returncode, 0)
        self.env['FAIL_IMAGE'] = 'sha256:' + 'b' * 64
        self.assertNotEqual(self.run_release(second).returncode, 0)
        self.assertEqual((self.root / 'current').resolve(), first)
        last = self.log.read_text().splitlines()[-1]
        self.assertIn(str(first / 'compose.yaml'), last.replace('/current/', f'/releases/{first.name}/'))
        self.assertIn('up -d --wait', last)

    def test_pull_failure_does_not_replace_running_release(self):
        first, second = self.bundle('first', 'a'), self.bundle('second', 'b')
        self.assertEqual(self.run_release(first).returncode, 0)
        self.env.update(FAIL_IMAGE='sha256:' + 'b' * 64, FAIL_COMMAND='pull')
        self.assertNotEqual(self.run_release(second).returncode, 0)
        self.assertEqual((self.root / 'current').resolve(), first)
        self.assertTrue(self.log.read_text().splitlines()[-1].endswith(' pull'))

    def test_rejects_untrusted_manifest_without_executing_it(self):
        bundle = self.bundle('bad', 'a')
        sentinel = self.base / 'executed'
        for content in [f'DEMO_IMAGE=$(touch {sentinel})\nDEMO_REVISION={"a" * 40}\n',
                        f'DEMO_IMAGE=ghcr.io/attacker/tishe/demo@sha256:{"a" * 64}\nDEMO_REVISION={"a" * 40}\n',
                        f'DEMO_IMAGE={REPOSITORY}:latest\nDEMO_REVISION={"a" * 40}\n']:
            (bundle / 'release.env').write_text(content)
            self.assertNotEqual(self.run_release(bundle).returncode, 0)
            self.assertFalse(sentinel.exists())
            self.assertFalse(self.log.exists())

    def test_first_failed_release_does_not_create_current(self):
        candidate = self.bundle('first', 'a')
        self.env['FAIL_IMAGE'] = 'sha256:' + 'a' * 64
        self.assertNotEqual(self.run_release(candidate).returncode, 0)
        self.assertFalse((self.root / 'current').exists())

    def test_manual_rollback_can_use_previous_symlink(self):
        first, second = self.bundle('first', 'a'), self.bundle('second', 'b')
        self.assertEqual(self.run_release(first).returncode, 0)
        self.assertEqual(self.run_release(second).returncode, 0)
        self.assertEqual(self.run_release(self.root / 'previous').returncode, 0)
        self.assertEqual((self.root / 'current').resolve(), first)
        self.assertEqual((self.root / 'previous').resolve(), second)


if __name__ == '__main__':
    unittest.main()
