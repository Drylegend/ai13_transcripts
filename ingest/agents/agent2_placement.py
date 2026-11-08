"""Agent 2: Placement, Metadata & Upload Coordination."""

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

from ingest.config import BACKUP_DIR, get_content_type
from ingest.logger import log
from ingest.models import ChangeSet, StagedItem
from ingest.storage.base import StorageBackend


def slugify(text: str) -> str:
    """Converts a title or name to lowercase kebab-case slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-")


def parse_questions_markdown(content: str) -> list[dict[str, Any]]:
    """
    Parses questions from standardized Markdown format:
    ## Q1: Question text
    **Answer:** Short direct answer
    **Explain simply:** Detailed plain-language explanation
    **Tags:** Tag1, Tag2
    """
    questions: list[dict[str, Any]] = []
    # Split by ## headers
    blocks = re.split(r"(?m)^##\s+", content)

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        lines = block.split("\n")
        first_line = lines[0].strip()

        # Remove optional Q1: or 1. prefix
        q_text = re.sub(r"^(?:Q\d+[:.]?|\d+[:.]?)\s*", "", first_line).strip()
        if not q_text:
            continue

        rest = "\n".join(lines[1:])

        ans_match = re.search(r"\*\*Answer:\*\*\s*(.+?)(?=(?:\*\*Explain simply:\*\*|\*\*Tags:\*\*|\Z))", rest, re.DOTALL | re.IGNORECASE)
        exp_match = re.search(r"\*\*Explain simply:\*\*\s*(.+?)(?=(?:\*\*Tags:\*\*|\Z))", rest, re.DOTALL | re.IGNORECASE)
        tags_match = re.search(r"\*\*Tags:\*\*\s*(.+)$", rest, re.MULTILINE | re.IGNORECASE)

        answer = ans_match.group(1).strip() if ans_match else ""
        explanation = exp_match.group(1).strip() if exp_match else answer
        tags: list[str] = []
        if tags_match:
            tags = [t.strip() for t in tags_match.group(1).split(",") if t.strip()]

        q_id = f"q-{slugify(q_text)[:40]}"

        questions.append({
            "id": q_id,
            "question": q_text,
            "answer": answer,
            "explanation": explanation,
            "tags": tags,
        })

    return questions


class Agent2Placement:
    """
    Handles destination key generation, overwrite checks, JSON backups,
    and safe atomic uploads.
    """

    def __init__(self, storage: StorageBackend):
        self.storage = storage

    def validate_url(self, url: str) -> str:
        """Validates that a URL starts with http:// or https://."""
        clean = url.strip()
        parsed = urlparse(clean)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            raise ValueError(f"Invalid URL '{url}'. Must start with http:// or https:// and have a domain.")
        return clean

    def create_backup_dir(self) -> Path:
        """Creates a timestamped backup directory under .ingest_backups/."""
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")[:19]
        backup_dir = BACKUP_DIR / ts
        backup_dir.mkdir(parents=True, exist_ok=True)
        return backup_dir

    def backup_json_file(self, key: str, backup_dir: Path) -> Optional[Path]:
        """Downloads the existing version of a JSON file and saves a local backup."""
        data, _ = self.storage.get_json(key)
        if data is None:
            return None

        local_backup = backup_dir / key.replace("/", "__")
        local_backup.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        return local_backup

    def check_overwrite(self, key: str) -> Optional[dict[str, Any]]:
        """Returns existing file metadata if key exists, else None."""
        return self.storage.head(key)

    # ── Canonical Key Builders ──
    @staticmethod
    def day_folder(day_number: int) -> str:
        return f"day-{str(day_number).zfill(2)}"

    @staticmethod
    def summary_key(module_slug: str, day_number: int, ext: str) -> str:
        folder = Agent2Placement.day_folder(day_number)
        return f"modules/{module_slug}/days/{folder}/summary.{ext}"

    @staticmethod
    def transcript_key(module_slug: str, day_number: int, order: int, ext: str) -> str:
        folder = Agent2Placement.day_folder(day_number)
        return f"modules/{module_slug}/days/{folder}/transcripts/transcript-{order}.{ext}"

    @staticmethod
    def board_key(module_slug: str, day_number: int, index: int, is_thumb: bool = False) -> str:
        folder = Agent2Placement.day_folder(day_number)
        if is_thumb:
            return f"modules/{module_slug}/days/{folder}/boards/thumbs/board-{index}.webp"
        return f"modules/{module_slug}/days/{folder}/boards/board-{index}.webp"

    @staticmethod
    def lab_notes_key(module_slug: str, lab_id: str, ext: str) -> str:
        return f"modules/{module_slug}/labs/{lab_id}/notes.{ext}"

    @staticmethod
    def lab_doodle_key(module_slug: str, lab_id: str, is_thumb: bool = False, ext: str = "webp") -> str:
        if is_thumb:
            return f"modules/{module_slug}/labs/{lab_id}/thumbs/doodle.{ext}"
        return f"modules/{module_slug}/labs/{lab_id}/doodle.{ext}"

