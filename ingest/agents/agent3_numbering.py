"""Agent 3: Numbering & Duplicate Detection (Read-Only)."""

from typing import Optional
from ingest.storage.base import StorageBackend


class Agent3Numbering:
    """
    Analyzes existing storage manifests to propose sequential numbers
    and detect duplicate content by hash across the module.
    """

    def __init__(self, storage: StorageBackend):
        self.storage = storage

    def get_next_day_number(self, module_slug: str) -> int:
        """Proposes the next sequential day number (non-contiguous days are also allowed)."""
        manifest, _ = self.storage.get_json(f"modules/{module_slug}/manifest.json")
        if not manifest or not isinstance(manifest, dict):
            return 1

        days = manifest.get("days", [])
        if not days:
            return 1

        existing_numbers = [d.get("number", 0) for d in days if isinstance(d, dict)]
        return max(existing_numbers, default=0) + 1

    def get_next_transcript_order(self, module_slug: str, day_number: int) -> int:
        """Proposes the next sequential transcript order number."""
        folder = f"day-{str(day_number).zfill(2)}"
        day_json, _ = self.storage.get_json(f"modules/{module_slug}/days/{folder}/day.json")
        if not day_json or not isinstance(day_json, dict):
            return 1

        transcripts = day_json.get("transcripts", [])
        if not transcripts:
            return 1

        orders = [t.get("order", 0) for t in transcripts if isinstance(t, dict)]
        return max(orders, default=0) + 1

    def get_next_board_number(self, module_slug: str, day_number: int) -> int:
        """Proposes the next sequential board index for a day."""
        folder = f"day-{str(day_number).zfill(2)}"
        day_json, _ = self.storage.get_json(f"modules/{module_slug}/days/{folder}/day.json")
        if not day_json or not isinstance(day_json, dict):
            return 1

        boards = day_json.get("boards", [])
        return len(boards) + 1

    def get_next_lab_number(self, module_slug: str) -> tuple[int, str]:
        """Proposes next lab number and default lab-id (e.g. 3, 'lab-03')."""
        manifest, _ = self.storage.get_json(f"modules/{module_slug}/manifest.json")
        if not manifest or not isinstance(manifest, dict):
            return 1, "lab-01"

        labs = manifest.get("labs", [])
        if not labs:
            return 1, "lab-01"

        numbers = [l.get("number", 0) for l in labs if isinstance(l, dict)]
        next_num = max(numbers, default=0) + 1
        next_id = f"lab-{str(next_num).zfill(2)}"
        return next_num, next_id

    def check_duplicate_hash(
        self,
        module_slug: str,
        content_hash: str,
        exclude_key: Optional[str] = None
    ) -> Optional[str]:
        """
        Scans all known files in the module to detect if the same content hash already exists.
        Returns a human-readable duplicate warning description if found, else None.
        """
        manifest, _ = self.storage.get_json(f"modules/{module_slug}/manifest.json")
        if not manifest or not isinstance(manifest, dict):
            return None

        # 1. Scan days
        for day_summary in manifest.get("days", []):
            d_num = day_summary.get("number")
            folder = f"day-{str(d_num).zfill(2)}"
            day_json, _ = self.storage.get_json(f"modules/{module_slug}/days/{folder}/day.json")
            if not day_json:
                continue

            # Check summary
            sum_ref = day_json.get("summary")
            if sum_ref and isinstance(sum_ref, dict):
                if sum_ref.get("hash") == content_hash and sum_ref.get("path") != exclude_key:
                    return f"Summary of Day {d_num} ({sum_ref.get('path')})"

            # Check transcripts
            for t in day_json.get("transcripts", []):
                t_ref = t.get("file", {})
                if t_ref.get("hash") == content_hash and t_ref.get("path") != exclude_key:
                    return f"Transcript '{t.get('title')}' (Day {d_num}, order {t.get('order')})"

            # Check board photos
            for b in day_json.get("boards", []):
                img_ref = b.get("image", {})
                if img_ref.get("hash") == content_hash and img_ref.get("path") != exclude_key:
                    return f"Class Board Photo '{b.get('caption', b.get('id'))}' (Day {d_num})"

        # 2. Scan labs
        for lab_summary in manifest.get("labs", []):
            lab_id = lab_summary.get("id")
            lab_json, _ = self.storage.get_json(f"modules/{module_slug}/labs/{lab_id}/lab.json")
            if not lab_json:
                continue

            notes_ref = lab_json.get("notes")
            if notes_ref and isinstance(notes_ref, dict):
                if notes_ref.get("hash") == content_hash and notes_ref.get("path") != exclude_key:
                    return f"Study notes of Lab {lab_id}"

            doodle_ref = lab_json.get("doodle")
            if doodle_ref and isinstance(doodle_ref, dict):
                if doodle_ref.get("hash") == content_hash and doodle_ref.get("path") != exclude_key:
                    return f"Architectural doodle of Lab {lab_id}"

        return None

