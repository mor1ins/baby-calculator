"""Fail closed before promoting a dev artifact to production."""
import hashlib
import json
import re
import sys
from pathlib import Path


def verify_source(run, source, release, repository):
    """Bind the image manifest to a successful dev build of the run's main commit."""
    if not isinstance(run, dict) or not isinstance(source, dict):
        raise ValueError('Missing release provenance')
    if (run.get('path') != '.github/workflows/deploy-dev.yml'
            or run.get('conclusion') != 'success'
            or run.get('event') not in ('push', 'workflow_dispatch')
            or run.get('head_branch') != 'main'
            or run.get('repository', {}).get('full_name') != repository):
        raise ValueError('Production requires a successful main Deploy dev run in this repository')
    sha = source.get('source_sha', '')
    if (source.get('source_ref') != 'refs/heads/main'
            or not isinstance(sha, str) or not re.fullmatch(r'[a-f0-9]{40}', sha)
            or sha != run.get('head_sha')):
        raise ValueError('Production rejects PR releases: rebuild from main after merging')
    if source.get('release_sha256') != hashlib.sha256(release).hexdigest():
        raise ValueError('Image manifest does not match release provenance')


if __name__ == '__main__':
    metadata = json.loads(Path(sys.argv[1]).read_text())
    directory = Path(sys.argv[2])
    provenance = json.loads((directory / 'release-source.json').read_text())
    verify_source(metadata, provenance, (directory / 'release.env').read_bytes(), sys.argv[3])
    print('Verified: production release was built from main')
