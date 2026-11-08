"""Abstract storage interface for Ingest CLI."""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Optional, Union


class ConcurrencyError(Exception):
    """Raised when an optimistic concurrency ETag conflict occurs."""
    pass


class StorageBackend(ABC):
    """Unified interface for both Cloudflare R2 and Local dev-content storage."""

    @abstractmethod
    def get_json(self, key: str) -> tuple[Optional[Union[dict, list]], Optional[str]]:
        """
        Retrieves JSON data for key.
        Returns (parsed_data, etag) or (None, None) if key does not exist.
        """
        pass

    @abstractmethod
    def put_json(
        self,
        key: str,
        data: Union[dict, list],
        cache: str = "manifest",
        if_match_etag: Optional[str] = None
    ) -> str:
        """
        Stores JSON data.
        Returns the new ETag.
        Raises ConcurrencyError if if_match_etag is provided and changed.
        """
        pass

    @abstractmethod
    def put_file(
        self,
        key: str,
        local_path: Union[Path, str],
        content_type: str,
        cache: str = "immutable"
    ) -> str:
        """
        Uploads a local binary or document file.
        Returns the ETag or hash.
        """
        pass

    @abstractmethod
    def head(self, key: str) -> Optional[dict[str, Any]]:
        """
        Returns metadata for key: { size, etag, content_type, last_modified }
        or None if not found.
        """
        pass

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Returns True if the key exists in storage."""
        pass

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Deletes key. Returns True if deleted, False if not found."""
        pass

    @abstractmethod
    def list(self, prefix: str = "") -> list[str]:
        """Lists all keys matching the prefix."""
        pass

    @abstractmethod
    def get_bytes(self, key: str) -> Optional[bytes]:
        """Returns raw bytes for key, or None if not found."""
        pass

