"""Interactive Wizard and Maintenance CLI Commands for Ingest Tool."""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import questionary
from rich.panel import Panel
from rich.table import Table
from rich.tree import Tree

from ingest.agents.agent1_normalize import Agent1Normalize
from ingest.agents.agent2_placement import Agent2Placement, parse_questions_markdown, slugify
from ingest.agents.agent3_numbering import Agent3Numbering
from ingest.agents.agent4_validation import Agent4Validation
from ingest.agents.agent5_publisher import Agent5Publisher
from ingest.config import (
    BACKUP_DIR,
    DEV_CONTENT_DIR,
    ROOT_DIR,
    get_content_type,
)
from ingest.dialogs import pick_single_file
from ingest.logger import console, log
from ingest.models import ChangeSet, FileRef, OperationPlan, OperationType
from ingest.storage.base import StorageBackend
from ingest.storage.local import LocalStorage
from ingest.storage.r2 import R2Storage


def get_storage(target: str, root_dir: Optional[str] = None) -> StorageBackend:
    """Instantiates the appropriate storage backend based on CLI target flag."""
    if target == "local":
        path = Path(root_dir) if root_dir else DEV_CONTENT_DIR
        return LocalStorage(path)
    elif target == "r2":
        return R2Storage()
    else:
        raise ValueError(f"Unknown storage target: '{target}'. Use 'r2' or 'local'.")


