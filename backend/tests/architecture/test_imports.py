import shutil
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("statement", [
    "from service.infrastructure import forbidden",
    "from ..infrastructure import forbidden",
    "from service.contracts import bridge",
])
def test_import_contract_rejects_layer_bypass(tmp_path: Path, statement: str) -> None:
    shutil.copytree(BACKEND / "service", tmp_path / "service")
    shutil.copyfile(BACKEND / "pyproject.toml", tmp_path / "pyproject.toml")
    (tmp_path / "service/application/violation.py").write_text(statement, encoding="utf-8")
    (tmp_path / "service/infrastructure/forbidden.py").touch()
    (tmp_path / "service/contracts/bridge.py").write_text(
        "from service.infrastructure import forbidden\n" if "bridge" in statement else "", encoding="utf-8",
    )
    executable = Path(sys.executable).parent / "lint-imports"
    result = subprocess.run(
        [str(executable), "--no-cache"], cwd=tmp_path, capture_output=True, text=True, check=False,
    )
    assert result.returncode == 1, result.stdout + result.stderr
    assert "BROKEN" in result.stdout, result.stdout + result.stderr
