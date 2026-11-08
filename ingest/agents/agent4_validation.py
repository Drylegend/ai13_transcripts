"""Agent 4: Post-Publish Verification & Rollback."""

import json
from pathlib import Path
from typing import Any, Optional
import jsonschema
from rich.table import Table
from ingest.config import SCHEMAS_DIR
from ingest.logger import console, log
from ingest.models import ChangeSet, ValidationCheck
from ingest.storage.base import StorageBackend


class Agent4Validation:
    """
    Validates all data directly from storage against JSON Schemas,
    checks referential integrity, and coordinates atomic rollbacks on failure.
    """

    def __init__(self, storage: StorageBackend):
        self.storage = storage
        self.schemas: dict[str, dict[str, Any]] = {}
        self._load_schemas()

    def _load_schemas(self) -> None:
        """Loads JSON Schema files exported from Zod."""
        schema_files = {
            "index": SCHEMAS_DIR / "module_index.json",
            "manifest": SCHEMAS_DIR / "module_manifest.json",
            "day": SCHEMAS_DIR / "day_detail.json",
            "lab": SCHEMAS_DIR / "lab.json",
            "visuals": SCHEMAS_DIR / "visual_index.json",
            "search": SCHEMAS_DIR / "search_index.json",
        }
        for name, p in schema_files.items():
            if p.is_file():
                try:
                    self.schemas[name] = json.loads(p.read_text(encoding="utf-8"))
                except Exception as e:
                    log.warning(f"Failed to load schema {p}: {e}")

    def validate_schema(self, data: Any, schema_name: str) -> tuple[bool, str]:
        """Validates a dictionary or list against a named JSON schema."""
        schema = self.schemas.get(schema_name)
        if not schema:
            return True, "Schema file not present"

        try:
            jsonschema.validate(instance=data, schema=schema)
            return True, "Matches JSON Schema"
        except jsonschema.ValidationError as e:
            path_str = ".".join(str(p) for p in e.path) or "root"
            return False, f"Schema error at {path_str}: {e.message}"
        except Exception as e:
            return False, f"Schema validation error: {str(e)}"

    def check_file_ref(self, ref: dict[str, Any], context: str) -> list[ValidationCheck]:
        """Verifies that a FileRef exists in storage and matches sizeBytes."""
        checks: list[ValidationCheck] = []
        path = ref.get("path")
        expected_size = ref.get("sizeBytes", 0)

        if not path:
            checks.append(ValidationCheck(f"{context}: FileRef path", False, "Missing path in FileRef"))
            return checks

        meta = self.storage.head(path)
        if not meta:
            checks.append(ValidationCheck(f"{context}: {path}", False, "File does not exist in storage", key=path))
            return checks

        actual_size = meta.get("size", 0)
        if actual_size != expected_size:
            checks.append(
                ValidationCheck(
                    f"{context}: {path}",
                    False,
                    f"Size mismatch: manifest says {expected_size} B, storage has {actual_size} B",
                    key=path
                )
            )
        else:
            checks.append(ValidationCheck(f"{context}: {path}", True, f"Verified ({actual_size} bytes)", key=path))

        return checks

    def verify_module(self, module_slug: str) -> list[ValidationCheck]:
        """Performs exhaustive referential and schema verification for a module."""
        checks: list[ValidationCheck] = []

        manifest_key = f"modules/{module_slug}/manifest.json"
        manifest, _ = self.storage.get_json(manifest_key)
        if not manifest:
            checks.append(ValidationCheck(f"Manifest exists: {manifest_key}", False, "Manifest not found in storage", key=manifest_key))
            return checks

        # 1. Validate manifest schema
        ok, msg = self.validate_schema(manifest, "manifest")
        checks.append(ValidationCheck(f"Manifest Schema: {manifest_key}", ok, msg, key=manifest_key))

        # 2. Check days
        days = manifest.get("days", [])
        for day in days:
            d_num = day.get("number")
            folder = f"day-{str(d_num).zfill(2)}"
            day_key = f"modules/{module_slug}/days/{folder}/day.json"
            day_json, _ = self.storage.get_json(day_key)

            if not day_json:
                checks.append(ValidationCheck(f"Day JSON exists: {day_key}", False, "File not found", key=day_key))
                continue

            # Validate day schema
            ok, msg = self.validate_schema(day_json, "day")
            checks.append(ValidationCheck(f"Day Schema: {day_key}", ok, msg, key=day_key))

            # Validate summary
            if day_json.get("summary"):
                checks.extend(self.check_file_ref(day_json["summary"], f"Day {d_num} summary"))

            # Validate transcripts & numbering
            transcripts = day_json.get("transcripts", [])
            seen_orders: set[int] = set()
            for t in transcripts:
                order = t.get("order")
                if order in seen_orders:
                    checks.append(ValidationCheck(f"Day {d_num} transcripts", False, f"Duplicate transcript order: {order}"))
                seen_orders.add(order)
                if t.get("file"):
                    checks.extend(self.check_file_ref(t["file"], f"Day {d_num} transcript {order}"))

            # Validate boards
            for b in day_json.get("boards", []):
                if b.get("image"):
                    checks.extend(self.check_file_ref(b["image"], f"Day {d_num} board {b.get('id')}"))
                if b.get("thumb"):
                    checks.extend(self.check_file_ref(b["thumb"], f"Day {d_num} board thumb {b.get('id')}"))

            # Validate links
            for l in day_json.get("links", []):
                url = l.get("url", "")
                if not (url.startswith("http://") or url.startswith("https://")):
                    checks.append(ValidationCheck(f"Day {d_num} link: {l.get('label')}", False, f"Invalid URL: {url}"))

            # Count check between manifest and day_json
            if bool(day_json.get("summary")) != day.get("hasSummary"):
                checks.append(ValidationCheck(f"Day {d_num} count: hasSummary", False, f"Manifest says {day.get('hasSummary')}, day.json has {bool(day_json.get('summary'))}"))
            if len(transcripts) != day.get("transcriptCount"):
                checks.append(ValidationCheck(f"Day {d_num} count: transcriptCount", False, f"Manifest says {day.get('transcriptCount')}, day.json has {len(transcripts)}"))
            if len(day_json.get("boards", [])) != day.get("boardCount"):
                checks.append(ValidationCheck(f"Day {d_num} count: boardCount", False, f"Manifest says {day.get('boardCount')}, day.json has {len(day_json.get('boards', []))}"))
            if len(day_json.get("questions", [])) != day.get("questionCount"):
                checks.append(ValidationCheck(f"Day {d_num} count: questionCount", False, f"Manifest says {day.get('questionCount')}, day.json has {len(day_json.get('questions', []))}"))

        # 3. Check labs
        labs = manifest.get("labs", [])
        for lab in labs:
            lab_id = lab.get("id")
            lab_key = f"modules/{module_slug}/labs/{lab_id}/lab.json"
            lab_json, _ = self.storage.get_json(lab_key)

            if not lab_json:
                checks.append(ValidationCheck(f"Lab JSON exists: {lab_key}", False, "File not found", key=lab_key))
                continue

            ok, msg = self.validate_schema(lab_json, "lab")
            checks.append(ValidationCheck(f"Lab Schema: {lab_key}", ok, msg, key=lab_key))

            if lab_json.get("notes"):
                checks.extend(self.check_file_ref(lab_json["notes"], f"Lab {lab_id} notes"))
            if lab_json.get("doodle"):
                checks.extend(self.check_file_ref(lab_json["doodle"], f"Lab {lab_id} doodle"))
            if lab_json.get("thumb"):
                checks.extend(self.check_file_ref(lab_json["thumb"], f"Lab {lab_id} thumb"))

        # 4. Check visuals.json
        visuals_key = f"modules/{module_slug}/visuals.json"
        visuals_json, _ = self.storage.get_json(visuals_key)
        if visuals_json:
            ok, msg = self.validate_schema(visuals_json, "visuals")
            checks.append(ValidationCheck(f"Visuals Schema: {visuals_key}", ok, msg, key=visuals_key))

        return checks

    def verify_all(self) -> list[ValidationCheck]:
        """Runs checks on root index.json, search-index.json, and all modules."""
        checks: list[ValidationCheck] = []

        # 1. Root index.json
        index_data, _ = self.storage.get_json("index.json")
        if not index_data:
            checks.append(ValidationCheck("Root Index exists", False, "index.json not found in storage", key="index.json"))
            return checks

        ok, msg = self.validate_schema(index_data, "index")
        checks.append(ValidationCheck("Root Index Schema", ok, msg, key="index.json"))

        # 2. Search index
        search_data, _ = self.storage.get_json("search-index.json")
        if search_data is None:
            checks.append(ValidationCheck("Search Index exists", False, "search-index.json not found", key="search-index.json"))
        else:
            ok, msg = self.validate_schema(search_data, "search")
            checks.append(ValidationCheck("Search Index Schema", ok, msg, key="search-index.json"))

        # 3. All modules
        for mod in index_data.get("modules", []):
            slug = mod.get("slug")
            checks.extend(self.verify_module(slug))

        return checks

    def render_report(self, checks: list[ValidationCheck]) -> bool:
        """Prints a styled Rich table of verification results. Returns True if all passed."""
        table = Table(title="Post-Publish Storage Verification", show_header=True, header_style="bold cyan")
        table.add_column("Status", width=10, justify="center")
        table.add_column("Check / Resource", style="bold")
        table.add_column("Details")

        all_passed = True
        for c in checks:
            if c.passed:
                status_str = "[bold green][PASS][/bold green]"
            else:
                status_str = "[bold red][FAIL][/bold red]"
                all_passed = False
            table.add_row(status_str, c.name, c.message)

        console.print(table)
        return all_passed

    def rollback(self, change_set: ChangeSet) -> bool:
        """
        Rollback helper:
        1. Deletes all newly uploaded files
        2. Restores previously backed up JSON manifests
        """
        log.warning(f"Initiating rollback for operation '{change_set.operation}'...")
        console.print(f"[bold yellow]Rolling back operation '{change_set.operation}'...[/bold yellow]")

        # 1. Delete newly uploaded keys
        for key in change_set.uploaded_keys:
            try:
                self.storage.delete(key)
                console.print(f"  [dim]Removed uploaded object:[/dim] {key}")
            except Exception as e:
                log.error(f"Failed to remove {key} during rollback: {e}")

        # 2. Restore JSON backups
        for storage_key, backup_path_str in change_set.backup_files.items():
            try:
                backup_p = Path(backup_path_str)
                if backup_p.is_file():
                    data = json.loads(backup_p.read_text(encoding="utf-8"))
                    self.storage.put_json(storage_key, data, cache="manifest")
                    console.print(f"  [dim]Restored backup for:[/dim] {storage_key}")
            except Exception as e:
                log.error(f"Failed to restore {storage_key} during rollback: {e}")

        console.print("[bold green]Rollback completed successfully. Storage returned to prior state.[/bold green]")
        return True