class IngestCLI:
    def __init__(self, storage: StorageBackend, dry_run: bool = False, auto_yes: bool = False):
        self.storage = storage
        self.dry_run = dry_run
        self.auto_yes = auto_yes
        self.agent1 = Agent1Normalize()
        self.agent2 = Agent2Placement(storage)
        self.agent3 = Agent3Numbering(storage)
        self.agent4 = Agent4Validation(storage)
        self.agent5 = Agent5Publisher(storage)

    def select_module(self) -> Optional[str]:
        """Prompts user to select from existing modules in index.json."""
        index_data, _ = self.storage.get_json("index.json")
        modules = index_data.get("modules", []) if index_data else []

        if not modules:
            console.print("[yellow]No modules found in storage. Please create a module first.[/yellow]")
            return None

        choices = [f"{m['title']} ({m['slug']})" for m in modules]
        choice = questionary.select("Select module:", choices=choices).ask()
        if not choice:
            return None

        # Extract slug inside parentheses
        slug = choice.split("(")[-1].strip(")")
        return slug

    def select_day(self, module_slug: str) -> Optional[int]:
        """Prompts user to select a day from the module manifest."""
        manifest, _ = self.storage.get_json(f"modules/{module_slug}/manifest.json")
        if not manifest or not manifest.get("days"):
            console.print("[yellow]No days found in this module. Please create a day first.[/yellow]")
            return None

        days = manifest.get("days", [])
        choices = [f"Day {d['number']}: {d.get('title', '')}" for d in days]
        choice = questionary.select("Select course day:", choices=choices).ask()
        if not choice:
            return None

        day_num = int(choice.split(":")[0].replace("Day", "").strip())
        return day_num

    def select_lab(self, module_slug: str) -> Optional[str]:
        """Prompts user to select a lab from the module manifest."""
        manifest, _ = self.storage.get_json(f"modules/{module_slug}/manifest.json")
        if not manifest or not manifest.get("labs"):
            console.print("[yellow]No labs found in this module. Please create a lab first.[/yellow]")
            return None

        labs = manifest.get("labs", [])
        choices = [f"Lab {l['number']}: {l.get('title', '')} ({l['id']})" for l in labs]
        choice = questionary.select("Select lab:", choices=choices).ask()
        if not choice:
            return None

        lab_id = choice.split("(")[-1].strip(")")
        return lab_id

    # ── Wizard Actions ──

    def action_init(self, silent: bool = False) -> bool:
        """Initializes empty bootstrap files in the chosen target (index.json and search-index.json)."""
        if not silent:
            console.print(Panel("[bold]Initialize Content Repository Bootstrap Files[/bold]", style="cyan"))

        index_data, _ = self.storage.get_json("index.json")

        if index_data is not None and not self.auto_yes and not silent:
            if not questionary.confirm("index.json already exists in target storage. Re-initialize to empty slate?").ask():
                console.print("[yellow]Initialization cancelled.[/yellow]")
                return False

        if self.dry_run:
            console.print("[yellow]Dry-run mode: would create index.json ({version: 1, modules: []}) and search-index.json ([]).[/yellow]")
            return True

        now_iso = datetime.now(timezone.utc).isoformat()
        empty_index = {
            "version": "1",
            "updatedAt": now_iso,
            "modules": [],
        }
        empty_search: list[dict] = []

        self.storage.put_json("index.json", empty_index, cache="manifest")
        self.storage.put_json("search-index.json", empty_search, cache="manifest")
        if not silent:
            console.print("[bold green]Successfully initialized repository bootstrap files: index.json and search-index.json[/bold green]")
        return True

    def action_create_module(
        self,
        title: Optional[str] = None,
        slug: Optional[str] = None,
        subtitle: Optional[str] = None,
        description: Optional[str] = None,
        course_code: Optional[str] = None,
    ) -> bool:
        console.print(Panel("[bold]Create a New Course Module[/bold]", style="cyan"))
        if title:
            slug = slug or slugify(title)
            subtitle = subtitle or ""
            description = description or ""
            course_code = course_code or ""
        else:
            title = questionary.text("Module Title:").ask()
            if not title: return False

            default_slug = slugify(title)
            slug = questionary.text("Module Slug (kebab-case):", default=default_slug).ask()
            if not slug: return False
            slug = slugify(slug)

            subtitle = questionary.text("Subtitle:", default="").ask() or ""
            description = questionary.text("Description:", default="").ask() or ""
            course_code = questionary.text("Course Code (e.g. AI-300):", default="").ask() or ""

        # Check if already exists
        index_data, _ = self.storage.get_json("index.json")
        if index_data:
            existing = [m.get("slug") for m in index_data.get("modules", [])]
            if slug in existing:
                console.print(f"[bold red]Module with slug '{slug}' already exists![/bold red]")
                return False

        console.print("\n[bold]Plan:[/bold]")
        console.print(f"  • Create manifest: [cyan]modules/{slug}/manifest.json[/cyan]")
        console.print(f"  • Create visuals:  [cyan]modules/{slug}/visuals.json[/cyan]")
        console.print("  • Update index:    [cyan]index.json[/cyan]")

        if not self.auto_yes and not questionary.confirm("Execute creation?").ask():
            return False

        if self.dry_run:
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return True

        now_iso = datetime.now(timezone.utc).isoformat()
        manifest_data = {
            "version": "1",
            "updatedAt": now_iso,
            "slug": slug,
            "title": title,
            "subtitle": subtitle,
            "description": description,
            "courseCode": course_code,
            "days": [],
            "labs": [],
            "labCategories": [{"slug": "hands-on", "label": "Hands-On Labs"}],
        }
        self.storage.put_json(f"modules/{slug}/manifest.json", manifest_data, cache="manifest")
        self.storage.put_json(f"modules/{slug}/visuals.json", {"version": "1", "updatedAt": now_iso, "items": []}, cache="manifest")

        # Add to index
        if not index_data:
            index_data = {"version": "1", "updatedAt": now_iso, "modules": []}

        order = len(index_data.get("modules", [])) + 1
        new_entry = {
            "slug": slug,
            "title": title,
            "subtitle": subtitle,
            "description": description,
            "order": order,
            "dayCount": 0,
            "labCount": 0,
            "boardCount": 0,
            "transcriptCount": 0,
            "questionCount": 0,
            "tags": [course_code] if course_code else ["AI-13"],
        }
        if course_code:
            new_entry["courseCode"] = course_code
        index_data["modules"].append(new_entry)
        self.storage.put_json("index.json", index_data, cache="manifest")
        self.agent5.recompute_search_index(slug)

        console.print(f"[bold green]Successfully created module '{title}' ({slug})![/bold green]")
        return True

    def action_create_day(self) -> None:
        console.print(Panel("[bold]Create a Course Day[/bold]", style="cyan"))
        slug = self.select_module()
        if not slug: return

        proposed_num = self.agent3.get_next_day_number(slug)
        day_str = questionary.text("Day Number:", default=str(proposed_num)).ask()
        if not day_str or not day_str.isdigit(): return
        day_num = int(day_str)

        # Check conflict
        manifest, _ = self.storage.get_json(f"modules/{slug}/manifest.json")
        existing_days = [d.get("number") for d in manifest.get("days", [])] if manifest else []
        if day_num in existing_days:
            if not questionary.confirm(f"Day {day_num} already exists in this module. Update its meta?").ask():
                return

        title = questionary.text("Day Title:", default=f"Day {day_num}").ask() or f"Day {day_num}"
        subtitle = questionary.text("Subtitle:", default="").ask() or ""
        description = questionary.text("Description:", default="").ask() or ""
        recap = questionary.text("In a nutshell / class recap:", default="").ask() or ""

        folder = Agent2Placement.day_folder(day_num)
        day_json_key = f"modules/{slug}/days/{folder}/day.json"

        console.print("\n[bold]Plan:[/bold]")
        console.print(f"  • Initialize: [cyan]{day_json_key}[/cyan]")
        console.print(f"  • Update manifest: [cyan]modules/{slug}/manifest.json[/cyan]")

        if not self.auto_yes and not questionary.confirm("Execute creation?").ask():
            return

        if self.dry_run:
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return

        # Read existing or initialize
        existing_day_json, _ = self.storage.get_json(day_json_key)
        day_data = existing_day_json or {
            "number": day_num,
            "title": title,
            "subtitle": subtitle,
            "description": description,
            "recap": recap,
            "transcripts": [],
            "links": [],
            "boards": [],
            "questions": [],
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        day_data["title"] = title
        day_data["subtitle"] = subtitle
        day_data["description"] = description
        if recap: day_data["recap"] = recap
        day_data["updatedAt"] = datetime.now(timezone.utc).isoformat()

        self.storage.put_json(day_json_key, day_data, cache="manifest")

        # Update manifest
        if manifest:
            day_entry = next((d for d in manifest.get("days", []) if d.get("number") == day_num), None)
            if not day_entry:
                manifest["days"].append({
                    "number": day_num,
                    "title": title,
                    "subtitle": subtitle,
                    "hasSummary": bool(day_data.get("summary")),
                    "transcriptCount": len(day_data.get("transcripts", [])),
                    "linkCount": len(day_data.get("links", [])),
                    "boardCount": len(day_data.get("boards", [])),
                    "questionCount": len(day_data.get("questions", [])),
                })
                self.storage.put_json(f"modules/{slug}/manifest.json", manifest, cache="manifest")

        self.agent5.recompute_manifest(slug)
        self.agent5.recompute_root_index()
        self.agent5.recompute_search_index(slug)

        console.print(f"[bold green]Successfully created/updated Day {day_num} in '{slug}'![/bold green]")

    def action_add_summary(
        self,
        module_slug: Optional[str] = None,
        day_number: Optional[int] = None,
        file_path_override: Optional[str] = None,
    ) -> None:
        console.print(Panel("[bold]Add or Replace Day Summary[/bold]", style="cyan"))
        slug = module_slug or self.select_module()
        if not slug: return
        day_num = day_number if day_number is not None else self.select_day(slug)
        if day_num is None: return

        # Single file picker
        file_path = file_path_override or pick_single_file("Select Day Summary (.docx, .md, .html, .pdf)")
        staged = self.agent1.process(file_path)

        dest_key = Agent2Placement.summary_key(slug, day_num, staged.format)
        overwrite_info = self.agent2.check_overwrite(dest_key)

        console.print("\n[bold]Plan:[/bold]")
        if overwrite_info:
            console.print(f"  [yellow]OVERWRITE:[/yellow] [cyan]{dest_key}[/cyan] (Existing: {overwrite_info['size']} bytes -> New: {staged.size_bytes} bytes)")
        else:
            console.print(f"  [green]UPLOAD:[/green] [cyan]{dest_key}[/cyan] ({staged.size_bytes} bytes, hash: {staged.sha256_short})")

        # Check duplicate
        dup = self.agent3.check_duplicate_hash(slug, staged.sha256_short, exclude_key=dest_key)
        if dup:
            console.print(f"[bold yellow]Warning: Content hash matches {dup}![/bold yellow]")
            if not questionary.confirm("This file appears identical to existing content. Proceed anyway?").ask():
                return

        if overwrite_info:
            console.print(f"[bold yellow]File already exists on storage ({dest_key}).[/bold yellow]")
            if not questionary.confirm("Are you sure you want to OVERWRITE this existing file?").ask():
                self.agent1.cleanup()
                return
        elif not self.auto_yes and not questionary.confirm("Upload summary?").ask():
            self.agent1.cleanup()
            return

        if self.dry_run:
            self.agent1.cleanup()
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return

        # Backup & Write
        backup_dir = self.agent2.create_backup_dir()
        folder = Agent2Placement.day_folder(day_num)
        day_key = f"modules/{slug}/days/{folder}/day.json"
        b_day = self.agent2.backup_json_file(day_key, backup_dir)
        b_man = self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)

        change_set = ChangeSet(
            timestamp=datetime.now(timezone.utc).isoformat(),
            operation="add_summary",
            module_slug=slug,
            backup_files={k: str(v) for k, v in [(day_key, b_day), (f"modules/{slug}/manifest.json", b_man)] if v},
        )

        try:
            self.storage.put_file(dest_key, staged.staged_file, get_content_type(dest_key), cache="immutable")
            change_set.uploaded_keys.append(dest_key)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "add_summary", "uploaded_keys": change_set.uploaded_keys}),
                encoding="utf-8"
            )

            # Update day.json
            day_json, _ = self.storage.get_json(day_key)
            if not day_json:
                day_json = {"number": day_num, "title": f"Day {day_num}", "updatedAt": datetime.now(timezone.utc).isoformat()}

            day_json["summary"] = {
                "path": dest_key,
                "format": staged.format,
                "sizeBytes": staged.size_bytes,
                "hash": staged.sha256_short,
                "updatedAt": staged.updated_at,
            }
            day_json["updatedAt"] = staged.updated_at
            self.storage.put_json(day_key, day_json, cache="manifest")

            # Republish derived manifests
            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_root_index()
            self.agent5.recompute_search_index(slug)

            # Verify
            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            if not passed:
                if questionary.confirm("Validation failed! Roll back changes?").ask():
                    self.agent4.rollback(change_set)
                    return

            console.print(f"[bold green]Summary successfully uploaded to Day {day_num}![/bold green]")
        finally:
            self.agent1.cleanup()

    def action_add_transcript(self) -> None:
        console.print(Panel("[bold]Add a Transcript[/bold]", style="cyan"))
        slug = self.select_module()
        if not slug: return
        day_num = self.select_day(slug)
        if day_num is None: return

        proposed_order = self.agent3.get_next_transcript_order(slug, day_num)
        order_str = questionary.text("Transcript Order:", default=str(proposed_order)).ask()
        if not order_str or not order_str.isdigit(): return
        order = int(order_str)

        title = questionary.text("Transcript Title (e.g. Morning Session):", default=f"Transcript {order}").ask()
        if not title: return

        file_path = pick_single_file("Select Transcript Document (.docx, .md, .txt)")
        staged = self.agent1.process(file_path)

        dest_key = Agent2Placement.transcript_key(slug, day_num, order, staged.format)
        overwrite_info = self.agent2.check_overwrite(dest_key)

        console.print("\n[bold]Plan:[/bold]")
        if overwrite_info:
            console.print(f"  [yellow]OVERWRITE:[/yellow] [cyan]{dest_key}[/cyan] ({overwrite_info['size']} B -> {staged.size_bytes} B)")
        else:
            console.print(f"  [green]UPLOAD:[/green] [cyan]{dest_key}[/cyan] ({staged.size_bytes} bytes, hash: {staged.sha256_short})")

        dup = self.agent3.check_duplicate_hash(slug, staged.sha256_short, exclude_key=dest_key)
        if dup:
            console.print(f"[bold yellow]Warning: Content hash matches {dup}![/bold yellow]")
            if not questionary.confirm("This file appears identical to existing content. Proceed anyway?").ask():
                return

        if overwrite_info:
            console.print(f"[bold yellow]File already exists on storage ({dest_key}).[/bold yellow]")
            if not questionary.confirm("Are you sure you want to OVERWRITE this existing transcript?").ask():
                self.agent1.cleanup()
                return
        elif not self.auto_yes and not questionary.confirm("Upload transcript?").ask():
            self.agent1.cleanup()
            return

        if self.dry_run:
            self.agent1.cleanup()
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return

        backup_dir = self.agent2.create_backup_dir()
        folder = Agent2Placement.day_folder(day_num)
        day_key = f"modules/{slug}/days/{folder}/day.json"
        b_day = self.agent2.backup_json_file(day_key, backup_dir)
        b_man = self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)

        change_set = ChangeSet(
            timestamp=datetime.now(timezone.utc).isoformat(),
            operation="add_transcript",
            module_slug=slug,
            backup_files={k: str(v) for k, v in [(day_key, b_day), (f"modules/{slug}/manifest.json", b_man)] if v},
        )

        try:
            self.storage.put_file(dest_key, staged.staged_file, get_content_type(dest_key), cache="immutable")
            change_set.uploaded_keys.append(dest_key)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "add_transcript", "uploaded_keys": change_set.uploaded_keys}),
                encoding="utf-8"
            )

            day_json, _ = self.storage.get_json(day_key)
            if not day_json:
                day_json = {"number": day_num, "title": f"Day {day_num}", "transcripts": []}

            transcripts = day_json.get("transcripts", [])
            # Replace existing order or append
            t_item = {
                "id": f"t-{order}",
                "order": order,
                "title": title,
                "file": {
                    "path": dest_key,
                    "format": staged.format,
                    "sizeBytes": staged.size_bytes,
                    "hash": staged.sha256_short,
                    "updatedAt": staged.updated_at,
                },
            }
            existing_idx = next((i for i, t in enumerate(transcripts) if t.get("order") == order), None)
            if existing_idx is not None:
                transcripts[existing_idx] = t_item
            else:
                transcripts.append(t_item)

            day_json["transcripts"] = sorted(transcripts, key=lambda x: x.get("order", 0))
            day_json["updatedAt"] = staged.updated_at
            self.storage.put_json(day_key, day_json, cache="manifest")

            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_root_index()
            self.agent5.recompute_search_index(slug)

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            if not passed:
                if questionary.confirm("Validation failed! Roll back?").ask():
                    self.agent4.rollback(change_set)
                    return

            console.print(f"[bold green]Transcript {order} ('{title}') successfully added to Day {day_num}![/bold green]")
        finally:
            self.agent1.cleanup()

    def action_add_board_photo(self) -> None:
        console.print(Panel("[bold]Add Class Board Photo[/bold]", style="cyan"))
        slug = self.select_module()
        if not slug: return
        day_num = self.select_day(slug)
        if day_num is None: return

        proposed_idx = self.agent3.get_next_board_number(slug, day_num)
        caption = questionary.text("Board Photo Caption / Topic:", default=f"Board Work {proposed_idx}").ask() or ""

        file_path = pick_single_file("Select Board Photo (JPG, PNG, WebP, HEIC)")
        staged = self.agent1.process(file_path)

        dest_img_key = Agent2Placement.board_key(slug, day_num, proposed_idx, is_thumb=False)
        dest_thumb_key = Agent2Placement.board_key(slug, day_num, proposed_idx, is_thumb=True)

        console.print("\n[bold]Plan:[/bold]")
        console.print(f"  • Full image (WebP): [cyan]{dest_img_key}[/cyan] ({staged.width}x{staged.height}, {staged.size_bytes} B, EXIF stripped)")
        console.print(f"  • Thumbnail (WebP):  [cyan]{dest_thumb_key}[/cyan] ({staged.thumb_width}x{staged.thumb_height})")

        dup = self.agent3.check_duplicate_hash(slug, staged.sha256_short)
        if dup:
            console.print(f"[bold yellow]Warning: Image content hash matches {dup}![/bold yellow]")
            if not questionary.confirm("This photo appears identical to existing content. Proceed anyway?").ask():
                return

        if not self.auto_yes and not questionary.confirm("Upload board photo?").ask():
            self.agent1.cleanup()
            return

        if self.dry_run:
            self.agent1.cleanup()
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return

        backup_dir = self.agent2.create_backup_dir()
        folder = Agent2Placement.day_folder(day_num)
        day_key = f"modules/{slug}/days/{folder}/day.json"
        b_day = self.agent2.backup_json_file(day_key, backup_dir)
        b_man = self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)
        b_vis = self.agent2.backup_json_file(f"modules/{slug}/visuals.json", backup_dir)

        change_set = ChangeSet(
            timestamp=datetime.now(timezone.utc).isoformat(),
            operation="add_board_photo",
            module_slug=slug,
            backup_files={k: str(v) for k, v in [(day_key, b_day), (f"modules/{slug}/manifest.json", b_man), (f"modules/{slug}/visuals.json", b_vis)] if v},
        )

        try:
            self.storage.put_file(dest_img_key, staged.staged_file, "image/webp", cache="immutable")
            change_set.uploaded_keys.append(dest_img_key)

            thumb_ref = None
            if staged.staged_thumb:
                self.storage.put_file(dest_thumb_key, staged.staged_thumb, "image/webp", cache="immutable")
                change_set.uploaded_keys.append(dest_thumb_key)
                thumb_ref = {
                    "path": dest_thumb_key,
                    "format": "webp",
                    "sizeBytes": staged.staged_thumb.stat().st_size,
                    "hash": self.agent1._calc_hash(staged.staged_thumb),
                    "updatedAt": staged.updated_at,
                }

            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "add_board_photo", "uploaded_keys": change_set.uploaded_keys}),
                encoding="utf-8"
            )

            day_json, _ = self.storage.get_json(day_key)
            if not day_json:
                day_json = {"number": day_num, "title": f"Day {day_num}", "boards": []}

            boards = day_json.get("boards", [])
            boards.append({
                "id": f"b-{proposed_idx}",
                "caption": caption,
                "width": staged.width or 800,
                "height": staged.height or 450,
                "image": {
                    "path": dest_img_key,
                    "format": "webp",
                    "sizeBytes": staged.size_bytes,
                    "hash": staged.sha256_short,
                    "updatedAt": staged.updated_at,
                },
                "thumb": thumb_ref,
            })
            day_json["boards"] = boards
            day_json["updatedAt"] = staged.updated_at
            self.storage.put_json(day_key, day_json, cache="manifest")

            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_visuals_index(slug)
            self.agent5.recompute_root_index()

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            if not passed:
                if questionary.confirm("Validation failed! Roll back?").ask():
                    self.agent4.rollback(change_set)
                    return

            console.print(f"[bold green]Board photo successfully uploaded to Day {day_num}![/bold green]")
        finally:
            self.agent1.cleanup()

    def action_add_questions(self) -> None:
        console.print(Panel("[bold]Add Questions & Answers to a Day[/bold]", style="cyan"))
        slug = self.select_module()
        if not slug: return
        day_num = self.select_day(slug)
        if day_num is None: return

        mode = questionary.select(
            "Question Input Mode:",
            choices=[
                "Upload structured file (.md or .json)",
                "Add a single question interactively"
            ]
        ).ask()

        parsed_questions: list[dict[str, Any]] = []

        if mode.startswith("Upload"):
            file_path = pick_single_file("Select Questions File (.md or .json)")
            ext = file_path.suffix.lower()
            raw_text = file_path.read_text(encoding="utf-8")

            if ext == ".json":
                parsed_questions = json.loads(raw_text)
            else:
                parsed_questions = parse_questions_markdown(raw_text)

            if not parsed_questions:
                console.print("[red]No questions could be parsed from the selected file.[/red]")
                return
        else:
            q_text = questionary.text("Question:").ask()
            if not q_text: return
            answer = questionary.text("Direct Answer:").ask() or ""
            explanation = questionary.text("Explain Simply / Detailed Analogy:").ask() or answer
            tags_str = questionary.text("Tags (comma separated):", default="").ask() or ""
            tags = [t.strip() for t in tags_str.split(",") if t.strip()]

            parsed_questions = [{
                "id": f"q-{slugify(q_text)[:40]}",
                "question": q_text,
                "answer": answer,
                "explanation": explanation,
                "tags": tags,
            }]

        folder = Agent2Placement.day_folder(day_num)
        day_key = f"modules/{slug}/days/{folder}/day.json"

        console.print(f"\n[bold]Parsed {len(parsed_questions)} questions to merge into Day {day_num}.[/bold]")
        if not self.auto_yes and not questionary.confirm("Merge questions into day?").ask():
            return

        if self.dry_run:
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return

        backup_dir = self.agent2.create_backup_dir()
        b_day = self.agent2.backup_json_file(day_key, backup_dir)
        b_man = self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)

        change_set = ChangeSet(
            timestamp=datetime.now(timezone.utc).isoformat(),
            operation="add_questions",
            module_slug=slug,
            backup_files={k: str(v) for k, v in [(day_key, b_day), (f"modules/{slug}/manifest.json", b_man)] if v},
        )

        day_json, _ = self.storage.get_json(day_key)
        if not day_json:
            day_json = {"number": day_num, "title": f"Day {day_num}", "questions": []}

        existing_q = day_json.get("questions", [])
        existing_ids = {q.get("id"): idx for idx, q in enumerate(existing_q)}

        for new_q in parsed_questions:
            q_id = new_q.get("id")
            if q_id in existing_ids:
                existing_q[existing_ids[q_id]] = new_q
            else:
                existing_q.append(new_q)
                existing_ids[q_id] = len(existing_q) - 1

        day_json["questions"] = existing_q
        day_json["updatedAt"] = datetime.now(timezone.utc).isoformat()
        self.storage.put_json(day_key, day_json, cache="manifest")

        self.agent5.recompute_manifest(slug)
        self.agent5.recompute_root_index()
        self.agent5.recompute_search_index(slug)

        checks = self.agent4.verify_module(slug)
        passed = self.agent4.render_report(checks)
        if not passed:
            if questionary.confirm("Validation failed! Roll back?").ask():
                self.agent4.rollback(change_set)
                return

        console.print(f"[bold green]Successfully merged {len(parsed_questions)} questions into Day {day_num}![/bold green]")

    def action_add_link(self) -> None:
        console.print(Panel("[bold]Add External Resource Link to Day[/bold]", style="cyan"))
        slug = self.select_module()
        if not slug: return
        day_num = self.select_day(slug)
        if day_num is None: return

        url = questionary.text("URL (http/https):").ask()
        if not url: return
        url = self.agent2.validate_url(url)

        label = questionary.text("Link Label / Title:").ask()
        if not label: return
        description = questionary.text("Description (optional):", default="").ask() or ""

        folder = Agent2Placement.day_folder(day_num)
        day_key = f"modules/{slug}/days/{folder}/day.json"

        day_json, _ = self.storage.get_json(day_key)
        if not day_json:
            day_json = {"number": day_num, "title": f"Day {day_num}", "links": []}

        links = day_json.get("links", [])
        # Dedupe by URL
        links = [l for l in links if l.get("url") != url]
        links.append({
            "label": label,
            "url": url,
            "description": description,
        })
        day_json["links"] = links
        day_json["updatedAt"] = datetime.now(timezone.utc).isoformat()

        if self.dry_run:
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return

        self.storage.put_json(day_key, day_json, cache="manifest")
        self.agent5.recompute_manifest(slug)
        console.print(f"[bold green]Link '{label}' successfully added to Day {day_num}![/bold green]")

    def action_create_lab(self) -> None:
        console.print(Panel("[bold]Create a New Lab Exercise[/bold]", style="cyan"))
        slug = self.select_module()
        if not slug: return

        manifest, _ = self.storage.get_json(f"modules/{slug}/manifest.json")
        categories = manifest.get("labCategories", []) if manifest else []
        cat_choices = [c["slug"] for c in categories] or ["hands-on"]

        category = questionary.select("Lab Category:", choices=cat_choices).ask()
        if not category: return

        proposed_num, proposed_id = self.agent3.get_next_lab_number(slug)
        lab_id = questionary.text("Lab ID (e.g. lab-01):", default=proposed_id).ask()
        if not lab_id: return

        title = questionary.text("Lab Title:").ask()
        if not title: return

        source_url = questionary.text("Official Lab Guide URL (optional):", default="").ask() or None
        if source_url:
            source_url = self.agent2.validate_url(source_url)

        lab_key = f"modules/{slug}/labs/{lab_id}/lab.json"

        if self.dry_run:
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return

        now_iso = datetime.now(timezone.utc).isoformat()
        lab_data = {
            "id": lab_id,
            "number": proposed_num,
            "category": category,
            "title": title,
            "sourceUrl": source_url,
            "links": [],
            "updatedAt": now_iso,
        }
        self.storage.put_json(lab_key, lab_data, cache="manifest")

        # Update manifest
        if manifest:
            labs = manifest.get("labs", [])
            labs = [l for l in labs if l.get("id") != lab_id]
            labs.append({
                "id": lab_id,
                "number": proposed_num,
                "category": category,
                "title": title,
                "hasNotes": False,
                "hasDoodle": False,
            })
            manifest["labs"] = sorted(labs, key=lambda x: x.get("number", 0))
            self.storage.put_json(f"modules/{slug}/manifest.json", manifest, cache="manifest")

        self.agent5.recompute_manifest(slug)
        self.agent5.recompute_root_index()
        self.agent5.recompute_search_index(slug)

        console.print(f"[bold green]Successfully created Lab {lab_id} ('{title}')![/bold green]")

    def action_add_lab_notes(self) -> None:
        console.print(Panel("[bold]Add Ingested Notes to Lab[/bold]", style="cyan"))
        slug = self.select_module()
        if not slug: return
        lab_id = self.select_lab(slug)
        if not lab_id: return

        file_path = pick_single_file("Select Lab Notes (.docx, .md, .html)")
        staged = self.agent1.process(file_path)

        dest_key = Agent2Placement.lab_notes_key(slug, lab_id, staged.format)
        console.print(f"Destination: [cyan]{dest_key}[/cyan] ({staged.size_bytes} B)")

        if not self.auto_yes and not questionary.confirm("Upload notes?").ask():
            self.agent1.cleanup()
            return

        if self.dry_run:
            self.agent1.cleanup()
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return

        backup_dir = self.agent2.create_backup_dir()
        lab_key = f"modules/{slug}/labs/{lab_id}/lab.json"
        b_lab = self.agent2.backup_json_file(lab_key, backup_dir)
        b_man = self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)

        change_set = ChangeSet(
            timestamp=datetime.now(timezone.utc).isoformat(),
            operation="add_lab_notes",
            module_slug=slug,
            backup_files={k: str(v) for k, v in [(lab_key, b_lab), (f"modules/{slug}/manifest.json", b_man)] if v},
        )

        try:
            self.storage.put_file(dest_key, staged.staged_file, get_content_type(dest_key), cache="immutable")
            change_set.uploaded_keys.append(dest_key)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "add_lab_notes", "uploaded_keys": change_set.uploaded_keys}),
                encoding="utf-8"
            )

            lab_json, _ = self.storage.get_json(lab_key)
            if not lab_json:
                lab_json = {"id": lab_id, "number": 1, "category": "hands-on", "title": lab_id}

            lab_json["notes"] = {
                "path": dest_key,
                "format": staged.format,
                "sizeBytes": staged.size_bytes,
                "hash": staged.sha256_short,
                "updatedAt": staged.updated_at,
            }
            lab_json["updatedAt"] = staged.updated_at
            self.storage.put_json(lab_key, lab_json, cache="manifest")

            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_root_index()

            console.print(f"[bold green]Lab notes successfully uploaded to {lab_id}![/bold green]")
        finally:
            self.agent1.cleanup()

    def action_add_lab_doodle(self) -> None:
        console.print(Panel("[bold]Add Architectural Doodle to Lab[/bold]", style="cyan"))
        slug = self.select_module()
        if not slug: return
        lab_id = self.select_lab(slug)
        if not lab_id: return

        file_path = pick_single_file("Select Lab Doodle / Sketch (JPG, PNG, WebP, SVG)")
        staged = self.agent1.process(file_path)

        dest_img_key = Agent2Placement.lab_doodle_key(slug, lab_id, is_thumb=False, ext=staged.format)
        dest_thumb_key = Agent2Placement.lab_doodle_key(slug, lab_id, is_thumb=True, ext=staged.format)

        console.print(f"Destination: [cyan]{dest_img_key}[/cyan] ({staged.width}x{staged.height})")

        if not self.auto_yes and not questionary.confirm("Upload doodle?").ask():
            self.agent1.cleanup()
            return

        if self.dry_run:
            self.agent1.cleanup()
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return

        backup_dir = self.agent2.create_backup_dir()
        lab_key = f"modules/{slug}/labs/{lab_id}/lab.json"
        b_lab = self.agent2.backup_json_file(lab_key, backup_dir)
        b_vis = self.agent2.backup_json_file(f"modules/{slug}/visuals.json", backup_dir)
        b_man = self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)

        change_set = ChangeSet(
            timestamp=datetime.now(timezone.utc).isoformat(),
            operation="add_lab_doodle",
            module_slug=slug,
            backup_files={k: str(v) for k, v in [(lab_key, b_lab), (f"modules/{slug}/visuals.json", b_vis), (f"modules/{slug}/manifest.json", b_man)] if v},
        )

        try:
            self.storage.put_file(dest_img_key, staged.staged_file, get_content_type(dest_img_key), cache="immutable")
            change_set.uploaded_keys.append(dest_img_key)

            thumb_ref = None
            if staged.staged_thumb:
                self.storage.put_file(dest_thumb_key, staged.staged_thumb, "image/webp", cache="immutable")
                change_set.uploaded_keys.append(dest_thumb_key)
                thumb_ref = {
                    "path": dest_thumb_key,
                    "format": "webp",
                    "sizeBytes": staged.staged_thumb.stat().st_size,
                    "hash": self.agent1._calc_hash(staged.staged_thumb),
                    "updatedAt": staged.updated_at,
                }

            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "add_lab_doodle", "uploaded_keys": change_set.uploaded_keys}),
                encoding="utf-8"
            )

            lab_json, _ = self.storage.get_json(lab_key)
            if not lab_json:
                lab_json = {"id": lab_id, "number": 1, "category": "hands-on", "title": lab_id}

            lab_json["doodle"] = {
                "path": dest_img_key,
                "format": staged.format,
                "sizeBytes": staged.size_bytes,
                "hash": staged.sha256_short,
                "updatedAt": staged.updated_at,
            }
            if thumb_ref:
                lab_json["thumb"] = thumb_ref

            lab_json["updatedAt"] = staged.updated_at
            self.storage.put_json(lab_key, lab_json, cache="manifest")

            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_visuals_index(slug)

            console.print(f"[bold green]Lab doodle successfully attached to {lab_id}![/bold green]")
        finally:
            self.agent1.cleanup()
            thumb_ref = {
                "path": dest_thumb_key,
                "format": "webp",
                "sizeBytes": staged.staged_thumb.stat().st_size,
                "hash": self.agent1._calc_hash(staged.staged_thumb),
                "updatedAt": staged.updated_at,
            }

        lab_key = f"modules/{slug}/labs/{lab_id}/lab.json"
        lab_json, _ = self.storage.get_json(lab_key)
        if not lab_json:
            lab_json = {"id": lab_id, "number": 1, "category": "hands-on", "title": lab_id}

        lab_json["doodle"] = {
            "path": dest_img_key,
            "format": staged.format,
            "sizeBytes": staged.size_bytes,
            "hash": staged.sha256_short,
            "updatedAt": staged.updated_at,
        }
        if thumb_ref:
            lab_json["thumb"] = thumb_ref

        lab_json["updatedAt"] = staged.updated_at
        self.storage.put_json(lab_key, lab_json, cache="manifest")

        self.agent5.recompute_manifest(slug)
        self.agent5.recompute_visuals_index(slug)

        console.print(f"[bold green]Lab doodle successfully attached to {lab_id}![/bold green]")

    def action_remove(
        self,
        target_type: Optional[str] = None,
        module_slug: Optional[str] = None,
        day_number: Optional[int] = None,
        lab_id: Optional[str] = None,
        item_id: Optional[str] = None,
        typed_confirm: Optional[str] = None,
    ) -> bool:
        """
        Removes ONE specific item with strict typed confirmation:
        transcript, board photo, summary, link, question, lab note, lab doodle, whole day, lab, or module.
        Backs up changed JSON files first, deletes uploaded storage keys,
        updates parent manifests, and runs post-removal verification.
        """
        console.print(Panel("[bold red]Remove Course Content Item[/bold red]\n[dim]Strict typed-confirmation removal with post-publish verification[/dim]", style="red"))

        slug = module_slug or self.select_module()
        if not slug:
            return False

        item_choices = [
            "Module (entire module)",
            "Day (entire course day)",
            "Summary (daily summary)",
            "Transcript (single class transcript)",
            "Board Photo (whiteboard diagram)",
            "Question (single Q&A)",
            "Link (external reference link)",
            "Lab (entire lab)",
            "Lab Notes (study notes for a lab)",
            "Lab Doodle (architecture sketch for a lab)",
            "[Cancel]",
        ]

        if not target_type:
            target_type = questionary.select("What type of item would you like to remove?", choices=item_choices).ask()
            if not target_type or target_type == "[Cancel]":
                return False

        tt = target_type.lower()

        # ── 1. MODULE ──
        if "module" in tt:
            expected = slug
            typed = typed_confirm or questionary.text(f"To confirm deleting this entire module, type '{expected}':").ask()
            if not typed or typed.strip() != expected:
                console.print("[yellow]Deletion canceled: typed confirmation did not match.[/yellow]")
                return False

            keys_to_delete = self.storage.list(f"modules/{slug}/")
            console.print("\n[bold]Removal Plan:[/bold]")
            console.print(f"  [red]DELETE OBJECTS ({len(keys_to_delete)}):[/red] All files under modules/{slug}/")
            console.print("  [yellow]UPDATE:[/yellow] index.json (remove module entry)")
            console.print("  [yellow]UPDATE:[/yellow] search-index.json (remove module entries)")

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return True

            backup_dir = self.agent2.create_backup_dir()
            self.agent2.backup_json_file("index.json", backup_dir)
            self.agent2.backup_json_file("search-index.json", backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/visuals.json", backup_dir)

            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "remove_module", "slug": slug, "uploaded_keys": []}),
                encoding="utf-8"
            )

            for k in keys_to_delete:
                self.storage.delete(k)

            idx, _ = self.storage.get_json("index.json")
            if idx and isinstance(idx, dict):
                idx["modules"] = [m for m in idx.get("modules", []) if m.get("slug") != slug]
                self.storage.put_json("index.json", idx, cache="manifest")

            s_idx, _ = self.storage.get_json("search-index.json")
            if isinstance(s_idx, list):
                s_idx = [s for s in s_idx if s.get("moduleSlug") != slug]
                self.storage.put_json("search-index.json", s_idx, cache="manifest")

            checks = self.agent4.verify_all()
            passed = self.agent4.render_report(checks)
            console.print(f"[bold green]Module '{slug}' successfully removed![/bold green]")
            return passed

        # ── 2. DAY ──
        elif "day" in tt and "summary" not in tt and "transcript" not in tt and "board" not in tt and "question" not in tt and "link" not in tt:
            d_num = day_number if day_number is not None else self.select_day(slug)
            if d_num is None: return False

            expected = f"Day {d_num}"
            typed = typed_confirm or questionary.text(f"To confirm deleting Day {d_num}, type '{expected}':").ask()
            if not typed or typed.strip().lower() not in (expected.lower(), str(d_num)):
                console.print("[yellow]Deletion canceled: typed confirmation did not match.[/yellow]")
                return False

            folder = Agent2Placement.day_folder(d_num)
            keys_to_delete = self.storage.list(f"modules/{slug}/days/{folder}/")
            man_key = f"modules/{slug}/manifest.json"

            console.print("\n[bold]Removal Plan:[/bold]")
            console.print(f"  [red]DELETE OBJECTS ({len(keys_to_delete)}):[/red] All files under modules/{slug}/days/{folder}/")
            console.print(f"  [yellow]UPDATE:[/yellow] {man_key}")

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return True

            backup_dir = self.agent2.create_backup_dir()
            self.agent2.backup_json_file(man_key, backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/days/{folder}/day.json", backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/visuals.json", backup_dir)
            self.agent2.backup_json_file("index.json", backup_dir)

            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "remove_day", "slug": slug, "day": d_num, "uploaded_keys": []}),
                encoding="utf-8"
            )

            for k in keys_to_delete:
                self.storage.delete(k)

            manifest, _ = self.storage.get_json(man_key)
            if manifest:
                manifest["days"] = [d for d in manifest.get("days", []) if d.get("number") != d_num]
                self.storage.put_json(man_key, manifest, cache="manifest")

            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_root_index()
            self.agent5.recompute_visuals_index(slug)
            self.agent5.recompute_search_index(slug)

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            console.print(f"[bold green]Day {d_num} successfully removed from '{slug}'![/bold green]")
            return passed

        # ── 3. SUMMARY ──
        elif "summary" in tt:
            d_num = day_number if day_number is not None else self.select_day(slug)
            if d_num is None: return False

            folder = Agent2Placement.day_folder(d_num)
            day_key = f"modules/{slug}/days/{folder}/day.json"
            day_json, _ = self.storage.get_json(day_key)
            if not day_json or not day_json.get("summary"):
                console.print(f"[yellow]Day {d_num} does not have a summary.[/yellow]")
                return False

            sum_path = day_json["summary"].get("path")
            expected = "summary"
            typed = typed_confirm or questionary.text("To confirm removing the summary, type 'summary':").ask()
            if not typed or typed.strip().lower() != expected:
                console.print("[yellow]Deletion canceled: typed confirmation did not match.[/yellow]")
                return False

            console.print("\n[bold]Removal Plan:[/bold]")
            if sum_path: console.print(f"  [red]DELETE FILE:[/red] {sum_path}")
            console.print(f"  [yellow]UPDATE:[/yellow] {day_key} (set summary = None)")

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return True

            backup_dir = self.agent2.create_backup_dir()
            self.agent2.backup_json_file(day_key, backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "remove_summary", "slug": slug, "day": d_num, "uploaded_keys": []}),
                encoding="utf-8"
            )

            if sum_path:
                self.storage.delete(sum_path)

            del day_json["summary"]
            day_json["updatedAt"] = datetime.now(timezone.utc).isoformat()
            self.storage.put_json(day_key, day_json, cache="manifest")

            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_root_index()
            self.agent5.recompute_search_index(slug)

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            console.print(f"[bold green]Summary removed from Day {d_num}![/bold green]")
            return passed

        # ── 4. TRANSCRIPT ──
        elif "transcript" in tt:
            d_num = day_number if day_number is not None else self.select_day(slug)
            if d_num is None: return False

            folder = Agent2Placement.day_folder(d_num)
            day_key = f"modules/{slug}/days/{folder}/day.json"
            day_json, _ = self.storage.get_json(day_key)
            transcripts = day_json.get("transcripts", []) if day_json else []
            if not transcripts:
                console.print(f"[yellow]Day {d_num} has no transcripts.[/yellow]")
                return False

            if item_id:
                target_t = next((t for t in transcripts if t.get("id") == item_id or t.get("title") == item_id), None)
            else:
                choices = [f"{t.get('order', i+1)}. {t.get('title')} ({t.get('id')})" for i, t in enumerate(transcripts)]
                choice = questionary.select("Select transcript to remove:", choices=choices).ask()
                if not choice: return False
                t_id = choice.split("(")[-1].strip(")")
                target_t = next((t for t in transcripts if t.get("id") == t_id), None)

            if not target_t:
                console.print("[yellow]Transcript not found.[/yellow]")
                return False

            expected = target_t.get("title", "")
            typed = typed_confirm or questionary.text(f"To confirm deleting this transcript, type '{expected}':").ask()
            if not typed or typed.strip() != expected:
                console.print("[yellow]Deletion canceled: typed confirmation did not match.[/yellow]")
                return False

            file_path = target_t.get("file", {}).get("path")
            console.print("\n[bold]Removal Plan:[/bold]")
            if file_path: console.print(f"  [red]DELETE FILE:[/red] {file_path}")
            console.print(f"  [yellow]UPDATE:[/yellow] {day_key} (remove transcript)")

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return True

            backup_dir = self.agent2.create_backup_dir()
            self.agent2.backup_json_file(day_key, backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "remove_transcript", "slug": slug, "day": d_num, "uploaded_keys": []}),
                encoding="utf-8"
            )

            if file_path:
                self.storage.delete(file_path)

            day_json["transcripts"] = [t for t in transcripts if t.get("id") != target_t.get("id")]
            day_json["updatedAt"] = datetime.now(timezone.utc).isoformat()
            self.storage.put_json(day_key, day_json, cache="manifest")

            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_root_index()
            self.agent5.recompute_search_index(slug)

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            console.print(f"[bold green]Transcript '{expected}' removed from Day {d_num}![/bold green]")
            return passed

        # ── 5. BOARD PHOTO ──
        elif "board" in tt or "photo" in tt:
            d_num = day_number if day_number is not None else self.select_day(slug)
            if d_num is None: return False

            folder = Agent2Placement.day_folder(d_num)
            day_key = f"modules/{slug}/days/{folder}/day.json"
            day_json, _ = self.storage.get_json(day_key)
            boards = day_json.get("boards", []) if day_json else []
            if not boards:
                console.print(f"[yellow]Day {d_num} has no board photos.[/yellow]")
                return False

            if item_id:
                target_b = next((b for b in boards if b.get("id") == item_id or b.get("caption") == item_id), None)
            else:
                choices = [f"{b.get('id')}: {b.get('caption', 'Diagram')}" for b in boards]
                choice = questionary.select("Select board photo to remove:", choices=choices).ask()
                if not choice: return False
                b_id = choice.split(":")[0].strip()
                target_b = next((b for b in boards if b.get("id") == b_id), None)

            if not target_b:
                console.print("[yellow]Board photo not found.[/yellow]")
                return False

            expected = target_b.get("id")
            typed = typed_confirm or questionary.text(f"To confirm deleting this board photo, type '{expected}':").ask()
            if not typed or typed.strip() != expected:
                console.print("[yellow]Deletion canceled: typed confirmation did not match.[/yellow]")
                return False

            img_p = target_b.get("image", {}).get("path")
            thumb_p = target_b.get("thumb", {}).get("path") if target_b.get("thumb") else None

            console.print("\n[bold]Removal Plan:[/bold]")
            if img_p: console.print(f"  [red]DELETE FILE:[/red] {img_p}")
            if thumb_p: console.print(f"  [red]DELETE THUMB:[/red] {thumb_p}")
            console.print(f"  [yellow]UPDATE:[/yellow] {day_key} (remove board)")

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return True

            backup_dir = self.agent2.create_backup_dir()
            self.agent2.backup_json_file(day_key, backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/visuals.json", backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "remove_board", "slug": slug, "day": d_num, "uploaded_keys": []}),
                encoding="utf-8"
            )

            if img_p: self.storage.delete(img_p)
            if thumb_p: self.storage.delete(thumb_p)

            day_json["boards"] = [b for b in boards if b.get("id") != expected]
            day_json["updatedAt"] = datetime.now(timezone.utc).isoformat()
            self.storage.put_json(day_key, day_json, cache="manifest")

            self.agent5.recompute_visuals_index(slug)
            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_root_index()

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            console.print(f"[bold green]Board photo '{expected}' removed from Day {d_num}![/bold green]")
            return passed

        # ── 6. QUESTION ──
        elif "question" in tt:
            d_num = day_number if day_number is not None else self.select_day(slug)
            if d_num is None: return False

            folder = Agent2Placement.day_folder(d_num)
            day_key = f"modules/{slug}/days/{folder}/day.json"
            day_json, _ = self.storage.get_json(day_key)
            questions = day_json.get("questions", []) if day_json else []
            if not questions:
                console.print(f"[yellow]Day {d_num} has no questions.[/yellow]")
                return False

            if item_id:
                target_q = next((q for q in questions if q.get("id") == item_id), None)
            else:
                choices = [f"{q.get('id')}: {q.get('question')[:50]}" for q in questions]
                choice = questionary.select("Select question to remove:", choices=choices).ask()
                if not choice: return False
                q_id = choice.split(":")[0].strip()
                target_q = next((q for q in questions if q.get("id") == q_id), None)

            if not target_q:
                console.print("[yellow]Question not found.[/yellow]")
                return False

            expected = target_q.get("id")
            typed = typed_confirm or questionary.text(f"To confirm deleting this question, type '{expected}':").ask()
            if not typed or typed.strip() != expected:
                console.print("[yellow]Deletion canceled: typed confirmation did not match.[/yellow]")
                return False

            console.print("\n[bold]Removal Plan:[/bold]")
            console.print(f"  [yellow]UPDATE:[/yellow] {day_key} (remove question {expected})")

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return True

            backup_dir = self.agent2.create_backup_dir()
            self.agent2.backup_json_file(day_key, backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "remove_question", "slug": slug, "day": d_num, "uploaded_keys": []}),
                encoding="utf-8"
            )

            day_json["questions"] = [q for q in questions if q.get("id") != expected]
            day_json["updatedAt"] = datetime.now(timezone.utc).isoformat()
            self.storage.put_json(day_key, day_json, cache="manifest")

            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_root_index()
            self.agent5.recompute_search_index(slug)

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            console.print(f"[bold green]Question '{expected}' removed from Day {d_num}![/bold green]")
            return passed

        # ── 7. LINK ──
        elif "link" in tt:
            d_num = day_number if day_number is not None else self.select_day(slug)
            if d_num is None: return False

            folder = Agent2Placement.day_folder(d_num)
            day_key = f"modules/{slug}/days/{folder}/day.json"
            day_json, _ = self.storage.get_json(day_key)
            links = day_json.get("links", []) if day_json else []
            if not links:
                console.print(f"[yellow]Day {d_num} has no links.[/yellow]")
                return False

            if item_id:
                target_l = next((l for l in links if l.get("label") == item_id or l.get("url") == item_id), None)
            else:
                choices = [f"{l.get('label')}: {l.get('url')}" for l in links]
                choice = questionary.select("Select link to remove:", choices=choices).ask()
                if not choice: return False
                label = choice.split(":")[0].strip()
                target_l = next((l for l in links if l.get("label") == label), None)

            if not target_l:
                console.print("[yellow]Link not found.[/yellow]")
                return False

            expected = target_l.get("label")
            typed = typed_confirm or questionary.text(f"To confirm deleting this link, type '{expected}':").ask()
            if not typed or typed.strip() != expected:
                console.print("[yellow]Deletion canceled: typed confirmation did not match.[/yellow]")
                return False

            console.print("\n[bold]Removal Plan:[/bold]")
            console.print(f"  [yellow]UPDATE:[/yellow] {day_key} (remove link '{expected}')")

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return True

            backup_dir = self.agent2.create_backup_dir()
            self.agent2.backup_json_file(day_key, backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "remove_link", "slug": slug, "day": d_num, "uploaded_keys": []}),
                encoding="utf-8"
            )

            day_json["links"] = [l for l in links if l.get("label") != expected]
            day_json["updatedAt"] = datetime.now(timezone.utc).isoformat()
            self.storage.put_json(day_key, day_json, cache="manifest")

            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_root_index()

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            console.print(f"[bold green]Link '{expected}' removed from Day {d_num}![/bold green]")
            return passed

        # ── 8. LAB (ENTIRE LAB) ──
        elif "lab" in tt and "note" not in tt and "doodle" not in tt:
            lid = lab_id or self.select_lab(slug)
            if not lid: return False

            expected = lid
            typed = typed_confirm or questionary.text(f"To confirm deleting lab '{expected}', type '{expected}':").ask()
            if not typed or typed.strip() != expected:
                console.print("[yellow]Deletion canceled: typed confirmation did not match.[/yellow]")
                return False

            keys_to_delete = self.storage.list(f"modules/{slug}/labs/{lid}/")
            man_key = f"modules/{slug}/manifest.json"

            console.print("\n[bold]Removal Plan:[/bold]")
            console.print(f"  [red]DELETE OBJECTS ({len(keys_to_delete)}):[/red] All files under modules/{slug}/labs/{lid}/")
            console.print(f"  [yellow]UPDATE:[/yellow] {man_key} (remove lab {lid})")

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return True

            backup_dir = self.agent2.create_backup_dir()
            self.agent2.backup_json_file(man_key, backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/labs/{lid}/lab.json", backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/visuals.json", backup_dir)
            self.agent2.backup_json_file("index.json", backup_dir)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "remove_lab", "slug": slug, "lab_id": lid, "uploaded_keys": []}),
                encoding="utf-8"
            )

            for k in keys_to_delete:
                self.storage.delete(k)

            manifest, _ = self.storage.get_json(man_key)
            if manifest:
                manifest["labs"] = [l for l in manifest.get("labs", []) if l.get("id") != lid]
                self.storage.put_json(man_key, manifest, cache="manifest")

            self.agent5.recompute_manifest(slug)
            self.agent5.recompute_root_index()
            self.agent5.recompute_visuals_index(slug)
            self.agent5.recompute_search_index(slug)

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            console.print(f"[bold green]Lab '{lid}' successfully removed from '{slug}'![/bold green]")
            return passed

        # ── 9. LAB NOTES ──
        elif "note" in tt:
            lid = lab_id or self.select_lab(slug)
            if not lid: return False

            lab_key = f"modules/{slug}/labs/{lid}/lab.json"
            lab_json, _ = self.storage.get_json(lab_key)
            if not lab_json or not lab_json.get("notes"):
                console.print(f"[yellow]Lab '{lid}' does not have notes attached.[/yellow]")
                return False

            notes_path = lab_json["notes"].get("path")
            expected = "notes"
            typed = typed_confirm or questionary.text("To confirm removing lab notes, type 'notes':").ask()
            if not typed or typed.strip().lower() != expected:
                console.print("[yellow]Deletion canceled: typed confirmation did not match.[/yellow]")
                return False

            console.print("\n[bold]Removal Plan:[/bold]")
            if notes_path: console.print(f"  [red]DELETE FILE:[/red] {notes_path}")
            console.print(f"  [yellow]UPDATE:[/yellow] {lab_key} (set notes = None)")

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return True

            backup_dir = self.agent2.create_backup_dir()
            self.agent2.backup_json_file(lab_key, backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "remove_lab_notes", "slug": slug, "lab_id": lid, "uploaded_keys": []}),
                encoding="utf-8"
            )

            if notes_path: self.storage.delete(notes_path)

            del lab_json["notes"]
            lab_json["updatedAt"] = datetime.now(timezone.utc).isoformat()
            self.storage.put_json(lab_key, lab_json, cache="manifest")

            self.agent5.recompute_manifest(slug)

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            console.print(f"[bold green]Notes removed from lab '{lid}'![/bold green]")
            return passed

        # ── 10. LAB DOODLE ──
        elif "doodle" in tt:
            lid = lab_id or self.select_lab(slug)
            if not lid: return False

            lab_key = f"modules/{slug}/labs/{lid}/lab.json"
            lab_json, _ = self.storage.get_json(lab_key)
            if not lab_json or not lab_json.get("doodle"):
                console.print(f"[yellow]Lab '{lid}' does not have a doodle attached.[/yellow]")
                return False

            doodle_p = lab_json["doodle"].get("path")
            thumb_p = lab_json.get("thumb", {}).get("path") if lab_json.get("thumb") else None
            expected = "doodle"
            typed = typed_confirm or questionary.text("To confirm removing the lab doodle, type 'doodle':").ask()
            if not typed or typed.strip().lower() != expected:
                console.print("[yellow]Deletion canceled: typed confirmation did not match.[/yellow]")
                return False

            console.print("\n[bold]Removal Plan:[/bold]")
            if doodle_p: console.print(f"  [red]DELETE FILE:[/red] {doodle_p}")
            if thumb_p: console.print(f"  [red]DELETE THUMB:[/red] {thumb_p}")
            console.print(f"  [yellow]UPDATE:[/yellow] {lab_key} (set doodle = None)")

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return True

            backup_dir = self.agent2.create_backup_dir()
            self.agent2.backup_json_file(lab_key, backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/visuals.json", backup_dir)
            self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "remove_lab_doodle", "slug": slug, "lab_id": lid, "uploaded_keys": []}),
                encoding="utf-8"
            )

            if doodle_p: self.storage.delete(doodle_p)
            if thumb_p: self.storage.delete(thumb_p)

            del lab_json["doodle"]
            if "thumb" in lab_json: del lab_json["thumb"]
            lab_json["updatedAt"] = datetime.now(timezone.utc).isoformat()
            self.storage.put_json(lab_key, lab_json, cache="manifest")

            self.agent5.recompute_visuals_index(slug)
            self.agent5.recompute_manifest(slug)

            checks = self.agent4.verify_module(slug)
            passed = self.agent4.render_report(checks)
            console.print(f"[bold green]Doodle removed from lab '{lid}'![/bold green]")
            return passed

        else:
            console.print(f"[yellow]Unknown item type: {target_type}[/yellow]")
            return False

    def run_wizard(self) -> None:
        """Main interactive wizard loop processing ONE item at a time."""
        console.print(Panel("[bold cyan]AI-13 Course Notes Ingest Tool[/bold cyan]\n[dim]One-Item-at-a-Time Content Publisher[/dim]", style="blue"))

        # Auto-initialize if index.json is missing
        index_data, _ = self.storage.get_json("index.json")
        if index_data is None:
            console.print("[yellow]Repository not initialized (index.json missing). Auto-initializing bootstrap files...[/yellow]")
            self.action_init(silent=True)

        while True:
            op_choices = [
                OperationType.ADD_SUMMARY.value,
                OperationType.ADD_TRANSCRIPT.value,
                OperationType.ADD_BOARD_PHOTO.value,
                OperationType.ADD_QUESTIONS.value,
                OperationType.ADD_LINK.value,
                OperationType.CREATE_DAY.value,
                OperationType.CREATE_LAB.value,
                OperationType.ADD_LAB_NOTES.value,
                OperationType.ADD_LAB_DOODLE.value,
                OperationType.CREATE_MODULE.value,
                OperationType.REMOVE_ITEM.value,
                "[Exit Ingest Tool]",
            ]

            choice = questionary.select("What would you like to ingest or create?", choices=op_choices).ask()
            if not choice or choice == "[Exit Ingest Tool]":
                console.print("[dim]Goodbye![/dim]")
                break

            try:
                if choice == OperationType.CREATE_MODULE.value:
                    self.action_create_module()
                elif choice == OperationType.CREATE_DAY.value:
                    self.action_create_day()
                elif choice == OperationType.ADD_SUMMARY.value:
                    self.action_add_summary()
                elif choice == OperationType.ADD_TRANSCRIPT.value:
                    self.action_add_transcript()
                elif choice == OperationType.ADD_BOARD_PHOTO.value:
                    self.action_add_board_photo()
                elif choice == OperationType.ADD_QUESTIONS.value:
                    self.action_add_questions()
                elif choice == OperationType.ADD_LINK.value:
                    self.action_add_link()
                elif choice == OperationType.CREATE_LAB.value:
                    self.action_create_lab()
                elif choice == OperationType.ADD_LAB_NOTES.value:
                    self.action_add_lab_notes()
                elif choice == OperationType.ADD_LAB_DOODLE.value:
                    self.action_add_lab_doodle()
                elif choice == OperationType.REMOVE_ITEM.value:
                    self.action_remove()
            except KeyboardInterrupt:
                console.print("\n[yellow]Operation canceled by user.[/yellow]")
            except Exception as e:
                console.print(f"\n[bold red]Error:[/bold red] {e}")
                log.exception("Error in wizard action")

            console.print("")
            if not questionary.confirm("Add another item?").ask():
                console.print("[dim]Ingest session finished. Have a great day![/dim]")
                break


