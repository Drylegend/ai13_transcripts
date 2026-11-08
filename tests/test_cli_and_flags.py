"""Tests for Ingest CLI flags, path picker, undo, remove, dry-run, and edge cases."""
import json
import pytest
from pathlib import Path
from PIL import Image

from ingest.dialogs import validate_single_file_path
from ingest.agents.agent1_normalize import Agent1Normalize
from ingest.agents.agent2_placement import Agent2Placement
from ingest.agents.agent3_numbering import Agent3Numbering
from ingest.agents.agent4_validation import Agent4Validation
from ingest.agents.agent5_publisher import Agent5Publisher
from ingest.cli import IngestCLI
from ingest.config import BACKUP_DIR
from ingest.storage.local import LocalStorage


# ── Test 3a: Rejecting 2+ files, directories, globs, archives ──

def test_picker_rejects_multiple_files(tmp_path):
    f1 = tmp_path / "a.md"
    f2 = tmp_path / "b.md"
    f1.write_text("a", encoding="utf-8")
    f2.write_text("b", encoding="utf-8")

    with pytest.raises(ValueError, match="Multiple file paths detected"):
        validate_single_file_path(f"{f1}, {f2}")

    with pytest.raises(ValueError, match="Multiple file paths detected"):
        validate_single_file_path(f"{f1}\n{f2}")

    with pytest.raises(ValueError, match="Multiple file paths detected"):
        validate_single_file_path(f"{f1};{f2}")


def test_picker_rejects_directory(tmp_path):
    folder = tmp_path / "my_docs"
    folder.mkdir()
    with pytest.raises(ValueError, match="Path is a directory"):
        validate_single_file_path(str(folder))


def test_picker_rejects_wildcards_and_globs(tmp_path):
    with pytest.raises(ValueError, match="Wildcards and globs are not allowed"):
        validate_single_file_path(str(tmp_path / "*.docx"))

    with pytest.raises(ValueError, match="Wildcards and globs are not allowed"):
        validate_single_file_path(str(tmp_path / "doc?.md"))

    with pytest.raises(ValueError, match="Wildcards and globs are not allowed"):
        validate_single_file_path(str(tmp_path / "file[0-9].txt"))


def test_picker_rejects_archives(tmp_path):
    zip_f = tmp_path / "bundle.zip"
    zip_f.write_bytes(b"PK\x03\x04fake_zip")
    with pytest.raises(ValueError, match="Archive files \\(\\.zip\\) are not supported"):
        validate_single_file_path(str(zip_f))

    rar_f = tmp_path / "archive.rar"
    rar_f.write_bytes(b"Rar!fake_rar")
    with pytest.raises(ValueError, match="Archive files \\(\\.rar\\) are not supported"):
        validate_single_file_path(str(rar_f))


# ── Test 3f: HEIC skipped gracefully when pillow-heif is not installed ──

