"""Interactive Wizard and Maintenance CLI Commands for Ingest Tool."""

import argparse
import json
import subprocess
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
    SITE_CONTENT_DIR,
    PUBLISH_LOG_FILE,
    PAGES_MAX_FILES,
    PAGES_WARN_FILES,
    PAGES_HARD_WARN_FILES,
    PAGES_MAX_FILE_SIZE_BYTES,
    PAGES_WARN_FILE_SIZE_BYTES,
    ROOT_DIR,
    get_content_type,
    get_default_target,
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
    elif target == "site":
        path = Path(root_dir) if root_dir else SITE_CONTENT_DIR
        return LocalStorage(path)
    elif target == "r2":
        return R2Storage()
    else:
        raise ValueError(f"Unknown storage target: '{target}'. Use 'site', 'r2', or 'local'.")


def log_pending_op(description: str) -> None:
    """Appends an operation description to the pending publish log."""
    try:
        entries = []
        if PUBLISH_LOG_FILE.exists():
            try:
                entries = json.loads(PUBLISH_LOG_FILE.read_text(encoding="utf-8"))
            except Exception:
                entries = []
        entries.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "description": description,
        })
        PUBLISH_LOG_FILE.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    except Exception as e:
        log.warning(f"Could not write to pending operations log: {e}")


def get_pending_ops() -> list[str]:
    """Retrieves list of pending operation descriptions."""
    try:
        if PUBLISH_LOG_FILE.exists():
            entries = json.loads(PUBLISH_LOG_FILE.read_text(encoding="utf-8"))
            return [e.get("description", "") for e in entries if e.get("description")]
    except Exception:
        pass
    return []


def clear_pending_ops() -> None:
    """Clears pending operations log after publish."""
    try:
        if PUBLISH_LOG_FILE.exists():
            PUBLISH_LOG_FILE.unlink()
    except Exception as e:
        log.warning(f"Could not clear pending operations log: {e}")


def format_file_size(size_bytes: int) -> str:
    """Formats file size into human readable string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f} MB"


def check_forbidden_file(rel_path: str, size_bytes: int) -> tuple[bool, Optional[str]]:
    """Enforces publish safety rails (.env*, .staging, .ingest_backups, .ingest_logs, node_modules, dist, >25MB)."""
    norm = rel_path.replace("\\", "/").strip().lstrip("./")
    parts = norm.split("/")

    # 1. Environment and secret files (.env, .env.*)
    for p in parts:
        if p == ".env" or p.startswith(".env.") or p.startswith(".env"):
            return True, f"environment/secrets file '{norm}' must never be committed"

    # 2. Excluded runtime and build directories
    forbidden_dirs = {".staging", ".ingest_backups", ".ingest_logs", "node_modules", "dist"}
    for p in parts:
        if p in forbidden_dirs:
            return True, f"excluded directory '{p}' in '{norm}' must never be committed"

    # 3. Oversized file (> 25 MiB)
    if size_bytes > 25 * 1024 * 1024:
        mb = size_bytes / (1024 * 1024)
        return True, f"file '{norm}' ({mb:.1f} MiB) exceeds Cloudflare's 25 MiB per-file limit"

    return False, None


def get_git_status_partitions(root_dir: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Runs git status --porcelain -uall and partitions pending changes into:
      - content_items: files under public/content/
      - other_items: tracked modifications and untracked files outside public/content/
    """
    res = subprocess.run(
        ["git", "status", "--porcelain", "-uall"],
        capture_output=True,
        text=True,
        cwd=root_dir,
        check=False,
    )
    if res.returncode != 0:
        return [], []

    content_items = []
    other_items = []

    for raw_line in res.stdout.splitlines():
        if not raw_line.strip():
            continue
        status_code = raw_line[:2].strip()
        raw_path = raw_line[2:].strip().strip('"')
        if " -> " in raw_path:
            raw_path = raw_path.split(" -> ")[-1].strip().strip('"')

        norm_path = raw_path.replace("\\", "/").strip().lstrip("./")
        full_path = root_dir / norm_path
        size = full_path.stat().st_size if full_path.is_file() else 0

        is_forb, forb_reason = check_forbidden_file(norm_path, size)

        item = {
            "status": status_code or "M",
            "path": norm_path,
            "size": size,
            "is_forbidden": is_forb,
            "forbidden_reason": forb_reason,
        }

        if norm_path.startswith("public/content/") or norm_path == "public/content":
            content_items.append(item)
        else:
            other_items.append(item)

    return content_items, other_items


def get_unpushed_commits(root_dir: Path) -> list[str]:
    """Returns list of oneline commit summaries not yet pushed to the remote."""
    try:
        chk = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=root_dir)
        if chk.returncode != 0:
            return []

        u_chk = subprocess.run(["git", "rev-parse", "--verify", "--quiet", "@{u}"], capture_output=True, text=True, cwd=root_dir)
        if u_chk.returncode == 0:
            res = subprocess.run(["git", "log", "@{u}..HEAD", "--oneline"], capture_output=True, text=True, cwd=root_dir)
            if res.returncode == 0:
                return [ln.strip() for ln in res.stdout.splitlines() if ln.strip()]

        b_res = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, cwd=root_dir)
        branch = b_res.stdout.strip() or "main"
        o_chk = subprocess.run(["git", "rev-parse", "--verify", "--quiet", f"origin/{branch}"], capture_output=True, text=True, cwd=root_dir)
        if o_chk.returncode == 0:
            res = subprocess.run(["git", "log", f"origin/{branch}..HEAD", "--oneline"], capture_output=True, text=True, cwd=root_dir)
            if res.returncode == 0:
                return [ln.strip() for ln in res.stdout.splitlines() if ln.strip()]

        r_chk = subprocess.run(["git", "remote"], capture_output=True, text=True, cwd=root_dir)
        if r_chk.stdout.strip():
            res = subprocess.run(["git", "log", "--oneline"], capture_output=True, text=True, cwd=root_dir)
            if res.returncode == 0:
                return [ln.strip() for ln in res.stdout.splitlines() if ln.strip()]
    except Exception:
        pass
    return []


