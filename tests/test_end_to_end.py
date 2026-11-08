"""End-to-End Integration Test for Ingest Tool against LocalStorage."""
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image
import docx
import pytest

from ingest.agents.agent1_normalize import Agent1Normalize
from ingest.agents.agent2_placement import Agent2Placement, parse_questions_markdown
from ingest.agents.agent3_numbering import Agent3Numbering
from ingest.agents.agent4_validation import Agent4Validation
from ingest.agents.agent5_publisher import Agent5Publisher
from ingest.storage.local import LocalStorage


def test_end_to_end_course_workflow(tmp_path):
    storage = LocalStorage(tmp_path)
    agent1 = Agent1Normalize()
    agent2 = Agent2Placement(storage)
    agent3 = Agent3Numbering(storage)
    agent4 = Agent4Validation(storage)
    agent5 = Agent5Publisher(storage)

    slug = "test-mod"
    now_iso = datetime.now(timezone.utc).isoformat()

    def assert_valid(msg: str):
        checks = agent4.verify_all()
        failures = [c for c in checks if not c.passed]
        if failures:
            fail_msgs = "\n".join(f"- {f.name}: {f.message}" for f in failures)
            pytest.fail(f"Agent 4 validation failed after step '{msg}':\n{fail_msgs}")

    # ==========================================
    # Step 1: Create module 'test-mod'
    # ==========================================
    manifest_data = {
        "version": "1",
        "slug": slug,
        "title": "Test MLOps Course",
        "subtitle": "AI-300 Exam Prep",
        "description": "Comprehensive MLOps training course.",
        "courseCode": "AI-300",
        "updatedAt": now_iso,
        "days": [],
        "labs": [],
        "labCategories": [{"slug": "hands-on", "label": "Hands-On Labs"}],
    }
    storage.put_json(f"modules/{slug}/manifest.json", manifest_data)
    storage.put_json(f"modules/{slug}/visuals.json", {"version": "1", "updatedAt": now_iso, "items": []})

    index_data = {
        "version": "1",
        "updatedAt": now_iso,
        "modules": [
            {
                "slug": slug,
                "title": "Test MLOps Course",
                "subtitle": "AI-300 Exam Prep",
                "description": "Comprehensive MLOps training course.",
                "order": 1,
                "dayCount": 0,
                "labCount": 0,
                "boardCount": 0,
                "transcriptCount": 0,
                "questionCount": 0,
                "tags": ["AI-300"],
            }
        ]
    }
    storage.put_json("index.json", index_data)
    agent5.recompute_search_index(slug)
    assert_valid("1. create module")

    # ==========================================
    # Step 2: Create day 1
    # ==========================================
    day_folder = "day-01"
    day_data = {
        "number": 1,
        "title": "Day 1: Intro to MLOps",
        "subtitle": "Architecture and Setup",
        "description": "Foundational architecture overview.",
        "recap": "Today we established the cloud environments and storage accounts.",
        "transcripts": [],
        "links": [],
        "boards": [],
        "questions": [],
        "updatedAt": now_iso,
    }
    storage.put_json(f"modules/{slug}/days/{day_folder}/day.json", day_data)

    manifest_data["days"].append({
        "number": 1,
        "title": "Day 1: Intro to MLOps",
        "subtitle": "Architecture and Setup",
        "hasSummary": False,
        "transcriptCount": 0,
        "linkCount": 0,
        "boardCount": 0,
        "questionCount": 0,
    })
    storage.put_json(f"modules/{slug}/manifest.json", manifest_data)
    agent5.recompute_manifest(slug)
    agent5.recompute_root_index()
    agent5.recompute_search_index(slug)
    assert_valid("2. create day 1")

    # ==========================================
    # Step 3: Add summary.docx
    # ==========================================
    doc_path = tmp_path / "scratch_summary.docx"
    doc = docx.Document()
    doc.add_heading("Day 1 Comprehensive Summary", level=1)
    doc.add_paragraph("Summary of architecture discussions.")
    doc.save(str(doc_path))

    staged_docx = agent1.process(doc_path)
    docx_storage_key = f"modules/{slug}/days/{day_folder}/summary.docx"
    storage.put_file(docx_storage_key, staged_docx.staged_file, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    day_data["summary"] = {
        "path": docx_storage_key,
        "format": "docx",
        "sizeBytes": staged_docx.size_bytes,
        "hash": staged_docx.sha256_short,
        "updatedAt": staged_docx.updated_at,
    }
    storage.put_json(f"modules/{slug}/days/{day_folder}/day.json", day_data)
    agent5.recompute_manifest(slug)
    agent5.recompute_root_index()
    assert_valid("3. add summary.docx")

    # ==========================================
    # Step 4: Add summary.md (updating summary)
    # ==========================================
    md_path = tmp_path / "scratch_summary.md"
    md_path.write_text("# Day 1 Summary\n\nDetailed breakdown of pipeline orchestration.", encoding="utf-8")

    staged_md = agent1.process(md_path)
    md_storage_key = f"modules/{slug}/days/{day_folder}/summary.md"
    storage.put_file(md_storage_key, staged_md.staged_file, "text/markdown; charset=utf-8")

    day_data["summary"] = {
        "path": md_storage_key,
        "format": "md",
        "sizeBytes": staged_md.size_bytes,
        "hash": staged_md.sha256_short,
        "updatedAt": staged_md.updated_at,
    }
    storage.put_json(f"modules/{slug}/days/{day_folder}/day.json", day_data)
    agent5.recompute_manifest(slug)
    assert_valid("4. add summary.md")

    # ==========================================
    # Step 5: Add transcript 1 (md) + transcript 2 (docx)
    # ==========================================
    t1_file = tmp_path / "t1.md"
    t1_file.write_text("# Session 1\nSpeaker 1: Welcome to the module.", encoding="utf-8")
    staged_t1 = agent1.process(t1_file)
    t1_key = f"modules/{slug}/days/{day_folder}/transcript-01.md"
    storage.put_file(t1_key, staged_t1.staged_file, "text/markdown; charset=utf-8")

    day_data["transcripts"].append({
        "id": "transcript-01",
        "order": 1,
        "title": "Morning Discussion",
        "file": {
            "path": t1_key,
            "format": "md",
            "sizeBytes": staged_t1.size_bytes,
            "hash": staged_t1.sha256_short,
            "updatedAt": staged_t1.updated_at,
        }
    })

    t2_file = tmp_path / "t2.docx"
    doc2 = docx.Document()
    doc2.add_paragraph("Speaker 2: Deep dive into ML compute.")
    doc2.save(str(t2_file))
    staged_t2 = agent1.process(t2_file)
    t2_key = f"modules/{slug}/days/{day_folder}/transcript-02.docx"
    storage.put_file(t2_key, staged_t2.staged_file, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    day_data["transcripts"].append({
        "id": "transcript-02",
        "order": 2,
        "title": "Afternoon Compute Walkthrough",
        "file": {
            "path": t2_key,
            "format": "docx",
            "sizeBytes": staged_t2.size_bytes,
            "hash": staged_t2.sha256_short,
            "updatedAt": staged_t2.updated_at,
        }
    })

    storage.put_json(f"modules/{slug}/days/{day_folder}/day.json", day_data)
    agent5.recompute_manifest(slug)
    agent5.recompute_root_index()
    assert_valid("5. add transcripts")

    # ==========================================
    # Step 6: Add 2 board photos (PNG -> WebP + Thumbs)
    # ==========================================
    for b_idx in (1, 2):
        img_p = tmp_path / f"board_{b_idx}.png"
        img = Image.new("RGB", (800, 600), color=(50 * b_idx, 100, 150))
        img.save(img_p, format="PNG")

        staged_img = agent1.process(img_p)
        b_key = f"modules/{slug}/days/{day_folder}/board-0{b_idx}.webp"
        t_key = f"modules/{slug}/days/{day_folder}/board-0{b_idx}-thumb.webp"

        storage.put_file(b_key, staged_img.staged_file, "image/webp")
        storage.put_file(t_key, staged_img.staged_thumb, "image/webp")

        day_data["boards"].append({
            "id": f"board-0{b_idx}",
            "caption": f"Whiteboard Diagram {b_idx}",
            "width": staged_img.width,
            "height": staged_img.height,
            "image": {
                "path": b_key,
                "format": "webp",
                "sizeBytes": staged_img.size_bytes,
                "hash": staged_img.sha256_short,
                "updatedAt": staged_img.updated_at,
            },
            "thumb": {
                "path": t_key,
                "format": "webp",
                "sizeBytes": staged_img.staged_thumb.stat().st_size,
                "hash": agent1._calc_hash(staged_img.staged_thumb),
                "updatedAt": staged_img.updated_at,
            }
        })

    storage.put_json(f"modules/{slug}/days/{day_folder}/day.json", day_data)
    agent5.recompute_visuals_index(slug)
    agent5.recompute_manifest(slug)
    agent5.recompute_root_index()
    assert_valid("6. add board photos")

    # ==========================================
    # Step 7: Add 5 questions via markdown file
    # ==========================================
    q_file = tmp_path / "questions.md"
    q_file.write_text("""## Q1: What is a Datastore in Azure ML?
**Answer:** An abstraction over Azure Storage.
**Explain simply:** Like a pointer or alias to a storage drive.
**Tags:** storage, azure

## Q2: Why use Managed Identity?
**Answer:** Eliminates credential rotation.
**Explain simply:** Automatic cloud identity.
**Tags:** security

## Q3: What is Data Drift?
**Answer:** Statistical changes in feature distributions over time.
**Explain simply:** When real world inputs change from training inputs.
**Tags:** monitoring

## Q4: What is MLflow used for?
**Answer:** Tracking experiments, metrics, and models.
**Explain simply:** A flight recorder for ML training.
**Tags:** mlflow, tracking

## Q5: How to trigger automated retraining?
**Answer:** Through Azure Event Grid or schedules.
**Explain simply:** Set a timer or alert when accuracy drops.
**Tags:** automation
""", encoding="utf-8")

    parsed_qs = parse_questions_markdown(q_file.read_text(encoding="utf-8"))
    assert len(parsed_qs) == 5
    day_data["questions"] = parsed_qs
    storage.put_json(f"modules/{slug}/days/{day_folder}/day.json", day_data)
    agent5.recompute_manifest(slug)
    agent5.recompute_root_index()
    agent5.recompute_search_index(slug)
    assert_valid("7. add 5 questions")

    # ==========================================
    # Step 8: Add a link
    # ==========================================
    day_data["links"].append({
        "label": "Azure ML Python SDK v2 Documentation",
        "url": "https://learn.microsoft.com/azure/machine-learning",
        "description": "Official reference documentation.",
    })
    storage.put_json(f"modules/{slug}/days/{day_folder}/day.json", day_data)
    agent5.recompute_manifest(slug)
    assert_valid("8. add link")

    # ==========================================
    # Step 9: Create lab category 'hands-on'
    # ==========================================
    # Already added at module init; category exists.
    assert "hands-on" in [c["slug"] for c in manifest_data["labCategories"]]

    # ==========================================
    # Step 10: Create lab 1
    # ==========================================
    lab_id = "lab-01"
    lab_data = {
        "id": lab_id,
        "number": 1,
        "title": "Lab 1: Setting Up Azure ML Workspace",
        "category": "hands-on",
        "sourceUrl": "https://microsoftlearning.github.io/mslearn-azure-ml/",
        "links": [{"label": "Lab Setup Script", "url": "https://github.com/Azure/azure-quickstarts"}],
        "updatedAt": now_iso,
    }
    storage.put_json(f"modules/{slug}/labs/{lab_id}/lab.json", lab_data)

    manifest, _ = storage.get_json(f"modules/{slug}/manifest.json")
    manifest["labs"].append({
        "id": lab_id,
        "number": 1,
        "title": "Lab 1: Setting Up Azure ML Workspace",
        "category": "hands-on",
        "hasNotes": False,
        "hasDoodle": False,
    })
    storage.put_json(f"modules/{slug}/manifest.json", manifest)
    agent5.recompute_manifest(slug)
    agent5.recompute_root_index()
    agent5.recompute_search_index(slug)
    assert_valid("10. create lab 1")

    # ==========================================
    # Step 11: Add lab notes (md)
    # ==========================================
    lab_notes_file = tmp_path / "lab_notes.md"
    lab_notes_file.write_text("# Lab 1 Personal Notes\n\nRemember to tear down compute nodes after lab.", encoding="utf-8")
    staged_lab_notes = agent1.process(lab_notes_file)
    lab_notes_key = f"modules/{slug}/labs/{lab_id}/notes.md"
    storage.put_file(lab_notes_key, staged_lab_notes.staged_file, "text/markdown; charset=utf-8")

    lab_data["notes"] = {
        "path": lab_notes_key,
        "format": "md",
        "sizeBytes": staged_lab_notes.size_bytes,
        "hash": staged_lab_notes.sha256_short,
        "updatedAt": staged_lab_notes.updated_at,
    }
    storage.put_json(f"modules/{slug}/labs/{lab_id}/lab.json", lab_data)
    agent5.recompute_manifest(slug)
    assert_valid("11. add lab notes")

    # ==========================================
    # Step 12: Add lab doodle (PNG -> WebP)
    # ==========================================
    doodle_p = tmp_path / "doodle.png"
    d_img = Image.new("RGB", (800, 500), color=(20, 180, 120))
    d_img.save(doodle_p, format="PNG")
    staged_doodle = agent1.process(doodle_p)
    doodle_key = f"modules/{slug}/labs/{lab_id}/doodle.webp"
    doodle_thumb_key = f"modules/{slug}/labs/{lab_id}/doodle-thumb.webp"
    storage.put_file(doodle_key, staged_doodle.staged_file, "image/webp")
    storage.put_file(doodle_thumb_key, staged_doodle.staged_thumb, "image/webp")

    lab_data["doodle"] = {
        "path": doodle_key,
        "format": "webp",
        "sizeBytes": staged_doodle.size_bytes,
        "hash": staged_doodle.sha256_short,
        "updatedAt": staged_doodle.updated_at,
    }
    lab_data["thumb"] = {
        "path": doodle_thumb_key,
        "format": "webp",
        "sizeBytes": staged_doodle.staged_thumb.stat().st_size,
        "hash": agent1._calc_hash(staged_doodle.staged_thumb),
        "updatedAt": staged_doodle.updated_at,
    }
    storage.put_json(f"modules/{slug}/labs/{lab_id}/lab.json", lab_data)
    agent5.recompute_manifest(slug)
    agent5.recompute_visuals_index(slug)
    assert_valid("12. add lab doodle")

    # ==========================================
    # Step 13: TypeScript/Zod Validator Check via subprocess
    # ==========================================
    result = subprocess.run(
        ["node", "scripts/check-content.mjs", str(tmp_path)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"check-content.mjs failed with output:\n{result.stdout}\n{result.stderr}"

    # ==========================================
    # Step 14: Duplicate content detection test
    # ==========================================
    dup_match = agent3.check_duplicate_hash(slug, staged_doodle.sha256_short)
    assert dup_match is not None
    assert f"Lab {lab_id}" in dup_match

    # ==========================================
    # Step 15: Rebuild-all Idempotence Test
    # ==========================================
    # Capture snapshot of all JSON files
    before_rebuild = {}
    for p in tmp_path.glob("**/*.json"):
        before_rebuild[p.relative_to(tmp_path).as_posix()] = json.loads(p.read_text(encoding="utf-8"))

    agent5.rebuild_all()

    for rel_path, data_before in before_rebuild.items():
        curr_p = tmp_path / rel_path
        assert curr_p.is_file(), f"File {rel_path} missing after rebuild"
        curr_data = json.loads(curr_p.read_text(encoding="utf-8"))
        # Verify content identity (ignoring slight timestamp changes on rebuild)
        if "updatedAt" in curr_data and "updatedAt" in data_before:
            curr_data["updatedAt"] = data_before["updatedAt"]
        assert curr_data == data_before, f"Discrepancy in {rel_path} after rebuild_all()"

    agent1.cleanup()
