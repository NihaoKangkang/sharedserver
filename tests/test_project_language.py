import re
from pathlib import Path


def test_source_and_documentation_use_english_only() -> None:
    root = Path(__file__).parents[1]
    files = [root / "README.md", root / "pyproject.toml", root / "sharedserver.example.yaml"]
    files += [
        path
        for path in (root / "src").rglob("*")
        if path.suffix in {".py", ".html", ".css", ".js"}
    ]
    files += list((root / "tests").rglob("*.py"))

    chinese = re.compile(r"[\u4e00-\u9fff]")
    offenders = [
        str(path.relative_to(root))
        for path in files
        if path.is_file() and chinese.search(path.read_text(encoding="utf-8"))
    ]
    assert offenders == []


def test_page_does_not_declare_an_icon() -> None:
    index = (
        Path(__file__).parents[1] / "src" / "sharedserver" / "templates" / "index.html"
    ).read_text(encoding="utf-8")

    assert 'rel="icon"' not in index
