"""Local disk storage backend (e.g. ./dev-content)."""

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Union
from ingest.storage.base import StorageBackend, ConcurrencyError


class LocalStorage(StorageBackend):
    def __init__(self, root_dir: Union[Path, str]):
        self.root = Path(root_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, key: str) -> Path:
        clean = key.strip().lstrip("/").replace("\\", "/")
        return self.root / clean

    def _calc_etag(self, content_bytes: bytes) -> str:
        return f'"{hashlib.sha256(content_bytes).hexdigest()[:16]}"'

    def get_json(self, key: str) -> tuple[Optional[Union[dict, list]], Optional[str]]:
        path = self._resolve(key)
        if not path.is_file():
            return None, None

        raw = path.read_bytes()
        etag = self._calc_etag(raw)
        data = json.loads(raw.decode("utf-8"))
        return data, etag

    def put_json(
        self,
        key: str,
        data: Union[dict, list],
        cache: str = "manifest",
        if_match_etag: Optional[str] = None
    ) -> str:
        path = self._resolve(key)

        if if_match_etag and path.is_file():
            current_raw = path.read_bytes()
            current_etag = self._calc_etag(current_raw)
            if current_etag != if_match_etag:
                raise ConcurrencyError(
                    f"Conflict on {key}: current ETag {current_etag} does not match expected {if_match_etag}."
                )

        encoded = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encoded)
        return self._calc_etag(encoded)

    def put_file(
        self,
        key: str,
        local_path: Union[Path, str],
        content_type: str,
        cache: str = "immutable"
    ) -> str:
        src = Path(local_path).resolve()
        if not src.is_file():
            raise FileNotFoundError(f"Source file to put_file does not exist: {src}")

        dest = self._resolve(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        return self._calc_etag(dest.read_bytes())

    def head(self, key: str) -> Optional[dict[str, Any]]:
        path = self._resolve(key)
        if not path.is_file():
            return None

        stat = path.stat()
        raw = path.read_bytes()
        etag = self._calc_etag(raw)
        return {
            "size": stat.st_size,
            "etag": etag,
            "content_type": "application/octet-stream",
            "last_modified": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
        }

    def exists(self, key: str) -> bool:
        return self._resolve(key).is_file()

    def delete(self, key: str) -> bool:
        path = self._resolve(key)
        if path.is_file():
            path.unlink()
            parent = path.parent
            while parent != self.root and parent.is_relative_to(self.root):
                try:
                    parent.rmdir()
                    parent = parent.parent
                except OSError:
                    break
            return True
        return False

    def list(self, prefix: str = "") -> list[str]:
        clean_prefix = prefix.strip().lstrip("/").replace("\\", "/")
        results: list[str] = []

        if not self.root.exists():
            return results

        for p in self.root.rglob("*"):
            if p.is_file():
                rel = p.relative_to(self.root).as_posix()
                if rel.startswith(clean_prefix):
                    results.append(rel)

        return sorted(results)

    def get_bytes(self, key: str) -> Optional[bytes]:
        path = self._resolve(key)
        if path.is_file():
            return path.read_bytes()
        return None

