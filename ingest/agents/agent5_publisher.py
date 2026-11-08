"""Agent 5: Publisher / Index Maintainer."""

import json
from datetime import datetime, timezone
from typing import Any, Optional
from ingest.config import SEARCH_INDEX_WARN_BYTES
from ingest.logger import log
from ingest.storage.base import StorageBackend


class Agent5Publisher:
    """
    Maintains all derived fields, manifests, visuals indices, and search indices.
    Guarantees consistency without ever requiring a Git commit for content.
    """

    def __init__(self, storage: StorageBackend):
        self.storage = storage

    def recompute_manifest(self, module_slug: str) -> dict[str, Any]:
        """
        Recalculates all day summaries, lab summaries, and totals
        from the underlying day.json and lab.json files for this module.
        """
        manifest_key = f"modules/{module_slug}/manifest.json"
        manifest, etag = self.storage.get_json(manifest_key)
        if not manifest or not isinstance(manifest, dict):
            raise FileNotFoundError(f"Module manifest not found: {manifest_key}")

        now_iso = datetime.now(timezone.utc).isoformat()
        days_list: list[dict[str, Any]] = []

        # 1. Recompute each day summary from day.json
        for day_entry in manifest.get("days", []):
            d_num = day_entry.get("number")
            folder = f"day-{str(d_num).zfill(2)}"
            day_json_key = f"modules/{module_slug}/days/{folder}/day.json"
            day_json, _ = self.storage.get_json(day_json_key)

            if not day_json or not isinstance(day_json, dict):
                # Day exists in manifest but day.json not yet created
                days_list.append(day_entry)
                continue

            has_summary = bool(day_json.get("summary"))
            t_count = len(day_json.get("transcripts", []))
            l_count = len(day_json.get("links", []))
            b_count = len(day_json.get("boards", []))
            q_count = len(day_json.get("questions", []))

            days_list.append({
                "number": d_num,
                "title": day_json.get("title", day_entry.get("title", f"Day {d_num}")),
                "subtitle": day_json.get("subtitle", day_entry.get("subtitle", "")),
                "hasSummary": has_summary,
                "transcriptCount": t_count,
                "linkCount": l_count,
                "boardCount": b_count,
                "questionCount": q_count,
            })

        # 2. Recompute each lab summary from lab.json
        labs_list: list[dict[str, Any]] = []
        for lab_entry in manifest.get("labs", []):
            lab_id = lab_entry.get("id")
            lab_json_key = f"modules/{module_slug}/labs/{lab_id}/lab.json"
            lab_json, _ = self.storage.get_json(lab_json_key)

            if not lab_json or not isinstance(lab_json, dict):
                labs_list.append(lab_entry)
                continue

            has_notes = bool(lab_json.get("notes"))
            has_doodle = bool(lab_json.get("doodle"))

            labs_list.append({
                "id": lab_id,
                "number": lab_json.get("number", lab_entry.get("number", 1)),
                "category": lab_json.get("category", lab_entry.get("category", "hands-on")),
                "title": lab_json.get("title", lab_entry.get("title", lab_id)),
                "hasNotes": has_notes,
                "hasDoodle": has_doodle,
            })

        # Update manifest
        manifest["days"] = sorted(days_list, key=lambda x: x.get("number", 0))
        manifest["labs"] = sorted(labs_list, key=lambda x: x.get("number", 0))
        manifest["updatedAt"] = now_iso

        self.storage.put_json(manifest_key, manifest, cache="manifest", if_match_etag=etag)
        return manifest

    def recompute_visuals_index(self, module_slug: str) -> dict[str, Any]:
        """
        Gathers all board work photos from all days and doodles from all labs
        into a single /modules/<slug>/visuals.json index.
        """
        manifest_key = f"modules/{module_slug}/manifest.json"
        manifest, _ = self.storage.get_json(manifest_key)
        if not manifest:
            return {"version": "1", "updatedAt": datetime.now(timezone.utc).isoformat(), "items": []}

        items: list[dict[str, Any]] = []
        now_iso = datetime.now(timezone.utc).isoformat()

        # 1. Boards from days
        for day in manifest.get("days", []):
            d_num = day.get("number")
            folder = f"day-{str(d_num).zfill(2)}"
            day_json, _ = self.storage.get_json(f"modules/{module_slug}/days/{folder}/day.json")
            if not day_json:
                continue

            for board in day_json.get("boards", []):
                items.append({
                    "id": f"{module_slug}-d{d_num}-{board.get('id')}",
                    "type": "board",
                    "dayNumber": d_num,
                    "caption": board.get("caption", f"Day {d_num} Board Photo"),
                    "image": board.get("image"),
                    "thumb": board.get("thumb"),
                    "width": board.get("width", 800),
                    "height": board.get("height", 450),
                    "addedAt": board.get("image", {}).get("updatedAt", now_iso),
                })

        # 2. Doodles from labs
        for lab in manifest.get("labs", []):
            lab_id = lab.get("id")
            lab_json, _ = self.storage.get_json(f"modules/{module_slug}/labs/{lab_id}/lab.json")
            if not lab_json or not lab_json.get("doodle"):
                continue

            doodle = lab_json.get("doodle")
            thumb = lab_json.get("thumb")

            items.append({
                "id": f"{module_slug}-{lab_id}-doodle",
                "type": "doodle",
                "labId": lab_id,
                "caption": f"Lab {lab_id} Architecture Sketch",
                "image": doodle,
                "thumb": thumb,
                "width": 800,
                "height": 500,
                "addedAt": doodle.get("updatedAt", now_iso),
            })

        visuals_data = {
            "version": "1",
            "updatedAt": now_iso,
            "items": items,
        }

        visuals_key = f"modules/{module_slug}/visuals.json"
        self.storage.put_json(visuals_key, visuals_data, cache="manifest")
        return visuals_data

    def recompute_root_index(self) -> dict[str, Any]:
        """
        Updates /index.json totals (dayCount, labCount, boardCount, transcriptCount, questionCount)
        across all modules.
        """
        index_data, etag = self.storage.get_json("index.json")
        if not index_data or not isinstance(index_data, dict):
            index_data = {
                "version": "1",
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "modules": [],
            }

        now_iso = datetime.now(timezone.utc).isoformat()
        updated_modules: list[dict[str, Any]] = []

        for mod in index_data.get("modules", []):
            slug = mod.get("slug")
            manifest, _ = self.storage.get_json(f"modules/{slug}/manifest.json")

            if not manifest:
                updated_modules.append(mod)
                continue

            days = manifest.get("days", [])
            labs = manifest.get("labs", [])

            total_days = len(days)
            total_labs = len(labs)
            total_boards = sum(d.get("boardCount", 0) for d in days)
            total_transcripts = sum(d.get("transcriptCount", 0) for d in days)
            total_questions = sum(d.get("questionCount", 0) for d in days)

            course_code = manifest.get("courseCode") or mod.get("courseCode")
            entry = {
                **mod,
                "dayCount": total_days,
                "labCount": total_labs,
                "boardCount": total_boards,
                "transcriptCount": total_transcripts,
                "questionCount": total_questions,
            }
            if course_code:
                entry["courseCode"] = course_code
            updated_modules.append(entry)

        index_data["modules"] = updated_modules
        index_data["updatedAt"] = now_iso

        self.storage.put_json("index.json", index_data, cache="manifest", if_match_etag=etag)
        return index_data

    def recompute_search_index(self, target_module_slug: Optional[str] = None) -> list[dict[str, Any]]:
        """
        Rebuilds or merges search entries for the affected module (or all modules).
        Warns if search-index.json exceeds 1.5 MB.
        """
        search_entries, _ = self.storage.get_json("search-index.json")
        if not search_entries or not isinstance(search_entries, list):
            search_entries = []

        index_data, _ = self.storage.get_json("index.json")
        modules = index_data.get("modules", []) if index_data else []

        # If a single module is targeted, preserve entries from other modules
        if target_module_slug:
            preserved = [e for e in search_entries if e.get("moduleSlug") != target_module_slug]
            active_slugs = [target_module_slug]
        else:
            preserved = []
            active_slugs = [m.get("slug") for m in modules]

        new_entries: list[dict[str, Any]] = []

        for slug in active_slugs:
            manifest, _ = self.storage.get_json(f"modules/{slug}/manifest.json")
            if not manifest:
                continue

            # 1. Module entry
            new_entries.append({
                "type": "module",
                "moduleSlug": slug,
                "title": manifest.get("title", slug),
                "snippet": manifest.get("description", manifest.get("subtitle", "")),
                "tags": [manifest.get("courseCode", "")] if manifest.get("courseCode") else ["Module"],
            })

            # 2. Days and Questions
            for day_summary in manifest.get("days", []):
                d_num = day_summary.get("number")
                folder = f"day-{str(d_num).zfill(2)}"
                day_json, _ = self.storage.get_json(f"modules/{slug}/days/{folder}/day.json")
                if not day_json:
                    continue

                new_entries.append({
                    "type": "day",
                    "moduleSlug": slug,
                    "dayNumber": d_num,
                    "title": day_json.get("title", f"Day {d_num}"),
                    "snippet": day_json.get("description", day_json.get("recap", ""))[:200],
                    "tags": [f"Day {d_num}"],
                })

                for q in day_json.get("questions", []):
                    new_entries.append({
                        "type": "question",
                        "moduleSlug": slug,
                        "dayNumber": d_num,
                        "labId": q.get("id"),
                        "title": q.get("question", ""),
                        "snippet": q.get("answer", "")[:200],
                        "tags": q.get("tags", []),
                    })

            # 3. Labs
            for lab_summary in manifest.get("labs", []):
                lab_id = lab_summary.get("id")
                lab_json, _ = self.storage.get_json(f"modules/{slug}/labs/{lab_id}/lab.json")
                if not lab_json:
                    continue

                new_entries.append({
                    "type": "lab",
                    "moduleSlug": slug,
                    "labId": lab_id,
                    "title": lab_json.get("title", lab_id),
                    "snippet": f"Category: {lab_json.get('category')} — Lab {lab_json.get('number')}",
                    "tags": [lab_json.get("category", "lab")],
                })

        final_index = preserved + new_entries
        encoded = json.dumps(final_index, indent=2, ensure_ascii=False).encode("utf-8")

        if len(encoded) > SEARCH_INDEX_WARN_BYTES:
            log.warning(
                f"search-index.json is large ({len(encoded) / 1024 / 1024:.2f} MB > 1.5 MB). "
                "Consider pruning old snippets."
            )

        self.storage.put_json("search-index.json", final_index, cache="manifest")
        return final_index

    def rebuild_all(self) -> dict[str, Any]:
        """
        Complete idempotent rebuild tool:
        Recomputes all module manifests, all visuals indices, root index, and search index.
        """
        index_data, _ = self.storage.get_json("index.json")
        if not index_data:
            return {"status": "error", "message": "No index.json found."}

        modules = index_data.get("modules", [])
        for m in modules:
            slug = m.get("slug")
            self.recompute_manifest(slug)
            self.recompute_visuals_index(slug)

        self.recompute_root_index()
        self.recompute_search_index()

        return {"status": "ok", "modules_rebuilt": len(modules)}

