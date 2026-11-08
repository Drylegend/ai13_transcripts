"""Global configuration, constants, and limits for the Ingest CLI."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from project root
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

# Storage Limits & Thresholds
DOC_SIZE_WARN_BYTES = 10 * 1024 * 1024       # 10 MB
DOC_SIZE_MAX_BYTES = 25 * 1024 * 1024        # 25 MB
IMAGE_SIZE_WARN_BYTES = int(1.5 * 1024 * 1024) # 1.5 MB
SEARCH_INDEX_WARN_BYTES = int(1.5 * 1024 * 1024) # 1.5 MB

# Image Processing Specs
IMAGE_MAX_EDGE_PX = 2000
THUMB_MAX_EDGE_PX = 480
WEBP_QUALITY = 82

# Cache-Control Headers
CACHE_MANIFEST = "public, max-age=60, must-revalidate"
CACHE_IMMUTABLE = "public, max-age=31536000, immutable"

# Directory Locations
LOG_DIR = ROOT_DIR / ".ingest_logs"
BACKUP_DIR = ROOT_DIR / ".ingest_backups"
STAGING_DIR = ROOT_DIR / ".staging"
SCHEMAS_DIR = Path(__file__).resolve().parent / "schemas"
DEV_CONTENT_DIR = ROOT_DIR / "dev-content"
SITE_CONTENT_DIR = ROOT_DIR / "public" / "content"
PUBLISH_LOG_FILE = LOG_DIR / "pending_operations.json"

# Cloudflare Pages Limits (for site target and stats)
PAGES_MAX_FILES = 20_000
PAGES_WARN_FILES = 14_000                  # 70% of 20,000
PAGES_HARD_WARN_FILES = 15_000
PAGES_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024   # 25 MiB
PAGES_WARN_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MiB

# Ensure runtime directories exist
LOG_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
STAGING_DIR.mkdir(parents=True, exist_ok=True)

# Content Types Mapping
MIME_TYPES = {
    ".json": "application/json; charset=utf-8",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pdf": "application/pdf",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ipynb": "application/x-ipynb+json; charset=utf-8",
}

def get_content_type(filename_or_key: str) -> str:
    """Returns the MIME content type for a given filename or key."""
    ext = Path(filename_or_key).suffix.lower()
    return MIME_TYPES.get(ext, "application/octet-stream")

def get_r2_credentials() -> dict[str, str]:
    """Retrieves and validates Cloudflare R2 credentials from environment variables."""
    account_id = os.getenv("R2_ACCOUNT_ID")
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    bucket = os.getenv("R2_BUCKET")

    missing = []
    if not account_id: missing.append("R2_ACCOUNT_ID")
    if not access_key: missing.append("R2_ACCESS_KEY_ID")
    if not secret_key: missing.append("R2_SECRET_ACCESS_KEY")
    if not bucket: missing.append("R2_BUCKET")

    if missing:
        raise ValueError(
            f"Missing required Cloudflare R2 environment variables in .env:\n  - "
            + "\n  - ".join(missing)
            + "\n\nSee .env.example for instructions or use --target local for local testing."
        )

    return {
        "account_id": account_id.strip(),
        "access_key_id": access_key.strip(),
        "secret_access_key": secret_key.strip(),
        "bucket": bucket.strip(),
    }


def get_default_target() -> str:
    """Returns the default storage target ('site', 'r2', or 'local').

    Defaults to 'site' when R2 credentials are not configured.
    """
    env_target = os.getenv("INGEST_TARGET", "").strip().lower()
    if env_target in ("site", "r2", "local"):
        return env_target

    try:
        get_r2_credentials()
        return "r2"
    except Exception:
        return "site"


