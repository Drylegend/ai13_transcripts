"""Tests for Ingest Agents (Agent 2 Placement, Agent 3 Numbering, Agent 5 Publisher)."""
import pytest
from pathlib import Path

from ingest.storage.local import LocalStorage
from ingest.agents.agent2_placement import parse_questions_markdown, slugify
from ingest.agents.agent3_numbering import Agent3Numbering
from ingest.agents.agent5_publisher import Agent5Publisher


def test_agent2_parse_questions_markdown():
    sample_md = """
## Q1: What is Temperature in LLMs?
**Answer:** Temperature controls the randomness of token generation.
**Explain simply:** Think of it like a creativity dial: 0 is strict and deterministic, 1 is creative and varied.
**Tags:** llm, sampling, generation

## 2. What is Top-P (nucleus sampling)?
**Answer:** Top-p sampling pools the smallest set of tokens whose cumulative probability exceeds p.
```python
logits = model(tokens)
probs = softmax(logits)
```
**Explain simply:** Instead of picking from the whole vocabulary, you only pick from the top plausible candidates.

## Q3: Missing explanation question
**Answer:** Direct answer only.
"""
    questions = parse_questions_markdown(sample_md)
    assert len(questions) == 3

    q1 = questions[0]
    assert q1["question"] == "What is Temperature in LLMs?"
    assert "randomness of token generation" in q1["answer"]
    assert "creativity dial" in q1["explanation"]
    assert q1["tags"] == ["llm", "sampling", "generation"]

    q2 = questions[1]
    assert q2["question"] == "What is Top-P (nucleus sampling)?"
    assert "```python" in q2["answer"]

    q3 = questions[2]
    assert q3["question"] == "Missing explanation question"
    assert q3["answer"] == "Direct answer only."
    # Defaults explanation to answer if not provided
    assert q3["explanation"] == "Direct answer only."


def test_agent3_next_numbering_and_gap_handling(tmp_path):
    storage = LocalStorage(tmp_path)
    agent3 = Agent3Numbering(storage)

    # Empty module manifest
    assert agent3.get_next_day_number("empty-mod") == 1

    # Manifest with days [1, 2, 4] (gap set)
    storage.put_json("modules/ai-mod/manifest.json", {
        "slug": "ai-mod",
        "title": "AI Module",
        "days": [
            {"number": 1, "title": "Day 1"},
            {"number": 2, "title": "Day 2"},
            {"number": 4, "title": "Day 4"},
        ],
        "labs": [
            {"id": "lab-01", "number": 1, "title": "Lab 1"},
            {"id": "lab-03", "number": 3, "title": "Lab 3"},
        ]
    })

    # Should propose max + 1 = 5
    assert agent3.get_next_day_number("ai-mod") == 5

    # Labs: max + 1 = 4 -> (4, 'lab-04')
    next_num, next_id = agent3.get_next_lab_number("ai-mod")
    assert next_num == 4
    assert next_id == "lab-04"


def test_agent3_duplicate_detection(tmp_path):
    storage = LocalStorage(tmp_path)
    agent3 = Agent3Numbering(storage)

    # Set up a day with a summary and transcript
    storage.put_json("modules/test-mod/manifest.json", {
        "slug": "test-mod",
        "days": [{"number": 1}],
        "labs": [],
    })
    storage.put_json("modules/test-mod/days/day-01/day.json", {
        "number": 1,
        "summary": {
            "path": "modules/test-mod/days/day-01/summary.docx",
            "format": "docx",
            "hash": "hash_abc12345",
        },
        "transcripts": [
            {
                "id": "t1",
                "title": "Morning Session",
                "file": {
                    "path": "modules/test-mod/days/day-01/t1.md",
                    "hash": "hash_def67890",
                }
            }
        ]
    })

    # Duplicate of summary
    dup = agent3.check_duplicate_hash("test-mod", "hash_abc12345")
    assert dup is not None
    assert "Summary of Day 1" in dup

    # Duplicate of transcript
    dup_t = agent3.check_duplicate_hash("test-mod", "hash_def67890")
    assert dup_t is not None
    assert "Morning Session" in dup_t

    # Unseen hash
    assert agent3.check_duplicate_hash("test-mod", "brand_new_hash") is None


def test_agent5_recompute_manifest_and_totals(tmp_path):
    storage = LocalStorage(tmp_path)
    publisher = Agent5Publisher(storage)

    # Seed root index, module manifest, and day details
    storage.put_json("index.json", {
        "version": "1",
        "updatedAt": "2026-11-01T00:00:00Z",
        "modules": [{"slug": "test-mod", "title": "Test Module"}]
    })

    storage.put_json("modules/test-mod/manifest.json", {
        "version": "1",
        "slug": "test-mod",
        "title": "Test Module",
        "updatedAt": "2026-11-01T00:00:00Z",
        "days": [{"number": 1, "title": "Day 1"}],
        "labs": [],
        "categories": ["hands-on"]
    })

    # Day with 1 summary, 2 transcripts, 3 questions, 1 board
    storage.put_json("modules/test-mod/days/day-01/day.json", {
        "number": 1,
        "title": "Day 1: Intro",
        "subtitle": "Getting Started",
        "summary": {"path": "summary.docx", "format": "docx", "hash": "h1"},
        "transcripts": [
            {"id": "t1", "title": "Part 1", "file": {"path": "t1.md"}},
            {"id": "t2", "title": "Part 2", "file": {"path": "t2.md"}},
        ],
        "links": [{"title": "Docs", "url": "https://example.com"}],
        "boards": [{"id": "b1", "image": {"path": "b1.webp"}}],
        "questions": [
            {"id": "q1", "question": "Q1", "answer": "A1"},
            {"id": "q2", "question": "Q2", "answer": "A2"},
            {"id": "q3", "question": "Q3", "answer": "A3"},
        ]
    })

    # Recompute manifest
    updated_manifest = publisher.recompute_manifest("test-mod")
    day_summary = updated_manifest["days"][0]
    assert day_summary["hasSummary"] is True
    assert day_summary["transcriptCount"] == 2
    assert day_summary["linkCount"] == 1
    assert day_summary["boardCount"] == 1
    assert day_summary["questionCount"] == 3

    # Recompute root index
    updated_index = publisher.recompute_root_index()
    mod_summary = updated_index["modules"][0]
    assert mod_summary["dayCount"] == 1
    assert mod_summary["transcriptCount"] == 2
    assert mod_summary["questionCount"] == 3
    assert mod_summary["boardCount"] == 1