def main() -> None:
    parser = argparse.ArgumentParser(description="AI-13 Course Portal Content Ingest CLI")
    parser.add_argument("subcommand", nargs="?", default="wizard",
                        choices=["wizard", "init", "check-connection", "list", "verify", "rebuild-index", "undo", "questions-template", "remove"])
    parser.add_argument("--target", choices=["r2", "local"], default="r2", help="Storage target (r2 | local)")
    parser.add_argument("--root", default=None, help="Root directory for local storage target")
    parser.add_argument("--module", default=None, help="Target module slug for verify")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without writing")
    parser.add_argument("--yes", action="store_true", help="Auto-confirm non-destructive prompts")
    parser.add_argument("--verbose", action="store_true", help="Verbose log output")

    args = parser.parse_args()

    if args.verbose:
        import logging
        log.setLevel(logging.DEBUG)
        vh = logging.StreamHandler()
        vh.setLevel(logging.DEBUG)
        log.addHandler(vh)

    # Template generator subcommand
    if args.subcommand == "questions-template":
        template_content = """## Q1: What is the primary difference between Managed Identity and Storage Access Keys?
**Answer:** Managed Identity eliminates storing secrets or rotating passwords by delegating authentication directly to Azure Active Directory.
**Explain simply:** Think of access keys like a physical house key you can accidentally drop or lose; Managed Identity is like facial recognition built directly into the front door.
**Tags:** Security, Identity, Azure

## Q2: Why configure training compute clusters to auto-scale down to zero nodes?
**Answer:** Setting minimum nodes to 0 ensures you incur zero billing charges when no training jobs are actively executing.
**Explain simply:** Like turning off the lights when leaving a room, auto-scale shuts down cloud servers the second they finish work.
**Tags:** Cost, Compute, Optimization
"""
        p = Path("questions_template.md")
        p.write_text(template_content, encoding="utf-8")
        console.print(f"[bold green]Created ready-to-fill template file: {p.resolve()}[/bold green]")
        return

    # Initialize storage
    storage = get_storage(args.target, args.root)
    cli = IngestCLI(storage, dry_run=args.dry_run, auto_yes=args.yes)

    if args.subcommand == "check-connection":
        console.print(f"[cyan]Testing connection to {args.target.upper()} storage...[/cyan]")
        if args.target == "r2":
            assert isinstance(storage, R2Storage)
            ok, msg = storage.check_connection()
            if ok:
                console.print(f"[bold green]{msg}[/bold green]")
            else:
                console.print(f"[bold red]{msg}[/bold red]")
                sys.exit(1)
        else:
            console.print(f"[bold green]Local storage active at: {cli.storage.root}[/bold green]")

    elif args.subcommand == "list":
        index_data, _ = storage.get_json("index.json")
        if not index_data:
            console.print("[yellow]Storage is empty. No index.json found.[/yellow]")
            return

        tree = Tree("[bold cyan]Course Portal Content Tree[/bold cyan]")
        for mod in index_data.get("modules", []):
            slug = mod["slug"]
            m_node = tree.add(f"[bold]{mod['title']}[/bold] ({slug}) - {mod.get('dayCount', 0)} days, {mod.get('labCount', 0)} labs")

            manifest, _ = storage.get_json(f"modules/{slug}/manifest.json")
            if manifest:
                d_branch = m_node.add("[cyan]Days[/cyan]")
                for d in manifest.get("days", []):
                    d_branch.add(f"Day {d['number']}: {d.get('title')} [dim]({d.get('transcriptCount', 0)} transcripts, {d.get('boardCount', 0)} boards, {d.get('questionCount', 0)} Q&As)[/dim]")

                l_branch = m_node.add("[cyan]Labs[/cyan]")
                for l in manifest.get("labs", []):
                    l_branch.add(f"Lab {l['number']}: {l.get('title')} ({l.get('id')}) [dim][{l.get('category')}][/dim]")

        console.print(tree)

    elif args.subcommand == "verify":
        if args.module:
            checks = cli.agent4.verify_module(args.module)
        else:
            checks = cli.agent4.verify_all()
        passed = cli.agent4.render_report(checks)
        if not passed:
            sys.exit(1)

    elif args.subcommand == "rebuild-index":
        console.print("[cyan]Rebuilding all derived manifests and search indices from underlying content...[/cyan]")
        res = cli.agent5.rebuild_all()
        console.print(f"[bold green]Rebuild complete: {res}[/bold green]")

    elif args.subcommand == "undo":
        # Find latest backup
        backups = sorted(BACKUP_DIR.glob("*"))
        if not backups:
            console.print("[yellow]No backups found in .ingest_backups/.[/yellow]")
            return

        latest = backups[-1]
        console.print(f"[bold yellow]Found latest backup:[/bold yellow] {latest.name}")
        for f in latest.glob("*"):
            if f.name != "__changeset__.json":
                console.print(f"  • {f.name.replace('__', '/')}")

        changeset_file = latest / "__changeset__.json"
        uploaded_keys = []
        if changeset_file.is_file():
            try:
                cs_data = json.loads(changeset_file.read_text(encoding="utf-8"))
                uploaded_keys = cs_data.get("uploaded_keys", [])
            except Exception:
                pass

        if cli.auto_yes or questionary.confirm("Restore this backup and revert the last operation?").ask():
            # 1. Delete newly uploaded files
            for key in uploaded_keys:
                try:
                    storage.delete(key)
                    console.print(f"  [red]Deleted uploaded file:[/red] {key}")
                except Exception as e:
                    log.warning(f"Failed to delete {key} during undo: {e}")

            # 2. Restore JSON manifests
            for f in latest.glob("*"):
                if f.name == "__changeset__.json":
                    continue
                storage_key = f.name.replace("__", "/")
                data = json.loads(f.read_text(encoding="utf-8"))
                storage.put_json(storage_key, data, cache="manifest")
                console.print(f"  [green]Restored manifest:[/green] {storage_key}")

            cli.agent5.rebuild_all()
            console.print("[bold green]Undo completed successfully![/bold green]")

    elif args.subcommand == "remove":
        cli.action_remove()

    elif args.subcommand == "init":
        cli.action_init()

    elif args.subcommand == "wizard":
        cli.run_wizard()


if __name__ == "__main__":
    main()

