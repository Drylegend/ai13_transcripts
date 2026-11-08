"""Typed data models and structures for the Ingestion CLI."""

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional


class OperationType(str, Enum):
    CREATE_MODULE = "create-module"
    CREATE_DAY = "create-day"
    ADD_SUMMARY = "add/replace summary"
    ADD_TRANSCRIPT = "add transcript"
    ADD_BOARD_PHOTO = "add board photo"
    ADD_QUESTIONS = "add questions-set"
    ADD_LINK = "add link"
    EDIT_DAY_META = "edit day meta/recap"
    CREATE_LAB_CATEGORY = "create-lab-category"
    CREATE_LAB = "create-lab"
    ADD_LAB_NOTES = "add lab notes"
    ADD_LAB_DOODLE = "add lab doodle"
    ADD_LAB_LINK = "add lab link"
    REMOVE_ITEM = "remove item"


@dataclass
class FileRef:
    path: str
    format: str
    sizeBytes: int
    hash: str
    updatedAt: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "format": self.format,
            "sizeBytes": self.sizeBytes,
            "hash": self.hash,
            "updatedAt": self.updatedAt,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "FileRef":
        return cls(
            path=data["path"],
            format=data["format"],
            sizeBytes=data["sizeBytes"],
            hash=data["hash"],
            updatedAt=data["updatedAt"],
        )


@dataclass
class StagedItem:
    """Artifact produced by Agent 1 (Normalize & Validate)."""
    source_path: Path
    staged_file: Path
    format: str
    size_bytes: int
    sha256_short: str
    updated_at: str
    snippet: str = ""
    # Optional image properties
    width: Optional[int] = None
    height: Optional[int] = None
    staged_thumb: Optional[Path] = None
    thumb_width: Optional[int] = None
    thumb_height: Optional[int] = None


@dataclass
class OperationPlan:
    """Preview of what an operation will do."""
    op_type: OperationType
    module_slug: str
    description: str
    uploads: list[tuple[Path, str]] = field(default_factory=list) # (local_file, dest_key)
    manifest_updates: list[str] = field(default_factory=list)      # json keys to be updated
    overwrites: list[str] = field(default_factory=list)            # keys that already exist
    warnings: list[str] = field(default_factory=list)


@dataclass
class ChangeSet:
    """Tracks state changes for instant atomic rollback / undo."""
    timestamp: str
    operation: str
    module_slug: str
    backup_files: dict[str, str] = field(default_factory=dict) # storage_key -> local_backup_path
    uploaded_keys: list[str] = field(default_factory=list)     # keys uploaded during this run
    updated_json_keys: list[str] = field(default_factory=list) # manifests modified


@dataclass
class ValidationCheck:
    name: str
    passed: bool
    message: str
    key: Optional[str] = None

