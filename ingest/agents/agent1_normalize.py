"""Agent 1: Normalize & Validate (Input Processing)."""

import hashlib
import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from PIL import Image, ImageOps

from ingest.config import (
    DOC_SIZE_WARN_BYTES,
    DOC_SIZE_MAX_BYTES,
    IMAGE_SIZE_WARN_BYTES,
    IMAGE_MAX_EDGE_PX,
    THUMB_MAX_EDGE_PX,
    WEBP_QUALITY,
    STAGING_DIR,
)
from ingest.logger import log
from ingest.models import StagedItem


class Agent1Normalize:
    """
    Normalizes, validates, sanitizes, and stages incoming source files.
    Never mutates the original file; works entirely within a designated staging folder.
    """

    def __init__(self, run_id: Optional[str] = None):
        self.run_id = run_id or uuid.uuid4().hex[:8]
        self.staging_dir = STAGING_DIR / f"run_{self.run_id}"
        self.staging_dir.mkdir(parents=True, exist_ok=True)
        self.warnings: list[str] = []

    def cleanup(self) -> None:
        """Removes the temporary staging folder for this run."""
        try:
            if self.staging_dir.exists():
                shutil.rmtree(self.staging_dir)
        except Exception as e:
            log.warning(f"Could not remove staging dir {self.staging_dir}: {e}")

    def _calc_hash(self, file_path: Path) -> str:
        """Computes the first 10 hex characters of the SHA-256 digest."""
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
        return h.hexdigest()[:10]

    def process(self, source_path: Path | str) -> StagedItem:
        """Main entry point to normalize, stage, and validate a single input file."""
        source_path = Path(source_path).resolve()
        if not source_path.is_file():
            raise FileNotFoundError(f"Source file does not exist: {source_path}")

        raw_size = source_path.stat().st_size
        ext = source_path.suffix.lower()

        # Reject .doc immediately
        if ext == ".doc":
            raise ValueError(
                "Legacy Word .doc format is not supported. Please open the document and save it as modern .docx."
            )

        # Check raw size limits
        if raw_size > DOC_SIZE_MAX_BYTES:
            raise ValueError(
                f"Cloudflare Pages limit is 25 MiB per file. Compress or host elsewhere: {source_path.name} ({raw_size / 1024 / 1024:.1f} MiB)"
            )
        if raw_size > DOC_SIZE_WARN_BYTES:
            self.warnings.append(
                f"File size ({raw_size / 1024 / 1024:.1f} MB) is large (>10 MB). Cloudflare Pages limit is 25 MiB per file; downloads may be slower."
            )

        now_iso = datetime.now(timezone.utc).isoformat()

        # Dispatch normalization based on format
        if ext == ".docx":
            return self._process_docx(source_path, now_iso)
        elif ext in (".md", ".txt"):
            return self._process_markdown(source_path, now_iso)
        elif ext in (".html", ".htm"):
            return self._process_html(source_path, now_iso)
        elif ext == ".pdf":
            return self._process_pdf(source_path, now_iso)
        elif ext == ".ipynb":
            return self._process_ipynb(source_path, now_iso)
        elif ext in (".png", ".jpg", ".jpeg", ".webp", ".heic"):
            return self._process_raster_image(source_path, now_iso)
        elif ext == ".svg":
            return self._process_svg(source_path, now_iso)
        else:
            raise ValueError(
                f"Unsupported file format '{ext}'. Supported: .docx, .md, .txt, .html, .pdf, .ipynb, .webp, .png, .jpg, .svg"
            )

    def _process_docx(self, path: Path, now_iso: str) -> StagedItem:
        import docx

        try:
            doc = docx.Document(path)
        except Exception as e:
            raise ValueError(f"Corrupted or invalid Word document: {e}") from e

        # Extract text snippets and verify not completely empty
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        has_tables = len(doc.tables) > 0

        if not paragraphs and not has_tables:
            raise ValueError("The provided .docx document is completely empty.")

        snippet = " ".join(paragraphs)[:300] if paragraphs else ""

        # Copy to staging
        staged = self.staging_dir / f"document_{self.run_id}.docx"
        shutil.copy2(path, staged)

        return StagedItem(
            source_path=path,
            staged_file=staged,
            format="docx",
            size_bytes=staged.stat().st_size,
            sha256_short=self._calc_hash(staged),
            updated_at=now_iso,
            snippet=snippet,
        )

    def _process_markdown(self, path: Path, now_iso: str) -> StagedItem:
        try:
            raw = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            try:
                raw = path.read_text(encoding="utf-8-sig")
            except Exception as e:
                raise ValueError(f"File could not be decoded as UTF-8 text: {e}") from e

        if not raw.strip():
            raise ValueError("The provided text/markdown file is empty.")

        # Normalize line endings
        normalized = raw.replace("\r\n", "\n").replace("\r", "\n")
        # Collapse 3+ consecutive newlines down to 2
        normalized = re.sub(r"\n{3,}", "\n\n", normalized)
        # Strip trailing whitespace on lines
        normalized = "\n".join(line.rstrip() for line in normalized.split("\n")).strip() + "\n"

        # Extract plain text snippet (strip markdown headings, bullets, asterisks)
        plain = re.sub(r"[#*_`~>\[\]\(\)]", " ", normalized)
        plain = re.sub(r"\s+", " ", plain).strip()
        snippet = plain[:300]

        staged = self.staging_dir / f"content_{self.run_id}.md"
        staged.write_text(normalized, encoding="utf-8")

        return StagedItem(
            source_path=path,
            staged_file=staged,
            format="md",
            size_bytes=staged.stat().st_size,
            sha256_short=self._calc_hash(staged),
            updated_at=now_iso,
            snippet=snippet,
        )

    def _process_html(self, path: Path, now_iso: str) -> StagedItem:
        raw = path.read_text(encoding="utf-8", errors="replace")
        if not re.search(r"<\s*([a-zA-Z0-9]+)[^>]*>", raw):
            raise ValueError("The provided HTML file contains no HTML tags or markup.")

        staged = self.staging_dir / f"content_{self.run_id}.html"
        staged.write_text(raw, encoding="utf-8")

        plain = re.sub(r"<[^>]+>", " ", raw)
        plain = re.sub(r"\s+", " ", plain).strip()

        return StagedItem(
            source_path=path,
            staged_file=staged,
            format="html",
            size_bytes=staged.stat().st_size,
            sha256_short=self._calc_hash(staged),
            updated_at=now_iso,
            snippet=plain[:300],
        )

    def _process_pdf(self, path: Path, now_iso: str) -> StagedItem:
        import pypdf

        try:
            reader = pypdf.PdfReader(path)
        except Exception as e:
            raise ValueError(f"Corrupted or invalid PDF document: {e}") from e

        if reader.is_encrypted:
            raise ValueError("Encrypted/password-protected PDFs cannot be ingested.")

        if len(reader.pages) == 0:
            raise ValueError("The provided PDF contains 0 pages.")

        snippet = ""
        try:
            text = reader.pages[0].extract_text()
            if text:
                snippet = re.sub(r"\s+", " ", text).strip()[:300]
        except Exception:
            pass

        staged = self.staging_dir / f"document_{self.run_id}.pdf"
        shutil.copy2(path, staged)

        return StagedItem(
            source_path=path,
            staged_file=staged,
            format="pdf",
            size_bytes=staged.stat().st_size,
            sha256_short=self._calc_hash(staged),
            updated_at=now_iso,
            snippet=snippet,
        )

    def _process_ipynb(self, path: Path, now_iso: str) -> StagedItem:
        try:
            raw = path.read_text(encoding="utf-8")
            data = json.loads(raw)
        except Exception as e:
            raise ValueError(f"Corrupted or invalid Jupyter Notebook (.ipynb): {e}") from e

        if not isinstance(data, dict) or "cells" not in data or "nbformat" not in data:
            raise ValueError("Invalid notebook structure: missing 'cells' or 'nbformat' keys.")

        # Check total output size
        total_output_chars = 0
        for cell in data.get("cells", []):
            for output in cell.get("outputs", []):
                for val in output.get("data", {}).values():
                    if isinstance(val, (str, list)):
                        total_output_chars += len(str(val))

        if total_output_chars > 10 * 1024 * 1024:
            self.warnings.append(
                "Notebook contains > 10MB of embedded cell outputs. Consider clearing outputs in Jupyter before publishing."
            )

        staged = self.staging_dir / f"notebook_{self.run_id}.ipynb"
        staged.write_text(json.dumps(data, indent=1), encoding="utf-8")

        return StagedItem(
            source_path=path,
            staged_file=staged,
            format="ipynb",
            size_bytes=staged.stat().st_size,
            sha256_short=self._calc_hash(staged),
            updated_at=now_iso,
            snippet="Jupyter Notebook",
        )

    def _process_svg(self, path: Path, now_iso: str) -> StagedItem:
        raw = path.read_text(encoding="utf-8", errors="replace")
        if "<svg" not in raw.lower():
            raise ValueError("Invalid SVG file: missing <svg root element.")

        # Parse width/height if present
        width, height = 800, 450
        w_match = re.search(r'width=["\']?(\d+)', raw)
        h_match = re.search(r'height=["\']?(\d+)', raw)
        if w_match: width = int(w_match.group(1))
        if h_match: height = int(h_match.group(1))

        staged = self.staging_dir / f"image_{self.run_id}.svg"
        staged.write_text(raw, encoding="utf-8")

        return StagedItem(
            source_path=path,
            staged_file=staged,
            format="svg",
            size_bytes=staged.stat().st_size,
            sha256_short=self._calc_hash(staged),
            updated_at=now_iso,
            width=width,
            height=height,
        )

    def _process_raster_image(self, path: Path, now_iso: str) -> StagedItem:
        if path.suffix.lower() == ".heic":
            try:
                import pillow_heif
                pillow_heif.register_heif_opener()
            except ImportError:
                raise ValueError(
                    "HEIC image format requires 'pillow-heif' package which is not installed. "
                    "Skipping HEIC processing; please convert the image to JPEG or PNG."
                )

        try:
            with Image.open(path) as img:
                img.verify()
        except Exception as e:
            raise ValueError(f"Corrupted or unreadable image file: {e}") from e

        # Reopen after verify()
        with Image.open(path) as raw_img:
            # 1. Apply EXIF orientation
            transposed = ImageOps.exif_transpose(raw_img)

            # 2. STRIP all EXIF/GPS metadata by creating a new clean image
            mode = "RGBA" if transposed.mode in ("RGBA", "LA") or (transposed.mode == "P" and "transparency" in transposed.info) else "RGB"
            clean_img = Image.new(mode, transposed.size)
            clean_img.paste(transposed)

            # 3. Cap long edge at 2000 px
            width, height = clean_img.size
            if max(width, height) > IMAGE_MAX_EDGE_PX:
                if width >= height:
                    new_w = IMAGE_MAX_EDGE_PX
                    new_h = int(height * (IMAGE_MAX_EDGE_PX / width))
                else:
                    new_h = IMAGE_MAX_EDGE_PX
                    new_w = int(width * (IMAGE_MAX_EDGE_PX / height))
                clean_img = clean_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                width, height = new_w, new_h

            # 4. Save full image as WebP (quality ~82)
            staged_full = self.staging_dir / f"image_{self.run_id}.webp"
            clean_img.save(staged_full, format="WEBP", quality=WEBP_QUALITY, method=6)

            full_size = staged_full.stat().st_size
            if full_size > IMAGE_SIZE_WARN_BYTES:
                self.warnings.append(
                    f"Converted image size ({full_size / 1024 / 1024:.2f} MB) exceeds recommended 1.5 MB limit."
                )

            # 5. Produce 480 px thumbnail
            thumb_img = clean_img.copy()
            if max(width, height) > THUMB_MAX_EDGE_PX:
                if width >= height:
                    t_w = THUMB_MAX_EDGE_PX
                    t_h = max(1, int(height * (THUMB_MAX_EDGE_PX / width)))
                else:
                    t_h = THUMB_MAX_EDGE_PX
                    t_w = max(1, int(width * (THUMB_MAX_EDGE_PX / height)))
                thumb_img = thumb_img.resize((t_w, t_h), Image.Resampling.LANCZOS)
                thumb_w, thumb_h = t_w, t_h
            else:
                thumb_w, thumb_h = width, height

            staged_thumb = self.staging_dir / f"thumb_{self.run_id}.webp"
            thumb_img.save(staged_thumb, format="WEBP", quality=75, method=6)

        return StagedItem(
            source_path=path,
            staged_file=staged_full,
            format="webp",
            size_bytes=full_size,
            sha256_short=self._calc_hash(staged_full),
            updated_at=now_iso,
            width=width,
            height=height,
            staged_thumb=staged_thumb,
            thumb_width=thumb_w,
            thumb_height=thumb_h,
        )

