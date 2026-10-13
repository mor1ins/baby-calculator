"""Regression checks for the PR-to-production loophole."""
import copy
import hashlib
import unittest

from verify_prod_source import verify_source


class ReleasePolicyTests(unittest.TestCase):
    def setUp(self):
        self.repository = 'example/baby'
        self.release = b'BACKEND_IMAGE=ghcr.io/example/baby/backend@sha256:abc\n'
        self.run = {'path': '.github/workflows/deploy-dev.yml', 'conclusion': 'success',
                    'event': 'workflow_dispatch', 'head_branch': 'main', 'head_sha': 'a' * 40,
                    'repository': {'full_name': self.repository}}
        self.source = {'source_ref': 'refs/heads/main', 'source_sha': 'a' * 40,
                       'release_sha256': hashlib.sha256(self.release).hexdigest()}

    def test_accepts_main_push_and_manual_main_builds(self):
        for event in ('push', 'workflow_dispatch'):
            with self.subTest(event=event):
                verify_source({**self.run, 'event': event}, self.source, self.release, self.repository)

    def test_rejects_pr_even_when_workflow_runs_from_main(self):
        source = {**self.source, 'source_ref': 'refs/pull/1/head'}
        with self.assertRaises(ValueError):
            verify_source(self.run, source, self.release, self.repository)

    def test_rejects_missing_or_mismatched_provenance(self):
        cases = [None, {}, {**self.source, 'source_sha': 'b' * 40},
                 {**self.source, 'source_sha': 'main'}, {**self.source, 'release_sha256': 'wrong'}]
        for source in cases:
            with self.subTest(source=source), self.assertRaises(ValueError):
                verify_source(self.run, source, self.release, self.repository)

    def test_rejects_wrong_run_origin_or_result(self):
        for key, value in [('head_branch', 'feature'), ('conclusion', 'failure'),
                           ('event', 'pull_request'), ('path', '.github/workflows/other.yml'),
                           ('repository', {'full_name': 'other/repo'})]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                run = copy.deepcopy(self.run)
                run[key] = value
                verify_source(run, self.source, self.release, self.repository)

    def test_rejects_swapped_images(self):
        with self.assertRaises(ValueError):
            verify_source(self.run, self.source, self.release + b'changed', self.repository)


class DemoPolicyTest(unittest.TestCase):
    def test_demo_provenance(self):
        sha = "a" * 40
        release = b"DEMO_IMAGE=sha256:test\n"
        source = {"source_ref": "refs/heads/main", "source_sha": sha,
                  "release_sha256": hashlib.sha256(release).hexdigest()}
        run = {"path": ".github/workflows/deploy-demo-dev.yml", "conclusion": "success",
               "event": "push", "head_branch": "main", "head_sha": sha,
               "repository": {"full_name": "owner/repo"}}
        verify_source(run, source, release, "owner/repo", "deploy-demo-dev.yml")
        source["source_ref"] = "refs/pull/3/head"
        with self.assertRaises(ValueError):
            verify_source(run, source, release, "owner/repo", "deploy-demo-dev.yml")