def get_github_commit_url(root_dir: Path, commit_hash: str) -> Optional[str]:
    """Resolves commit web URL on GitHub based on git remote origin."""
    try:
        res = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True, cwd=root_dir)
        if res.returncode != 0:
            return None
        url = res.stdout.strip()
        if url.startswith("git@github.com:"):
            repo_part = url[len("git@github.com:"):].rstrip(".git")
            return f"https://github.com/{repo_part}/commit/{commit_hash}"
        elif "github.com" in url:
            base = url.rstrip(".git")
            if not base.startswith("http"):
                base = f"https://{base}"
            return f"{base}/commit/{commit_hash}"
    except Exception:
        pass
    return None


def generate_other_commit_message(other_items: list[dict[str, Any]]) -> str:
    """Generates an intuitive, readable commit message for non-content project files."""
    if not other_items:
        return "chore: update project files"
    names = []
    for it in other_items:
        p = it["path"]
        parts = p.split("/")
        if len(parts) > 2:
            names.append(f"{parts[0]}/.../{parts[-1]}")
        else:
            names.append(p)
    if len(names) == 1:
        return f"chore: update {names[0]}"
    elif len(names) <= 3:
        return f"chore: update {', '.join(names)}"
    else:
        return f"chore: update {', '.join(names[:2])}, and {len(names) - 2} more"


def get_pending_publish_count(root_dir: Optional[Path] = None) -> int:
    """Returns the count of uncommitted/untracked files in public/content plus unpushed commits."""
    cwd = root_dir or ROOT_DIR
    count = 0
    try:
        res = subprocess.run(
            ["git", "status", "--porcelain", "public/content"],
            capture_output=True,
            text=True,
            cwd=cwd,
            check=False,
        )
        if res.returncode == 0:
            lines = [ln.strip() for ln in res.stdout.splitlines() if ln.strip()]
            count += len(lines)
    except Exception:
        count += len(get_pending_ops())

    try:
        unpushed = get_unpushed_commits(cwd)
        count += len(unpushed)
    except Exception:
        pass
    return count


def build_commit_message(pending_ops: list[str], git_summary: str) -> str:
    """Builds a concise, readable commit message for content publish."""
    if pending_ops:
        count = len(pending_ops)
        if count == 1:
            return f"content: {pending_ops[0]}"
        elif count <= 3:
            return f"content: {', '.join(pending_ops)} ({count} items)"
        else:
            first_few = ", ".join(pending_ops[:2])
            return f"content: {first_few}, and {count - 2} more ({count} items)"
    return f"content: update {git_summary}"


