from pathlib import Path

import pytest

from sharedserver.security import SecurityError, resolve_within, sanitize_filename


def test_resolve_within_rejects_traversal_and_absolute_paths(tmp_path: Path) -> None:
    (tmp_path / "safe.txt").write_text("ok", encoding="utf-8")

    assert resolve_within(tmp_path, "safe.txt") == tmp_path / "safe.txt"
    for unsafe in ("../secret.txt", "folder/../../secret.txt", "/etc/passwd", "C:\\secret.txt"):
        with pytest.raises(SecurityError):
            resolve_within(tmp_path, unsafe, must_exist=False)


def test_resolve_within_rejects_symlink_escape(tmp_path: Path) -> None:
    shared = tmp_path / "shared"
    outside = tmp_path / "outside"
    shared.mkdir()
    outside.mkdir()
    link = shared / "escape"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("symlink creation is not permitted on this platform")

    with pytest.raises(SecurityError):
        resolve_within(shared, "escape/file.txt", must_exist=False)


def test_filename_cleaning_removes_paths_and_reserved_characters() -> None:
    assert sanitize_filename("../../report?.txt") == "report_.txt"
    assert sanitize_filename("C:\\temp\\CON") == "_CON"
    assert sanitize_filename("..") == "upload"