def test_heic_skipped_gracefully(tmp_path):
    heic_file = tmp_path / "photo.heic"
    heic_file.write_bytes(b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00")

    agent = Agent1Normalize()
    with pytest.raises(ValueError, match="HEIC image format requires 'pillow-heif'"):
        agent.process(heic_file)
    agent.cleanup()


# ── Test 3c: Dry-run writes NOTHING to storage or staging ──

def test_dry_run_writes_nothing(tmp_path):
    storage = LocalStorage(tmp_path)
    cli = IngestCLI(storage, dry_run=True, auto_yes=True)

    # Attempt to create module
    ok = cli.action_create_module(title="Dry Mod", slug="dry-mod")
    assert ok is True
    # Confirm storage is empty
    assert len(storage.list()) == 0

    # Ensure no staging leftovers
    assert not any(cli.agent1.staging_dir.glob("*"))


# ── Test 3b: Undo restores JSON files byte-for-byte and deletes newly uploaded keys ──

def test_undo_restores_manifests_and_deletes_uploads(tmp_path):
    storage = LocalStorage(tmp_path)
    cli = IngestCLI(storage, dry_run=False, auto_yes=True)

    # 1. Base state
    slug = "test-undo-mod"
    man_data = {
        "version": "1",
        "slug": slug,
        "title": "Undo Test Module",
        "subtitle": "Sub",
        "description": "Desc",
        "courseCode": "U-100",
        "updatedAt": "2026-11-01T00:00:00Z",
        "days": [{"number": 1, "title": "Day 1"}],
        "labs": [],
        "labCategories": [],
    }
    day_data = {
        "number": 1,
        "title": "Day 1",
        "transcripts": [],
        "links": [],
        "boards": [],
        "questions": [],
        "updatedAt": "2026-11-01T00:00:00Z",
    }
    storage.put_json(f"modules/{slug}/manifest.json", man_data)
    storage.put_json(f"modules/{slug}/days/day-01/day.json", day_data)

    before_man_bytes = (tmp_path / f"modules/{slug}/manifest.json").read_bytes()
    before_day_bytes = (tmp_path / f"modules/{slug}/days/day-01/day.json").read_bytes()

    # 2. Upload an item
    trans_file = tmp_path / "scratch_t1.md"
    trans_file.write_text("# Session Transcript\nSpeaker: Hello.", encoding="utf-8")
    staged = cli.agent1.process(trans_file)

    backup_dir = cli.agent2.create_backup_dir()
    day_key = f"modules/{slug}/days/day-01/day.json"
    man_key = f"modules/{slug}/manifest.json"
    cli.agent2.backup_json_file(day_key, backup_dir)
    cli.agent2.backup_json_file(man_key, backup_dir)

    dest_key = f"modules/{slug}/days/day-01/transcripts/transcript-1.md"
    storage.put_file(dest_key, staged.staged_file, "text/markdown")
    (backup_dir / "__changeset__.json").write_text(
        json.dumps({"operation": "add_transcript", "uploaded_keys": [dest_key]}),
        encoding="utf-8"
    )

    day_data["transcripts"].append({
        "id": "t-1",
        "order": 1,
        "title": "Session 1",
        "file": {
            "path": dest_key,
            "format": "md",
            "sizeBytes": staged.size_bytes,
            "hash": staged.sha256_short,
            "updatedAt": staged.updated_at,
        }
    })
    storage.put_json(day_key, day_data)
    assert storage.exists(dest_key)

    # 3. Perform undo logic
    changeset = json.loads((backup_dir / "__changeset__.json").read_text(encoding="utf-8"))
    for key in changeset.get("uploaded_keys", []):
        storage.delete(key)

    for f in backup_dir.glob("*"):
        if f.name == "__changeset__.json":
            continue
        storage_key = f.name.replace("__", "/")
        storage.put_json(storage_key, json.loads(f.read_text(encoding="utf-8")))

    # 4. Assertions:
    # Uploaded file must be deleted
    assert not storage.exists(dest_key)
    # Manifests restored byte-for-byte
    after_man_bytes = (tmp_path / f"modules/{slug}/manifest.json").read_bytes()
    after_day_bytes = (tmp_path / f"modules/{slug}/days/day-01/day.json").read_bytes()
    assert after_man_bytes == before_man_bytes
    assert after_day_bytes == before_day_bytes


# ── Test 3d: Remove then verify all PASS ──

def test_remove_and_verify_pass(tmp_path):
    storage = LocalStorage(tmp_path)
    cli = IngestCLI(storage, dry_run=False, auto_yes=True)
    slug = "remove-test-mod"
    now_iso = "2026-11-01T00:00:00Z"

    # Seed module, day, and a board photo
    storage.put_json("index.json", {
        "version": "1",
        "updatedAt": now_iso,
        "modules": [
            {
                "slug": slug,
                "title": "Remove Test Mod",
                "subtitle": "Subtitle",
                "description": "Desc",
                "order": 1,
                "dayCount": 1,
                "labCount": 0,
                "boardCount": 1,
                "transcriptCount": 0,
                "questionCount": 0,
                "tags": ["AI-13"],
            }
        ]
    })
    storage.put_json("search-index.json", [])
    storage.put_json(f"modules/{slug}/manifest.json", {
        "version": "1",
        "slug": slug,
        "title": "Remove Test Mod",
        "subtitle": "Subtitle",
        "description": "Desc",
        "courseCode": "RM-101",
        "updatedAt": now_iso,
        "days": [
            {
                "number": 1,
                "title": "Day 1",
                "subtitle": "Sub",
                "hasSummary": False,
                "transcriptCount": 0,
                "linkCount": 0,
                "boardCount": 1,
                "questionCount": 0,
            }
        ],
        "labs": [],
        "labCategories": [],
    })
    storage.put_json(f"modules/{slug}/visuals.json", {"version": "1", "updatedAt": now_iso, "items": []})

    img_file = tmp_path / "board.webp"
    img_file.write_bytes(b"FAKE_BOARD_IMG")
    storage.put_file(f"modules/{slug}/days/day-01/board-1.webp", img_file, "image/webp")

    storage.put_json(f"modules/{slug}/days/day-01/day.json", {
        "number": 1,
        "title": "Day 1",
        "subtitle": "Sub",
        "description": "Desc",
        "transcripts": [],
        "links": [],
        "boards": [
            {
                "id": "b-1",
                "caption": "Board 1",
                "width": 800,
                "height": 600,
                "image": {
                    "path": f"modules/{slug}/days/day-01/board-1.webp",
                    "format": "webp",
                    "sizeBytes": len(b"FAKE_BOARD_IMG"),
                    "hash": "hash123",
                    "updatedAt": now_iso,
                }
            }
        ],
        "questions": [],
        "updatedAt": now_iso,
    })

    # Remove board photo with typed confirmation "b-1"
    ok = cli.action_remove(
        target_type="board",
        module_slug=slug,
        day_number=1,
        item_id="b-1",
        typed_confirm="b-1"
    )
    assert ok is True
    assert not storage.exists(f"modules/{slug}/days/day-01/board-1.webp")

    # Verification must pass with 0 errors
    checks = cli.agent4.verify_all()
    assert all(c.passed for c in checks)

    # Next, remove the entire module with typed confirmation
    ok_mod = cli.action_remove(
        target_type="module",
        module_slug=slug,
        typed_confirm=slug
    )
    assert ok_mod is True
    # Confirm no keys exist for this module
    assert len(storage.list(f"modules/{slug}/")) == 0
    # Verification must still pass cleanly
    checks2 = cli.agent4.verify_all()
    assert all(c.passed for c in checks2)


# ── Test 3e: Non-contiguous day sequence (1, 2, 5) and half-filled day ──

def test_non_contiguous_days_and_half_filled_day(tmp_path):
    storage = LocalStorage(tmp_path)
    agent3 = Agent3Numbering(storage)
    agent4 = Agent4Validation(storage)
    agent5 = Agent5Publisher(storage)
    slug = "gap-mod"
    now_iso = "2026-11-01T00:00:00Z"

    # Seed root index
    storage.put_json("index.json", {
        "version": "1",
        "updatedAt": now_iso,
        "modules": [
            {
                "slug": slug,
                "title": "Gap Module",
                "subtitle": "Non-contiguous",
                "description": "Testing gaps",
                "order": 1,
                "dayCount": 3,
                "labCount": 0,
                "boardCount": 0,
                "transcriptCount": 0,
                "questionCount": 0,
                "tags": ["AI-13"],
            }
        ]
    })
    storage.put_json("search-index.json", [])
    storage.put_json(f"modules/{slug}/visuals.json", {"version": "1", "updatedAt": now_iso, "items": []})

    # Manifest with non-contiguous days 1, 2, 5
    manifest_data = {
        "version": "1",
        "slug": slug,
        "title": "Gap Module",
        "subtitle": "Non-contiguous",
        "description": "Testing gaps",
        "courseCode": "GAP-101",
        "updatedAt": now_iso,
        "days": [
            {"number": 1, "title": "Day 1"},
            {"number": 2, "title": "Day 2"},
            {"number": 5, "title": "Day 5"},
        ],
        "labs": [],
        "labCategories": [],
    }
    storage.put_json(f"modules/{slug}/manifest.json", manifest_data)

    # Next day proposed should be 6
    assert agent3.get_next_day_number(slug) == 6

    # Create Day 1 (Normal)
    storage.put_json(f"modules/{slug}/days/day-01/day.json", {
        "number": 1,
        "title": "Day 1",
        "subtitle": "Overview",
        "description": "Desc",
        "transcripts": [],
        "links": [],
        "boards": [],
        "questions": [],
        "updatedAt": now_iso,
    })

    # Create Day 2 (Half-filled: has summary document, but 0 transcripts and 0 questions)
    sum_doc = tmp_path / "sum2.md"
    sum_doc.write_text("# Summary 2", encoding="utf-8")
    storage.put_file(f"modules/{slug}/days/day-02/summary.md", sum_doc, "text/markdown")

    storage.put_json(f"modules/{slug}/days/day-02/day.json", {
        "number": 2,
        "title": "Day 2",
        "subtitle": "Pipelines",
        "description": "Desc",
        "summary": {
            "path": f"modules/{slug}/days/day-02/summary.md",
            "format": "md",
            "sizeBytes": len(b"# Summary 2"),
            "hash": "sum2hash",
            "updatedAt": now_iso,
        },
        "transcripts": [],
        "links": [],
        "boards": [],
        "questions": [],
        "updatedAt": now_iso,
    })

    # Create Day 5 (Empty day)
    storage.put_json(f"modules/{slug}/days/day-05/day.json", {
        "number": 5,
        "title": "Day 5",
        "subtitle": "Wrap Up",
        "description": "Desc",
        "transcripts": [],
        "links": [],
        "boards": [],
        "questions": [],
        "updatedAt": now_iso,
    })

    # Recompute and verify
    agent5.recompute_manifest(slug)
    agent5.recompute_root_index()

    checks = agent4.verify_all()
    failed = [c for c in checks if not c.passed]
    assert len(failed) == 0, f"Validation failed on non-contiguous days: {failed}"


def test_init_creates_bootstrap_files(tmp_path):
    storage = LocalStorage(str(tmp_path))
    cli = IngestCLI(storage, auto_yes=True)

    assert not storage.exists("index.json")
    assert not storage.exists("search-index.json")

    ok = cli.action_init(commit=False)
    assert ok is True
    assert storage.exists("index.json")
    assert storage.exists("search-index.json")

    idx, _ = storage.get_json("index.json")
    assert idx["version"] == "1"
    assert idx["modules"] == []

    search, _ = storage.get_json("search-index.json")
    assert search == []


def test_site_target_e2e_and_validation(tmp_path):
    """Verifies that an e2e ingest flow works with --target site."""
    content_dir = tmp_path / "public" / "content"
    storage = LocalStorage(str(content_dir))
    cli = IngestCLI(storage, target="site", auto_yes=True)

    # 1. Init
    cli.action_init(commit=False)

    # 2. Create Module
    cli.action_create_module(
        title="MLOps Fundamentals",
        slug="mlops-fundamentals",
        subtitle="End-to-end MLOps",
        description="Module description",
        course_code="AI-300",
    )

    # 3. Create Day 1
    cli.action_create_day(
        module_slug="mlops-fundamentals",
        day_number=1,
        title="Day 1",
        subtitle="Introduction",
        description="Day 1 overview",
    )

    # 4. Add Summary
    summary_file = tmp_path / "day1_summary.md"
    summary_file.write_text("# Day 1 Summary\n\nIntroductory concepts for MLOps.", encoding="utf-8")
    cli.action_add_summary(
        module_slug="mlops-fundamentals",
        day_number=1,
        file_path_override=str(summary_file),
    )

    # 5. Verify all checks pass
    checks = cli.agent4.verify_all()
    failed = [c for c in checks if not c.passed]
    assert len(failed) == 0, f"Validation failed: {failed}"


def test_publish_workflow_in_git_repo(tmp_path, monkeypatch):
    """Verifies git publish commits ONLY public/content and ignores outside changes."""
    import subprocess
    import ingest.cli as cli_mod

    # Setup git repo in tmp_path
    monkeypatch.setattr(cli_mod, "ROOT_DIR", tmp_path)
    subprocess.run(["git", "init"], cwd=tmp_path, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "ci@example.com"], cwd=tmp_path, check=True)
    subprocess.run(["git", "config", "user.name", "CI Bot"], cwd=tmp_path, check=True)

    content_dir = tmp_path / "public" / "content"
    content_dir.mkdir(parents=True)
    (tmp_path / "readme.txt").write_text("outside file", encoding="utf-8")
    subprocess.run(["git", "add", "readme.txt"], cwd=tmp_path, check=True)
    subprocess.run(["git", "commit", "-m", "initial commit"], cwd=tmp_path, check=True)

    storage = LocalStorage(str(content_dir))
    cli = IngestCLI(storage, target="site", auto_yes=True)

    # 1. Nothing to publish when public/content is clean
    res = cli.action_publish()
    assert res is True

    # 2. Modify an outside file
    (tmp_path / "readme.txt").write_text("modified outside file", encoding="utf-8")

    # 3. Add a content file in public/content
    (content_dir / "index.json").write_text('{"version": "1", "modules": []}', encoding="utf-8")
    cli_mod.log_pending_op("initialize content repository")

    # 4. Run publish
    pub_res = cli.action_publish()
    assert pub_res is True

    # 5. Verify git status: public/content is committed, readme.txt is STILL modified & uncommitted
    stat = subprocess.run(["git", "status", "--porcelain"], cwd=tmp_path, capture_output=True, text=True, check=True)
    output = stat.stdout.strip()
    assert "public/content" not in output
    assert "readme.txt" in output

    # Verify commit log
    log_res = subprocess.run(["git", "log", "-1", "--pretty=%B"], cwd=tmp_path, capture_output=True, text=True, check=True)
    assert "content: initialize content repository" in log_res.stdout


def test_file_size_limits_25mb_rejection_and_10mb_warning(tmp_path):
    """Verifies that files > 25 MiB are rejected and files > 10 MiB trigger warnings."""
    agent1 = Agent1Normalize()

    # 26 MiB file
    big_file = tmp_path / "oversized.docx"
    with open(big_file, "wb") as f:
        f.seek(26 * 1024 * 1024)
        f.write(b"\0")

    with pytest.raises(ValueError, match="Cloudflare limit is 25 MiB per file"):
        agent1.process(big_file)

    # 11 MiB file (warning)
    warn_file = tmp_path / "large_note.md"
    with open(warn_file, "wb") as f:
        f.seek(11 * 1024 * 1024)
        f.write(b"# Large Note\n")

    staged = agent1.process(warn_file)
    assert staged is not None
    assert any("large (>10 MB)" in w for w in agent1.warnings)
    agent1.cleanup()


def test_stats_command_reporting(tmp_path):
    """Verifies stats subcommand scans storage and prints summary without error."""
    storage = LocalStorage(str(tmp_path))
    cli = IngestCLI(storage, target="site", auto_yes=True)
    cli.action_init(commit=False)
    cli.action_stats()


