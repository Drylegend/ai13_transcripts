"""Single-file picker with native Tkinter dialog and terminal fallback."""

import os
import re
from pathlib import Path
from typing import Optional
from rich.console import Console

console = Console()

FORBIDDEN_ARCHIVES = {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"}

def validate_single_file_path(raw_path: str) -> Path:
    """
    Strictly validates that the user provided exactly ONE existing regular file.
    Rejects directories, wildcards, lists, and archives with human-friendly errors.
    """
    clean = raw_path.strip().strip("'\"")

    if not clean:
        raise ValueError("No file path provided.")

    # 1. Reject multiple files (commas, multiple lines, spaces in unquoted lists)
    if "\n" in clean or "\r" in clean or "," in clean or ";" in clean:
        raise ValueError(
            "Multiple file paths detected! The Ingest tool strictly processes ONE item at a time."
        )

    # 2. Reject wildcards and globs
    if any(char in clean for char in ("*", "?", "[", "]")):
        raise ValueError(
            f"Wildcards and globs are not allowed ('{clean}'). Please provide one specific file path."
        )

    path = Path(clean).expanduser().resolve()

    # 3. Check existence
    if not path.exists():
        raise FileNotFoundError(f"File not found on disk: {path}")

    # 4. Reject directories
    if path.is_dir():
        raise ValueError(
            f"Path is a directory ('{path}'). The Ingest tool processes ONE item at a time, not folders."
        )

    # 5. Reject archives
    ext = path.suffix.lower()
    if ext in FORBIDDEN_ARCHIVES:
        raise ValueError(
            f"Archive files ({ext}) are not supported. Please extract the archive and select the individual document or image."
        )

    # 6. Reject legacy .doc
    if ext == ".doc":
        raise ValueError(
            "Legacy Word 97-2003 (.doc) binary format is not supported.\n"
            "Please open the file in Microsoft Word or LibreOffice and save it as modern '.docx'."
        )

    return path


def pick_single_file(
    title: str = "Select a Single File to Ingest",
    filetypes: Optional[list[tuple[str, str]]] = None,
) -> Path:
    """
    Opens a native file picker dialog for selecting exactly ONE file.
    Falls back to interactive terminal input if graphical environment is unavailable.
    """
    chosen_path_str: Optional[str] = None

    # Attempt native Tkinter dialog
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()           # Hide root window
        root.attributes("-topmost", True) # Bring picker to front
        root.update()

        types = filetypes or [
            ("Supported Course Files", "*.docx *.md *.txt *.pdf *.ipynb *.webp *.png *.jpg *.jpeg *.svg *.html"),
            ("All Files", "*.*")
        ]

        result = filedialog.askopenfilename(
            parent=root,
            title=title,
            filetypes=types,
            multiple=False  # Strictly single file
        )
        root.destroy()

        if result:
            chosen_path_str = str(result)
    except Exception:
        # Tkinter not available or running in headless terminal
        pass

    # Terminal fallback
    if not chosen_path_str:
        console.print(f"[bold cyan]{title}[/bold cyan]")
        console.print("[dim]Paste or type the full path to exactly ONE file (or press Ctrl+C to cancel):[/dim]")
        try:
            chosen_path_str = input("File path > ").strip()
        except (KeyboardInterrupt, EOFError):
            raise KeyboardInterrupt("Operation canceled by user.")

    return validate_single_file_path(chosen_path_str)

