"""Comprehensive tests for advanced git publish functionality:
- 4 days content in one go
- content + README + src with prompt (2 separate commits, 1 push)
- with --all
- with --content-only
- refusal of .env and oversized files
- unpushed-commit case
- build-check failure stops publish & offers content-only fallback
- rebase scenario with clean rebase and conflict abort
- dry-run writes nothing
"""
import json
import subprocess
from pathlib import Path
from unittest.mock import MagicMock
import pytest

from ingest.cli import (
    IngestCLI,
    check_forbidden_file,
    format_file_size,
    get_git_status_partitions,
    get_unpushed_commits,
    get_github_commit_url,
    generate_other_commit_message,
)
from ingest.storage.local import LocalStorage


@pytest.fixture
def test_git_repo(tmp_path):
    local_repo = tmp_path / "repo"
    local_repo.mkdir()

    # Initialize git repo
    subprocess.run(["git", "init", "-b", "main"], cwd=local_repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test Committer"], cwd=local_repo, check=True)
    subprocess.run(["git", "config", "user.email", "committer@example.com"], cwd=local_repo, check=True)
    subprocess.run(["git", "remote", "add", "origin", "https://github.com/example/course-portal.git"], cwd=local_repo, check=True)

    # Initial bootstrap files
    (local_repo / ".gitignore").write_text(".env*\n.staging/\n.ingest_backups/\n.ingest_logs/\nnode_modules/\ndist/\n", encoding="utf-8")
    (local_repo / "README.md").write_text("# Initial Readme\n", encoding="utf-8")
    content_dir = local_repo / "public" / "content"
    content_dir.mkdir(parents=True)
    (content_dir / "index.json").write_text('{"version": "1", "modules": []}', encoding="utf-8")
    (content_dir / "search-index.json").write_text('[]', encoding="utf-8")

    subprocess.run(["git", "add", "."], cwd=local_repo, check=True)
    subprocess.run(["git", "commit", "-m", "chore: initial bootstrap"], cwd=local_repo, check=True)
    subprocess.run(["git", "update-ref", "refs/remotes/origin/main", "HEAD"], cwd=local_repo, check=True)
    subprocess.run(["git", "branch", "--set-upstream-to=origin/main", "main"], cwd=local_repo, check=True)

    return {
        "local": local_repo,
        "content_dir": content_dir,
    }


def fake_push_success(cwd):
    """Simulates a successful git push by advancing origin/main to local HEAD."""
    subprocess.run(["git", "update-ref", "refs/remotes/origin/main", "HEAD"], cwd=cwd, check=True)
    return True, None


def test_four_days_content_published_in_one_go(test_git_repo, monkeypatch):
    """Scenario 8a: Four days of content published in one go."""
    local = test_git_repo["local"]
    content_dir = test_git_repo["content_dir"]

    mod_dir = content_dir / "modules" / "ai-course"
    days_dir = mod_dir / "days"
    for d in range(1, 5):
        d_dir = days_dir / f"day-0{d}"
        d_dir.mkdir(parents=True)
        (d_dir / "day.json").write_text(json.dumps({"number": d, "title": f"Day {d}"}), encoding="utf-8")

    (mod_dir / "manifest.json").write_text(json.dumps({"slug": "ai-course", "days": [{"number": i} for i in range(1, 5)]}), encoding="utf-8")

    storage = LocalStorage(str(content_dir))
    cli = IngestCLI(storage, target="site", auto_yes=True, git_dir=local, include_all=True)
    monkeypatch.setattr(cli, "perform_git_push", fake_push_success)

    res = cli.action_publish()
    assert res is True

    # Confirm all 4 days were committed
    status = subprocess.run(["git", "status", "--porcelain"], cwd=local, capture_output=True, text=True, check=True)
    assert status.stdout.strip() == ""

    # Check that origin/main received the commit
    unpushed = subprocess.run(["git", "rev-list", "origin/main..HEAD", "--count"], cwd=local, capture_output=True, text=True, check=True)
    assert unpushed.stdout.strip() == "0"


def test_content_readme_src_with_prompt_two_commits(test_git_repo, monkeypatch):
    """Scenario 8b: Content + README + src changes with interactive prompt creates 2 separate commits."""
    local = test_git_repo["local"]
    content_dir = test_git_repo["content_dir"]

    # Content change
    (content_dir / "index.json").write_text('{"version": "1", "modules": ["mod-1"]}', encoding="utf-8")

    # Non-content changes
    (local / "README.md").write_text("# Updated Readme\nWith new instructions.", encoding="utf-8")
    src_dir = local / "src"
    src_dir.mkdir(parents=True)
    (src_dir / "Component.tsx").write_text("export const C = () => <div>Hello</div>;", encoding="utf-8")

    # Mock user choosing "Yes, include everything"
    import questionary
    mock_select = MagicMock()
    mock_select.ask.return_value = "Yes, include everything"
    monkeypatch.setattr(questionary, "select", lambda *args, **kwargs: mock_select)

    mock_text = MagicMock()
    mock_text.ask.return_value = "chore: update README and add Component"
    monkeypatch.setattr(questionary, "text", lambda *args, **kwargs: mock_text)

    mock_confirm = MagicMock()
    mock_confirm.ask.return_value = True
    monkeypatch.setattr(questionary, "confirm", lambda *args, **kwargs: mock_confirm)

    storage = LocalStorage(str(content_dir))
    cli = IngestCLI(storage, target="site", auto_yes=False, git_dir=local, no_check=True)
    monkeypatch.setattr(cli, "perform_git_push", fake_push_success)

    res = cli.action_publish()
    assert res is True

    # Verify two separate commits in order: first non-content, then content
    log_proc = subprocess.run(["git", "log", "-2", "--oneline"], cwd=local, capture_output=True, text=True, check=True)
    lines = [ln.strip() for ln in log_proc.stdout.splitlines() if ln.strip()]
    assert len(lines) == 2
    assert "content:" in lines[0]
    assert "chore: update README and add Component" in lines[1]

    # Verify all pushed
    unpushed = subprocess.run(["git", "rev-list", "origin/main..HEAD", "--count"], cwd=local, capture_output=True, text=True, check=True)
    assert unpushed.stdout.strip() == "0"


def test_publish_with_all_flag(test_git_repo, monkeypatch):
    """Scenario 8c: Content + README with --all flag."""
    local = test_git_repo["local"]
    content_dir = test_git_repo["content_dir"]

    (content_dir / "index.json").write_text('{"version": "1", "all_flag": true}', encoding="utf-8")
    (local / "README.md").write_text("# Modified via --all", encoding="utf-8")

    storage = LocalStorage(str(content_dir))
    cli = IngestCLI(storage, target="site", auto_yes=True, git_dir=local, include_all=True, no_check=True)
    monkeypatch.setattr(cli, "perform_git_push", fake_push_success)

    res = cli.action_publish()
    assert res is True

    status = subprocess.run(["git", "status", "--porcelain"], cwd=local, capture_output=True, text=True, check=True)
    assert status.stdout.strip() == ""


def test_publish_with_content_only_flag(test_git_repo, monkeypatch):
    """Scenario 8d: Content + README with --content-only flag leaves README untouched."""
    local = test_git_repo["local"]
    content_dir = test_git_repo["content_dir"]

    (content_dir / "index.json").write_text('{"version": "1", "content_only": true}', encoding="utf-8")
    (local / "README.md").write_text("# Untracked change that should not be committed", encoding="utf-8")

    storage = LocalStorage(str(content_dir))
    cli = IngestCLI(storage, target="site", auto_yes=True, git_dir=local, content_only=True, no_check=True)
    monkeypatch.setattr(cli, "perform_git_push", fake_push_success)

    res = cli.action_publish()
    assert res is True

    # Content committed; README is still modified and uncommitted
    status = subprocess.run(["git", "status", "--porcelain"], cwd=local, capture_output=True, text=True, check=True)
    output = status.stdout.strip()
    assert "public/content" not in output
    assert "README.md" in output


def test_safety_rails_refuses_env_and_oversized_files(test_git_repo, monkeypatch):
    """Scenario 8e: Safety rails block .env files and >25 MiB files."""
    local = test_git_repo["local"]
    content_dir = test_git_repo["content_dir"]

    # Temporarily remove .env from .gitignore so git status detects it
    (local / ".gitignore").write_text(".staging/\n.ingest_backups/\nnode_modules/\ndist/\n", encoding="utf-8")

    storage = LocalStorage(str(content_dir))
    cli = IngestCLI(storage, target="site", auto_yes=True, git_dir=local, include_all=True, no_check=True)
    monkeypatch.setattr(cli, "perform_git_push", fake_push_success)

    # 1. Refusal of .env file
    env_file = local / ".env.secret"
    env_file.write_text("SECRET_KEY=12345", encoding="utf-8")

    res = cli.action_publish()
    assert res is False
    env_file.unlink()

    # 2. Refusal of oversized file (> 25 MiB)
    big_file = local / "oversized.bin"
    with open(big_file, "wb") as f:
        f.seek(26 * 1024 * 1024)
        f.write(b"\0")

    res2 = cli.action_publish()
    assert res2 is False
    big_file.unlink()


def test_unpushed_commit_case(test_git_repo, monkeypatch):
    """Scenario 8f: Local unpushed commit is pushed even when working tree is clean."""
    local = test_git_repo["local"]
    content_dir = test_git_repo["content_dir"]

    # Make a local commit with clean working copy
    (content_dir / "index.json").write_text('{"version": "1", "local_only": true}', encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=local, check=True)
    subprocess.run(["git", "commit", "-m", "content: offline local commit"], cwd=local, check=True)

    # Working copy is clean but 1 unpushed commit exists
    status = subprocess.run(["git", "status", "--porcelain"], cwd=local, capture_output=True, text=True, check=True)
    assert status.stdout.strip() == ""
    unpushed_before = subprocess.run(["git", "rev-list", "origin/main..HEAD", "--count"], cwd=local, capture_output=True, text=True, check=True)
    assert unpushed_before.stdout.strip() == "1"

    storage = LocalStorage(str(content_dir))
    cli = IngestCLI(storage, target="site", auto_yes=True, git_dir=local)
    monkeypatch.setattr(cli, "perform_git_push", fake_push_success)

    res = cli.action_publish()
    assert res is True

    # Remote now has all commits
    unpushed_after = subprocess.run(["git", "rev-list", "origin/main..HEAD", "--count"], cwd=local, capture_output=True, text=True, check=True)
    assert unpushed_after.stdout.strip() == "0"


def test_build_check_failure_stops_publish_and_offers_content_only(test_git_repo, monkeypatch):
    """Scenario 8g: Build check failure stops publish and offers content-only fallback."""
    local = test_git_repo["local"]
    content_dir = test_git_repo["content_dir"]

    # Content change
    (content_dir / "index.json").write_text('{"version": "1", "safe_content": true}', encoding="utf-8")
    # Code change
    (local / "README.md").write_text("# Broken code docs", encoding="utf-8")

    storage = LocalStorage(str(content_dir))
    cli = IngestCLI(storage, target="site", auto_yes=False, git_dir=local, include_all=True, no_check=False)
    monkeypatch.setattr(cli, "perform_git_push", fake_push_success)

    # Mock build check to fail
    monkeypatch.setattr(cli, "run_project_checks", lambda *args, **kwargs: (False, "TypeScript syntax error in src/index.ts"))

    import questionary
    mock_select = MagicMock()
    mock_select.ask.return_value = "Abort publish (fix code errors first)"
    monkeypatch.setattr(questionary, "select", lambda *args, **kwargs: mock_select)

    mock_confirm = MagicMock()
    mock_confirm.ask.return_value = True
    monkeypatch.setattr(questionary, "confirm", lambda *args, **kwargs: mock_confirm)

    res1 = cli.action_publish()
    assert res1 is False
    # Nothing was committed
    status = subprocess.run(["git", "status", "--porcelain"], cwd=local, capture_output=True, text=True, check=True)
    assert "public/content" in status.stdout
    assert "README.md" in status.stdout

    # Case 2: User chooses "Publish content only"
    mock_select.ask.return_value = "Publish content only (ignore code changes for now)"
    res2 = cli.action_publish()
    assert res2 is True

    # Content committed and pushed; README.md remains uncommitted
    status2 = subprocess.run(["git", "status", "--porcelain"], cwd=local, capture_output=True, text=True, check=True)
    assert "public/content" not in status2.stdout
    assert "README.md" in status2.stdout


def test_rebase_scenario_and_conflict_handling(test_git_repo, monkeypatch):
    """Scenario 8h: Rebase integrates remote commits, and handles conflicts by aborting cleanly."""
    local = test_git_repo["local"]
    content_dir = test_git_repo["content_dir"]

    # 1. Create a remote branch that has an extra commit R
    subprocess.run(["git", "branch", "remote_branch"], cwd=local, check=True)
    subprocess.run(["git", "checkout", "remote_branch"], cwd=local, check=True)
    (local / "remote_doc.txt").write_text("Remote documentation", encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=local, check=True)
    subprocess.run(["git", "commit", "-m", "docs: remote update"], cwd=local, check=True)
    subprocess.run(["git", "checkout", "main"], cwd=local, check=True)

    # Point origin/main to remote_branch
    subprocess.run(["git", "update-ref", "refs/remotes/origin/main", "remote_branch"], cwd=local, check=True)

    # Verify origin/main is ahead by 1
    behind = subprocess.run(["git", "rev-list", "HEAD..origin/main", "--count"], cwd=local, capture_output=True, text=True, check=True)
    assert behind.stdout.strip() == "1"

    # Local has a content commit
    (content_dir / "index.json").write_text('{"version": "1", "rebased": true}', encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=local, check=True)
    subprocess.run(["git", "commit", "-m", "content: local changes"], cwd=local, check=True)

    # Run rebase directly via git
    rebase_res = subprocess.run(["git", "rebase", "origin/main"], cwd=local, capture_output=True, text=True)
    assert rebase_res.returncode == 0
    assert (local / "remote_doc.txt").is_file()

    # 2. Test conflict scenario abort
    # Create conflicting file on origin/main and on local
    (local / "conflict.txt").write_text("Local version", encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=local, check=True)
    subprocess.run(["git", "commit", "-m", "conflict: local"], cwd=local, check=True)

    subprocess.run(["git", "checkout", "remote_branch"], cwd=local, check=True)
    (local / "conflict.txt").write_text("Conflicting remote version", encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=local, check=True)
    subprocess.run(["git", "commit", "-m", "conflict: remote"], cwd=local, check=True)
    subprocess.run(["git", "checkout", "main"], cwd=local, check=True)
    subprocess.run(["git", "update-ref", "refs/remotes/origin/main", "remote_branch"], cwd=local, check=True)

    # Attempt rebase: should conflict
    res_conflict = subprocess.run(["git", "rebase", "origin/main"], cwd=local, capture_output=True, text=True)
    assert res_conflict.returncode != 0
    # Abort cleanly
    abort_res = subprocess.run(["git", "rebase", "--abort"], cwd=local, capture_output=True, text=True)
    assert abort_res.returncode == 0


def test_dry_run_writes_nothing(test_git_repo):
    """Scenario 8i: Dry run displays full plan and writes nothing to git or storage."""
    local = test_git_repo["local"]
    content_dir = test_git_repo["content_dir"]

    (content_dir / "index.json").write_text('{"version": "1", "dry_run": true}', encoding="utf-8")
    (local / "README.md").write_text("# Dry Run Readme", encoding="utf-8")

    storage = LocalStorage(str(content_dir))
    cli = IngestCLI(storage, target="site", dry_run=True, auto_yes=True, git_dir=local, include_all=True)

    res = cli.action_publish()
    assert res is True

    # Both files must remain uncommitted in working copy
    status = subprocess.run(["git", "status", "--porcelain"], cwd=local, capture_output=True, text=True, check=True)
    assert "public/content" in status.stdout
    assert "README.md" in status.stdout

    # Remote has 0 unpushed commits
    unpushed = subprocess.run(["git", "rev-list", "origin/main..HEAD", "--count"], cwd=local, capture_output=True, text=True, check=True)
    assert unpushed.stdout.strip() == "0"
