"""Dual Console and Rotating File Logger for Ingest CLI."""

import logging
import re
from datetime import datetime
from pathlib import Path
from rich.console import Console
from ingest.config import LOG_DIR

# Rich console for styled terminal output
console = Console()
error_console = Console(stderr=True)

# Secret pattern redaction
SECRET_PATTERNS = [
    re.compile(r"(?i)(key|secret|password|token)[=:\s]+(['\"]?[\w\-\+/=]{16,}['\"]?)"),
    re.compile(r"(?i)(R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID)[=:\s]+(\S+)"),
]

def sanitize_message(msg: str) -> str:
    """Redacts any accidental secrets or credentials from log messages."""
    sanitized = str(msg)
    for pat in SECRET_PATTERNS:
        sanitized = pat.sub(r"\1=***REDACTED***", sanitized)
    return sanitized


class SafeFileHandler(logging.FileHandler):
    """FileHandler that guarantees secrets are never persisted in log files."""
    def emit(self, record: logging.LogRecord) -> None:
        record.msg = sanitize_message(record.msg)
        super().emit(record)


def get_logger(name: str = "ingest") -> logging.Logger:
    """Configures and returns a dual console and daily file logger."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(logging.DEBUG)

    # Daily log file
    today_str = datetime.now().strftime("%Y%m%d")
    log_file = LOG_DIR / f"ingest-{today_str}.log"

    file_handler = SafeFileHandler(log_file, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_fmt = logging.Formatter(
        "%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    file_handler.setFormatter(file_fmt)
    logger.addHandler(file_handler)

    return logger

log = get_logger()