class IngestCLI:
    def __init__(
        self,
        storage: StorageBackend,
        target: str = "site",
        dry_run: bool = False,
        auto_yes: bool = False,
        git_dir: Optional[Path] = None,
        include_all: bool = False,
        content_only: bool = False,
        no_check: bool = False,
    ):
        self.storage = storage
        self.target = target
        self.dry_run = dry_run
        self.auto_yes = auto_yes
        self.git_dir = Path(git_dir).resolve() if git_dir else ROOT_DIR
        self.include_all = include_all
        self.content_only = content_only
        self.no_check = no_check
        Agent1Normalize.clean_all_staging()
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

    def action_init(self, silent: bool = False, commit: bool = True) -> bool:
        """Initializes empty bootstrap files in the chosen target (index.json and search-index.json)."""
        if not silent:
            console.print(Panel(f"[bold]Initialize Content Repository Bootstrap Files ({self.target})[/bold]", style="cyan"))

        index_data, _ = self.storage.get_json("index.json")

        if self.dry_run:
            console.print("[yellow]Dry-run mode: would create index.json ({version: 1, modules: []}) and search-index.json ([]).[/yellow]")
            return True

        if index_data is not None and not self.auto_yes and not silent:
            if not questionary.confirm("index.json already exists in target storage. Re-initialize to empty slate?").ask():
                console.print("[yellow]Initialization cancelled.[/yellow]")
                return False

        now_iso = datetime.now(timezone.utc).isoformat()
        empty_index = {
            "version": "1",
            "updatedAt": now_iso,
            "modules": [],
        }
        empty_search: list[dict] = []

        self.storage.put_json("index.json", empty_index, cache="manifest")
        self.storage.put_json("search-index.json", empty_search, cache="manifest")

        # In site mode (or when storage root is public/content), stage & commit bootstrap files
        if self.target == "site" and commit:
            try:
                chk = subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], capture_output=True, text=True, cwd=ROOT_DIR)
                if chk.returncode == 0 and "true" in chk.stdout:
                    stat = subprocess.run(["git", "status", "--porcelain", "public/content"], capture_output=True, text=True, cwd=ROOT_DIR)
                    if stat.stdout.strip():
                        subprocess.run(["git", "add", "public/content"], cwd=ROOT_DIR, check=True)
                        subprocess.run(["git", "commit", "-m", "chore: initialize content repository"], cwd=ROOT_DIR, check=True)
                        if not silent:
                            console.print("[green]Committed bootstrap files to git repository.[/green]")
            except Exception as e:
                log.warning(f"Git commit failed during init: {e}")

        log_pending_op("initialize content repository")
        if not silent:
            console.print("[bold green]Successfully initialized repository bootstrap files: index.json and search-index.json[/bold green]")
        return True

    def run_project_checks(self, cwd: Optional[Path] = None) -> tuple[bool, str]:
        """Runs npm run typecheck and npm run build before committing non-content files."""
        target_dir = cwd or self.git_dir
        pkg_json = target_dir / "package.json"
        if not pkg_json.is_file():
            return True, "No package.json found"

        tc_res = subprocess.run(
            "npm run typecheck",
            shell=True,
            capture_output=True,
            text=True,
            cwd=target_dir,
        )
        if tc_res.returncode != 0:
            err = tc_res.stderr.strip() or tc_res.stdout.strip()
            return False, f"npm run typecheck failed:\n{err}"

        build_res = subprocess.run(
            "npm run build",
            shell=True,
            capture_output=True,
            text=True,
            cwd=target_dir,
        )
        if build_res.returncode != 0:
            err = build_res.stderr.strip() or build_res.stdout.strip()
            return False, f"npm run build failed:\n{err}"

        return True, "Typecheck and build succeeded"

    def perform_git_push(self, cwd: Path) -> tuple[bool, Optional[str]]:
        """Handles fetch, rebase on upstream commits, and pushing to remote."""
        remotes_proc = subprocess.run(["git", "remote"], capture_output=True, text=True, cwd=cwd)
        remotes = [r.strip() for r in remotes_proc.stdout.splitlines() if r.strip()]
        if not remotes:
            return False, "No git remote configured on this repository."

        remote_name = "origin" if "origin" in remotes else remotes[0]

        branch_proc = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, cwd=cwd)
        current_branch = branch_proc.stdout.strip() or "main"

        # 1. Fetch
        fetch_proc = subprocess.run(["git", "fetch", remote_name], capture_output=True, text=True, cwd=cwd)
        if fetch_proc.returncode == 0:
            rev_chk = subprocess.run(
                ["git", "rev-list", f"HEAD..{remote_name}/{current_branch}", "--count"],
                capture_output=True,
                text=True,
                cwd=cwd,
            )
            if rev_chk.returncode == 0:
                behind_count = int(rev_chk.stdout.strip() or "0")
                if behind_count > 0:
                    console.print(f"[yellow]Remote has {behind_count} new commit(s). Running 'git pull --rebase' to integrate remote changes...[/yellow]")
                    rebase_proc = subprocess.run(
                        ["git", "pull", "--rebase", remote_name, current_branch],
                        capture_output=True,
                        text=True,
                        cwd=cwd,
                    )
                    if rebase_proc.returncode != 0:
                        subprocess.run(["git", "rebase", "--abort"], cwd=cwd, capture_output=True)
                        err_instructions = (
                            f"A merge conflict occurred during 'git pull --rebase {remote_name} {current_branch}'.\n"
                            "The rebase has been automatically aborted to preserve your work.\n\n"
                            "To resolve:\n"
                            f"  1. Run: git pull --no-rebase {remote_name} {current_branch}\n"
                            "  2. Open and resolve any conflict markers (<<<<<<< / ======= / >>>>>>>).\n"
                            f"  3. Run: git commit -m 'merge remote {current_branch}'\n"
                            "  4. Re-run: python ingest.py publish"
                        )
                        return False, err_instructions
                    console.print("[green]Rebase completed cleanly.[/green]")

        # 2. Push
        push_proc = subprocess.run(["git", "push", "-u", remote_name, current_branch], capture_output=True, text=True, cwd=cwd)
        if push_proc.returncode != 0:
            err = push_proc.stderr.strip() or push_proc.stdout.strip()
            return False, f"'git push' failed: {err}"

        return True, None

    def action_publish(
        self,
        include_all: Optional[bool] = None,
        content_only: Optional[bool] = None,
        no_check: Optional[bool] = None,
    ) -> bool:
        """Publishes pending content and project changes via Git commit and push to Cloudflare Workers."""
        console.print(Panel("[bold]Publish to Cloudflare Workers Static Assets[/bold]", style="cyan"))
        target_dir = self.git_dir

        # 1. Verify inside git repo
        try:
            chk = subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], capture_output=True, text=True, cwd=target_dir)
            if chk.returncode != 0 or "true" not in chk.stdout:
                console.print("[bold red]Error:[/bold red] Not inside a Git repository. Publish requires Git.")
                return False
        except FileNotFoundError:
            console.print("[bold red]Error:[/bold red] Git executable not found on PATH.")
            return False

        # 2. Partition pending changes & check unpushed commits
        content_items, other_items = get_git_status_partitions(target_dir)
        unpushed_commits = get_unpushed_commits(target_dir)

        if not content_items and not other_items and not unpushed_commits:
            console.print("[yellow]Nothing to publish: no uncommitted changes and all local commits are already on GitHub.[/yellow]")
            return True

        content_size = sum(it["size"] for it in content_items)
        other_size = sum(it["size"] for it in other_items)

        # 3. Determine flags
        flag_all = include_all if include_all is not None else self.include_all
        flag_content_only = content_only if content_only is not None else self.content_only
        flag_no_check = no_check if no_check is not None else self.no_check

        # 4. Display lists clearly
        if content_items:
            console.print(f"\n[bold]Content Changes (public/content):[/bold] {len(content_items)} file(s) ({format_file_size(content_size)})")
            for it in content_items[:10]:
                console.print(f"  • [{it['status']}] {it['path']} ({format_file_size(it['size'])})")
            if len(content_items) > 10:
                console.print(f"  ... and {len(content_items) - 10} more")

        if other_items:
            console.print(f"\n[bold]Other Project Changes (code, docs, configs):[/bold] {len(other_items)} file(s) ({format_file_size(other_size)})")
            for it in other_items[:10]:
                console.print(f"  • [{it['status']}] {it['path']} ({format_file_size(it['size'])})")
            if len(other_items) > 10:
                console.print(f"  ... and {len(other_items) - 10} more")

        if unpushed_commits:
            console.print(f"\n[bold cyan]Unpushed Local Commits ({len(unpushed_commits)} not yet on GitHub):[/bold cyan]")
            for c in unpushed_commits[:5]:
                console.print(f"  • {c}")
            if len(unpushed_commits) > 5:
                console.print(f"  ... and {len(unpushed_commits) - 5} more")

        # 5. Decide whether to include other files
        include_other = False
        if other_items:
            if flag_all:
                include_other = True
            elif flag_content_only:
                include_other = False
            elif not content_items:
                # Only other files exist
                if self.auto_yes:
                    include_other = True
                else:
                    ans = questionary.confirm(f"Publish {len(other_items)} changed project file(s)?").ask()
                    include_other = bool(ans)
                    if not include_other and not unpushed_commits:
                        console.print("[yellow]Publish cancelled.[/yellow]")
                        return False
            else:
                # Both content and other files exist
                if self.auto_yes:
                    include_other = False
                else:
                    snippet_names = [it["path"].split("/")[-1] for it in other_items[:3]]
                    snippet_str = ", ".join(snippet_names)
                    if len(other_items) > 3:
                        snippet_str += ", ..."
                    choice = questionary.select(
                        f"Also include {len(other_items)} other changed files ({snippet_str})?",
                        choices=["Yes, include everything", "No, content only"]
                    ).ask()
                    include_other = (choice == "Yes, include everything")

        # 6. Safety Rails Check on items scheduled to be staged
        to_stage: list[dict[str, Any]] = []
        if content_items:
            to_stage.extend(content_items)
        if include_other:
            to_stage.extend(other_items)

        forbidden_items = [it for it in to_stage if it.get("is_forbidden")]
        if forbidden_items:
            console.print("\n[bold red]Safety Error: Publish blocked by safety rails.[/bold red]")
            console.print("The following files cannot be committed or deployed:\n")
            for it in forbidden_items:
                console.print(f"  • [red]{it['path']}[/red]: {it['forbidden_reason']}")
            console.print("\n[yellow]Resolution:[/yellow]")
            console.print("  1. Remove sensitive or temporary files.")
            console.print("  2. Ensure secret files (.env*) and build directories are listed in .gitignore.")
            console.print("  3. For large binary files (> 25 MiB), compress or host externally (e.g. Cloudflare R2).\n")
            return False

        # 7. Code Validation when non-content files are included
        if include_other and not flag_no_check:
            ok, check_err = self.run_project_checks(target_dir)
            if not ok:
                console.print(f"\n[bold red]Code Validation Failed:[/bold red]\n{check_err}\n")
                if content_items:
                    if not self.auto_yes:
                        offer = questionary.select(
                            "Non-content build check failed. How would you like to proceed?",
                            choices=[
                                "Publish content only (ignore code changes for now)",
                                "Abort publish (fix code errors first)",
                            ]
                        ).ask()
                        if offer == "Publish content only (ignore code changes for now)":
                            include_other = False
                        else:
                            console.print("[dim]Publish aborted.[/dim]")
                            return False
                    else:
                        console.print("[red]Aborting publish due to build failure.[/red]")
                        return False
                else:
                    console.print("[red]Aborting publish due to build failure.[/red]")
                    return False

        # 8. Prepare commit messages
        other_msg = ""
        if include_other:
            default_other = generate_other_commit_message(other_items)
            if self.auto_yes:
                other_msg = default_other
            else:
                other_msg = questionary.text("Commit message for other changes:", default=default_other).ask() or default_other

        content_msg = ""
        if content_items:
            pending_ops = get_pending_ops()
            content_msg = build_commit_message(pending_ops, f"{len(content_items)} file(s)")

        # 9. Dry-run display
        if self.dry_run:
            console.print("\n[bold yellow]═══ Dry-Run Publish Plan (no changes will be written) ═══[/bold yellow]")
            if include_other:
                console.print(f"\n[bold]1. Non-Content Commit:[/bold]")
                console.print(f"   Files: {len(other_items)} ({format_file_size(other_size)})")
                console.print(f"   Message: [cyan]{other_msg}[/cyan]")
                check_status = "Skipped (--no-check)" if flag_no_check else "Would run: npm run typecheck && npm run build"
                console.print(f"   Build Check: {check_status}")
            if content_items:
                console.print(f"\n[bold]2. Content Commit:[/bold]")
                console.print(f"   Files: {len(content_items)} ({format_file_size(content_size)})")
                console.print(f"   Message: [cyan]{content_msg}[/cyan]")
            if unpushed_commits:
                console.print(f"\n[bold]3. Unpushed Commits:[/bold] {len(unpushed_commits)} commit(s) already committed locally")
            console.print(f"\n[bold]Push Action:[/bold] Would fetch remote, rebase if needed, and push to remote repository.")
            console.print("[bold yellow]═══════════════════════════════════════════════════════════[/bold yellow]\n")
            return True

        # 10. Confirmation before executing
        if not self.auto_yes:
            summary_actions = []
            if include_other: summary_actions.append("non-content commit")
            if content_items: summary_actions.append("content commit")
            summary_str = " and ".join(summary_actions) if summary_actions else "push unpushed commits"
            if not questionary.confirm(f"Proceed with {summary_str} and push to remote?").ask():
                console.print("[yellow]Publish cancelled by user.[/yellow]")
                return False

        committed_hashes: list[tuple[str, str]] = []

        # 11. Execute Commit 1: non-content changes
        if include_other:
            try:
                for it in other_items:
                    subprocess.run(["git", "add", it["path"]], cwd=target_dir, check=True)
                subprocess.run(["git", "commit", "-m", other_msg], cwd=target_dir, check=True)
                h_res = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=target_dir)
                committed_hashes.append((h_res.stdout.strip(), other_msg))
                console.print(f"[green]Committed project changes:[/green] [cyan]{h_res.stdout.strip()}[/cyan] ({other_msg})")
            except subprocess.CalledProcessError as e:
                console.print(f"[bold red]Git commit for project changes failed:[/bold red] {e}")
                return False

        # 12. Execute Commit 2: content changes
        if content_items:
            try:
                subprocess.run(["git", "add", "public/content"], cwd=target_dir, check=True)
                subprocess.run(["git", "commit", "-m", content_msg], cwd=target_dir, check=True)
                h_res = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=target_dir)
                committed_hashes.append((h_res.stdout.strip(), content_msg))
                console.print(f"[green]Committed content changes:[/green] [cyan]{h_res.stdout.strip()}[/cyan] ({content_msg})")
            except subprocess.CalledProcessError as e:
                console.print(f"[bold red]Git commit for content changes failed:[/bold red] {e}")
                return False
            clear_pending_ops()

        # 13. Execute Push
        push_ok, push_err = self.perform_git_push(target_dir)
        if push_ok:
            console.print("\n[bold green]Successfully pushed to GitHub![/bold green]")
            for h, msg in committed_hashes:
                url = get_github_commit_url(target_dir, h)
                if url:
                    console.print(f"  • Commit [cyan]{h}[/cyan] ({msg}): [underline]{url}[/underline]")
                else:
                    console.print(f"  • Commit [cyan]{h}[/cyan] ({msg})")

            if not committed_hashes and unpushed_commits:
                head_h = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=target_dir).stdout.strip()
                url = get_github_commit_url(target_dir, head_h)
                if url:
                    console.print(f"  • Pushed HEAD [cyan]{head_h}[/cyan]: [underline]{url}[/underline]")
                else:
                    console.print(f"  • Pushed HEAD [cyan]{head_h}[/cyan]")

            console.print("\n[bold cyan]Cloudflare Deployment:[/bold cyan]")
            console.print("  Cloudflare Workers will build and deploy automatically.")
            console.print("  Watch live build progress: [bold]Workers & Pages -> Your Project -> Deployments[/bold]")
            console.print("  Free Workers Builds: 3,000 build minutes/month (~1-2 min per publish).\n")
            return True
        else:
            if push_err and "conflict occurred" in str(push_err).lower():
                console.print(f"\n[bold red]Push Blocked:[/bold red]\n{push_err}\n")
                return False
            elif committed_hashes:
                console.print(f"\n[bold yellow]Push Status:[/bold yellow] Changes are safely committed locally, but could not be pushed:\n{push_err}\n")
                console.print("When network or remote is ready, run: [bold]git push[/bold] or [bold]python ingest.py publish[/bold]")
                return True
            else:
                console.print(f"\n[bold yellow]Push Status:[/bold yellow] Could not push unpushed commits:\n{push_err}\n")
                return False

    def action_stats(self) -> None:
        """Scans storage and reports file count, sizes, and Cloudflare limit consumption."""
        console.print(Panel("[bold]Content Storage Statistics & Cloudflare Limits[/bold]", style="cyan"))

        files_info: list[tuple[str, int]] = []
        total_size = 0

        # Scan storage keys
        try:
            keys = self.storage.list("")
            for k in keys:
                meta = self.storage.head(k)
                if meta and "size" in meta:
                    sz = int(meta["size"])
                    files_info.append((k, sz))
                    total_size += sz
        except Exception as e:
            console.print(f"[red]Error scanning storage:[/red] {e}")
            return

        total_files = len(files_info)
        files_info.sort(key=lambda x: x[1], reverse=True)
        top_5 = files_info[:5]

        # Table of Summary
        table = Table(title="Storage Overview", style="cyan")
        table.add_column("Metric", style="bold")
        table.add_column("Value")
        table.add_row("Total Files", f"{total_files:,}")
        table.add_row("Total Content Size", f"{total_size / (1024 * 1024):.2f} MB ({total_size:,} bytes)")
        if self.target == "site":
            table.add_row("Target Storage", "public/content (Cloudflare Workers Static Assets)")
        elif self.target == "local":
            table.add_row("Target Storage", "dev-content (local sandbox)")
        else:
            table.add_row("Target Storage", "Cloudflare R2 Bucket")

        console.print(table)

        # Top 5 Largest Files
        if top_5:
            top_table = Table(title="Top 5 Largest Files", style="blue")
            top_table.add_column("Path", style="cyan")
            top_table.add_column("Size", justify="right")
            for p, sz in top_5:
                top_table.add_row(p, f"{sz / (1024 * 1024):.2f} MB ({sz:,} B)")
            console.print(top_table)

        # Cloudflare Limits Check
        pct_files = (total_files / PAGES_MAX_FILES) * 100
        max_file_size = top_5[0][1] if top_5 else 0
        pct_max_file = (max_file_size / PAGES_MAX_FILE_SIZE_BYTES) * 100

        limits_table = Table(title="Cloudflare Free Tier Limits", style="magenta")
        limits_table.add_column("Limit", style="bold")
        limits_table.add_column("Current / Max", justify="right")
        limits_table.add_column("Usage %", justify="right")
        limits_table.add_column("Status")

        # Files status
        files_status = "[green]OK[/green]"
        if total_files > PAGES_HARD_WARN_FILES:
            files_status = "[bold red]CRITICAL (>75%)[/bold red]"
        elif total_files > PAGES_WARN_FILES:
            files_status = "[bold yellow]WARNING (>70%)[/bold yellow]"

        limits_table.add_row(
            "File Count",
            f"{total_files:,} / {PAGES_MAX_FILES:,}",
            f"{pct_files:.1f}%",
            files_status,
        )

        # Max file size status
        file_sz_status = "[green]OK[/green]"
        if max_file_size > PAGES_MAX_FILE_SIZE_BYTES:
            file_sz_status = "[bold red]EXCEEDED (>25 MB)[/bold red]"
        elif max_file_size > 20 * 1024 * 1024:
            file_sz_status = "[bold red]CRITICAL (>20 MB)[/bold red]"
        elif max_file_size > PAGES_WARN_FILE_SIZE_BYTES:
            file_sz_status = "[bold yellow]WARNING (>10 MB)[/bold yellow]"

        limits_table.add_row(
            "Largest Single File",
            f"{max_file_size / (1024 * 1024):.2f} MB / 25.00 MB",
            f"{pct_max_file:.1f}%",
            file_sz_status,
        )

        console.print(limits_table)

        # Warnings if thresholds exceeded
        if total_files > PAGES_HARD_WARN_FILES:
            console.print(f"[bold red]Warning: Total file count ({total_files:,}) exceeds 75% of Cloudflare limit (20,000 files).[/bold red]")
        elif total_files > PAGES_WARN_FILES:
            console.print(f"[bold yellow]Warning: Total file count ({total_files:,}) is approaching Cloudflare limit (20,000 files).[/bold yellow]")

        if max_file_size > PAGES_WARN_FILE_SIZE_BYTES:
            console.print(f"[bold yellow]Warning: Largest file ({max_file_size / (1024 * 1024):.1f} MB) exceeds 10 MB safety threshold.[/bold yellow]")

        # Git repository size
        try:
            chk = subprocess.run(["git", "count-objects", "-vH"], capture_output=True, text=True, cwd=ROOT_DIR)
            if chk.returncode == 0:
                for line in chk.stdout.splitlines():
                    if line.startswith("size:"):
                        console.print(f"[dim]Approximate git repo object size: {line.split(':', 1)[1].strip()}[/dim]")
        except Exception:
            pass

        console.print("[dim]Tip: Cloudflare Workers static assets free tier includes 3,000 build minutes/month, 20,000 files, and 25 MiB per file with unlimited free requests. Deleted and replaced files remain in your Git history; use external storage (R2) if your repo exceeds 1-2 GB.[/dim]")

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

        log_pending_op(f"create module '{slug}'")
        console.print(f"[bold green]Successfully created module '{title}' ({slug})![/bold green]")
        return True

    def action_create_day(
        self,
        module_slug: Optional[str] = None,
        day_number: Optional[int] = None,
        title: Optional[str] = None,
        subtitle: Optional[str] = None,
        description: Optional[str] = None,
        recap: Optional[str] = None,
    ) -> None:
        console.print(Panel("[bold]Create a Course Day[/bold]", style="cyan"))
        slug = module_slug or self.select_module()
        if not slug: return

        manifest, _ = self.storage.get_json(f"modules/{slug}/manifest.json")

        if day_number is not None:
            day_num = day_number
            title = title or f"Day {day_num}"
            subtitle = subtitle or ""
            description = description or ""
            recap = recap or ""
        else:
            proposed_num = self.agent3.get_next_day_number(slug)
            day_str = questionary.text("Day Number:", default=str(proposed_num)).ask()
            if not day_str or not day_str.isdigit(): return
            day_num = int(day_str)

            # Check conflict
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

        log_pending_op(f"create Day {day_num} in '{slug}'")
        console.print(f"[bold green]Successfully created/updated Day {day_num} in '{slug}'![/bold green]")

    def action_add_summary(
        self,
        module_slug: Optional[str] = None,
        day_number: Optional[int] = None,
        file_path_override: Optional[str] = None,
    ) -> None:
        self.agent1.new_run()
        try:
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
                    return
            elif not self.auto_yes and not questionary.confirm("Upload summary?").ask():
                return

            if self.dry_run:
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

            log_pending_op(f"add Day {day_num} summary in '{slug}'")
            console.print(f"[bold green]Summary successfully uploaded to Day {day_num}![/bold green]")
        finally:
            self.agent1.cleanup()

    def action_add_transcript(
        self,
        module_slug: Optional[str] = None,
        day_number: Optional[int] = None,
        order: Optional[int] = None,
        title: Optional[str] = None,
        file_path_override: Optional[str] = None,
    ) -> None:
        self.agent1.new_run()
        try:
            console.print(Panel("[bold]Add a Transcript[/bold]", style="cyan"))
            slug = module_slug or self.select_module()
            if not slug: return
            day_num = day_number if day_number is not None else self.select_day(slug)
            if day_num is None: return

            if order is None:
                proposed_order = self.agent3.get_next_transcript_order(slug, day_num)
                order_str = questionary.text("Transcript Order:", default=str(proposed_order)).ask()
                if not order_str or not order_str.isdigit(): return
                order_val = int(order_str)
            else:
                order_val = order

            if title is None:
                t_title = questionary.text("Transcript Title (e.g. Morning Session):", default=f"Transcript {order_val}").ask()
                if not t_title: return
            else:
                t_title = title

            file_path = file_path_override or pick_single_file("Select Transcript Document (.docx, .md, .txt)")
            staged = self.agent1.process(file_path)

            dest_key = Agent2Placement.transcript_key(slug, day_num, order_val, staged.format)
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
                    return
            elif not self.auto_yes and not questionary.confirm("Upload transcript?").ask():
                return

            if self.dry_run:
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
                "id": f"t-{order_val}",
                "order": order_val,
                "title": t_title,
                "file": {
                    "path": dest_key,
                    "format": staged.format,
                    "sizeBytes": staged.size_bytes,
                    "hash": staged.sha256_short,
                    "updatedAt": staged.updated_at,
                },
            }
            existing_idx = next((i for i, t in enumerate(transcripts) if t.get("order") == order_val), None)
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

            log_pending_op(f"add transcript '{t_title}' to Day {day_num}")
            console.print(f"[bold green]Transcript {order_val} ('{t_title}') successfully added to Day {day_num}![/bold green]")
        finally:
            self.agent1.cleanup()

    def action_add_board_photo(
        self,
        module_slug: Optional[str] = None,
        day_number: Optional[int] = None,
        caption: Optional[str] = None,
        file_path_override: Optional[str] = None,
    ) -> None:
        self.agent1.new_run()
        try:
            console.print(Panel("[bold]Add Class Board Photo[/bold]", style="cyan"))
            slug = module_slug or self.select_module()
            if not slug: return
            day_num = day_number if day_number is not None else self.select_day(slug)
            if day_num is None: return

            proposed_idx = self.agent3.get_next_board_number(slug, day_num)
            if caption is None:
                b_caption = questionary.text("Board Photo Caption / Topic:", default=f"Board Work {proposed_idx}").ask() or ""
            else:
                b_caption = caption

            file_path = file_path_override or pick_single_file("Select Board Photo (JPG, PNG, WebP, HEIC)")
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
                return

            if self.dry_run:
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
                "caption": b_caption,
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

            log_pending_op(f"add board photo to Day {day_num}")
            console.print(f"[bold green]Board photo successfully uploaded to Day {day_num}![/bold green]")
        finally:
            self.agent1.cleanup()

    def action_add_questions(
        self,
        module_slug: Optional[str] = None,
        day_number: Optional[int] = None,
        file_path_override: Optional[str] = None,
    ) -> None:
        console.print(Panel("[bold]Add Questions & Answers to a Day[/bold]", style="cyan"))
        slug = module_slug or self.select_module()
        if not slug: return
        day_num = day_number if day_number is not None else self.select_day(slug)
        if day_num is None: return

        parsed_questions: list[dict[str, Any]] = []

        if file_path_override:
            file_path = Path(file_path_override).resolve()
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
            mode = questionary.select(
                "Question Input Mode:",
                choices=[
                    "Upload structured file (.md or .json)",
                    "Add a single question interactively"
                ]
            ).ask()

            if mode and mode.startswith("Upload"):
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
            elif mode:
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
            else:
                return

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

        log_pending_op(f"add {len(parsed_questions)} questions to Day {day_num}")
        console.print(f"[bold green]Successfully merged {len(parsed_questions)} questions into Day {day_num}![/bold green]")

    def action_add_link(
        self,
        module_slug: Optional[str] = None,
        day_number: Optional[int] = None,
        url: Optional[str] = None,
        label: Optional[str] = None,
        description: Optional[str] = None,
    ) -> None:
        console.print(Panel("[bold]Add External Resource Link to Day[/bold]", style="cyan"))
        slug = module_slug or self.select_module()
        if not slug: return
        day_num = day_number if day_number is not None else self.select_day(slug)
        if day_num is None: return

        if url is None:
            raw_url = questionary.text("URL (http/https):").ask()
            if not raw_url: return
            url_val = self.agent2.validate_url(raw_url)
        else:
            url_val = self.agent2.validate_url(url)

        if label is None:
            label_val = questionary.text("Link Label / Title:").ask()
            if not label_val: return
        else:
            label_val = label

        if description is None:
            desc_val = questionary.text("Description (optional):", default="").ask() or ""
        else:
            desc_val = description

        folder = Agent2Placement.day_folder(day_num)
        day_key = f"modules/{slug}/days/{folder}/day.json"

        day_json, _ = self.storage.get_json(day_key)
        if not day_json:
            day_json = {"number": day_num, "title": f"Day {day_num}", "links": []}

        links = day_json.get("links", [])
        # Dedupe by URL
        links = [l for l in links if l.get("url") != url_val]
        links.append({
            "label": label_val,
            "url": url_val,
            "description": desc_val,
        })
        day_json["links"] = links
        day_json["updatedAt"] = datetime.now(timezone.utc).isoformat()

        if self.dry_run:
            console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
            return

        self.storage.put_json(day_key, day_json, cache="manifest")
        self.agent5.recompute_manifest(slug)
        log_pending_op(f"add link '{label_val}' to Day {day_num}")
        console.print(f"[bold green]Link '{label_val}' successfully added to Day {day_num}![/bold green]")

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

        log_pending_op(f"create Lab {lab_id} in '{slug}'")
        console.print(f"[bold green]Successfully created Lab {lab_id} ('{title}')![/bold green]")

    def action_add_lab_notes(
        self,
        module_slug: Optional[str] = None,
        lab_id: Optional[str] = None,
        file_path_override: Optional[str] = None,
    ) -> None:
        self.agent1.new_run()
        try:
            console.print(Panel("[bold]Add Ingested Notes to Lab[/bold]", style="cyan"))
            slug = module_slug or self.select_module()
            if not slug: return
            target_lab = lab_id or self.select_lab(slug)
            if not target_lab: return

            file_path = file_path_override or pick_single_file("Select Lab Notes (.docx, .md, .html)")
            staged = self.agent1.process(file_path)

            dest_key = Agent2Placement.lab_notes_key(slug, target_lab, staged.format)
            console.print(f"Destination: [cyan]{dest_key}[/cyan] ({staged.size_bytes} B)")

            if not self.auto_yes and not questionary.confirm("Upload notes?").ask():
                return

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return

            backup_dir = self.agent2.create_backup_dir()
            lab_key = f"modules/{slug}/labs/{target_lab}/lab.json"
            b_lab = self.agent2.backup_json_file(lab_key, backup_dir)
            b_man = self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)

            change_set = ChangeSet(
                timestamp=datetime.now(timezone.utc).isoformat(),
                operation="add_lab_notes",
                module_slug=slug,
                backup_files={k: str(v) for k, v in [(lab_key, b_lab), (f"modules/{slug}/manifest.json", b_man)] if v},
            )

            self.storage.put_file(dest_key, staged.staged_file, get_content_type(dest_key), cache="immutable")
            change_set.uploaded_keys.append(dest_key)
            (backup_dir / "__changeset__.json").write_text(
                json.dumps({"operation": "add_lab_notes", "uploaded_keys": change_set.uploaded_keys}),
                encoding="utf-8"
            )

            lab_json, _ = self.storage.get_json(lab_key)
            if not lab_json:
                lab_json = {"id": target_lab, "number": 1, "category": "hands-on", "title": target_lab}

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

            log_pending_op(f"add notes to Lab {target_lab}")
            console.print(f"[bold green]Lab notes successfully uploaded to {target_lab}![/bold green]")
        finally:
            self.agent1.cleanup()

    def action_add_lab_doodle(
        self,
        module_slug: Optional[str] = None,
        lab_id: Optional[str] = None,
        file_path_override: Optional[str] = None,
    ) -> None:
        self.agent1.new_run()
        try:
            console.print(Panel("[bold]Add Architectural Doodle to Lab[/bold]", style="cyan"))
            slug = module_slug or self.select_module()
            if not slug: return
            target_lab = lab_id or self.select_lab(slug)
            if not target_lab: return

            file_path = file_path_override or pick_single_file("Select Lab Doodle / Sketch (JPG, PNG, WebP, SVG)")
            staged = self.agent1.process(file_path)

            dest_img_key = Agent2Placement.lab_doodle_key(slug, target_lab, is_thumb=False, ext=staged.format)
            dest_thumb_key = Agent2Placement.lab_doodle_key(slug, target_lab, is_thumb=True, ext=staged.format)

            console.print(f"Destination: [cyan]{dest_img_key}[/cyan] ({staged.width}x{staged.height})")

            if not self.auto_yes and not questionary.confirm("Upload doodle?").ask():
                return

            if self.dry_run:
                console.print("[yellow]Dry-run mode: no changes written.[/yellow]")
                return

            backup_dir = self.agent2.create_backup_dir()
            lab_key = f"modules/{slug}/labs/{target_lab}/lab.json"
            b_lab = self.agent2.backup_json_file(lab_key, backup_dir)
            b_vis = self.agent2.backup_json_file(f"modules/{slug}/visuals.json", backup_dir)
            b_man = self.agent2.backup_json_file(f"modules/{slug}/manifest.json", backup_dir)

            change_set = ChangeSet(
                timestamp=datetime.now(timezone.utc).isoformat(),
                operation="add_lab_doodle",
                module_slug=slug,
                backup_files={k: str(v) for k, v in [(lab_key, b_lab), (f"modules/{slug}/visuals.json", b_vis), (f"modules/{slug}/manifest.json", b_man)] if v},
            )

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
                lab_json = {"id": target_lab, "number": 1, "category": "hands-on", "title": target_lab}

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

            log_pending_op(f"add doodle to Lab {target_lab}")
            console.print(f"[bold green]Lab doodle successfully attached to {target_lab}![/bold green]")
        finally:
            self.agent1.cleanup()

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
        pending_count = get_pending_publish_count()
        header_text = (
            f"[bold cyan]AI-13 Course Notes Ingest Tool[/bold cyan]\n"
            f"[dim]One-Item-at-a-Time Content Publisher | Target: [bold]{self.target}[/bold]"
        )
        if self.target == "site":
            header_text += f" | [yellow]{pending_count} pending publish[/yellow]"
        header_text += "[/dim]"
        console.print(Panel(header_text, style="blue"))

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
                self.agent1.new_run()
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
                finally:
                    self.agent1.cleanup()
            except KeyboardInterrupt:
                console.print("\n[yellow]Operation canceled by user.[/yellow]")
            except Exception as e:
                console.print(f"\n[bold red]Error:[/bold red] {e}")
                log.exception("Error in wizard action")

            console.print("")
            if self.target == "site":
                next_choice = questionary.select(
                    "What next?",
                    choices=[
                        "Add another item",
                        "Publish now (git push to Cloudflare Workers)",
                        "Done for now (publish later)",
                    ],
                ).ask()

                if next_choice == "Publish now (git push to Cloudflare Workers)":
                    self.action_publish()
                    console.print("[dim]Publish completed. Have a great day![/dim]")
                    break
                elif next_choice == "Done for now (publish later)":
                    p_count = get_pending_publish_count()
                    console.print(f"[yellow]You have {p_count} item(s) pending publish. Run `python ingest.py publish` when ready.[/yellow]")
                    break
                elif not next_choice:
                    break
            else:
                if not questionary.confirm("Add another item?").ask():
                    console.print("[dim]Ingest session finished. Have a great day![/dim]")
                    break


def main() -> None:
    parser = argparse.ArgumentParser(description="AI-13 Course Portal Content Ingest CLI")
    parser.add_argument(
        "subcommand",
        nargs="?",
        default="wizard",
        choices=[
            "wizard",
            "init",
            "publish",
            "stats",
            "check-connection",
            "list",
            "verify",
            "rebuild-index",
            "undo",
            "questions-template",
            "remove",
        ],
    )
    default_target = get_default_target()
    parser.add_argument(
        "--target",
        choices=["site", "r2", "local"],
        default=default_target,
        help=f"Storage target (site | r2 | local, default: {default_target})",
    )
    parser.add_argument("--root", default=None, help="Root directory for local storage target")
    parser.add_argument("--module", default=None, help="Target module slug for verify")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without writing")
    parser.add_argument("--yes", action="store_true", help="Auto-confirm non-destructive prompts")
    parser.add_argument("--all", action="store_true", dest="include_all", help="Publish all pending changes (content + code/docs) without asking")
    parser.add_argument("--content-only", action="store_true", help="Publish only public/content without asking")
    parser.add_argument("--no-check", action="store_true", help="Skip npm run typecheck and npm run build before committing non-content files")
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
    cli = IngestCLI(
        storage,
        target=args.target,
        dry_run=args.dry_run,
        auto_yes=args.yes,
        include_all=args.include_all,
        content_only=args.content_only,
        no_check=args.no_check,
    )

    if args.subcommand == "publish":
        cli.action_publish()

    elif args.subcommand == "stats":
        cli.action_stats()

    elif args.subcommand == "check-connection":
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

        pending_count = get_pending_publish_count() if args.target == "site" else 0
        header = f"[bold cyan]Course Portal Content Tree[/bold cyan] [dim](Target: {args.target}"
        if args.target == "site":
            header += f" | {pending_count} pending publish"
        header += ")[/dim]"
        tree = Tree(header)
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

        if cli.dry_run:
            console.print("[yellow]Dry-run mode: would restore this backup and delete newly uploaded files. No changes written.[/yellow]")
            return

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

