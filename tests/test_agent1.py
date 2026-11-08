"""Tests for Agent 1 (Normalize & Validate)."""
import io
import os
import tempfile
import pytest
from PIL import Image
import docx
from pypdf import PdfWriter

from ingest.agents.agent1_normalize import Agent1Normalize


@pytest.fixture
def agent():
    a = Agent1Normalize()
    yield a
    a.cleanup()


def test_rejects_doc_extension(agent, tmp_path):
    f = tmp_path / "legacy.doc"
    f.write_bytes(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    with pytest.raises(ValueError, match="Legacy Word \\.doc format is not supported"):
        agent.process(f)


def test_rejects_empty_docx(agent, tmp_path):
    # Empty docx document with no paragraphs or tables
    doc_path = tmp_path / "empty.docx"
    doc = docx.Document()
    doc.save(str(doc_path))
    with pytest.raises(ValueError, match="is completely empty"):
        agent.process(doc_path)


def test_rejects_corrupt_docx(agent, tmp_path):
    f = tmp_path / "corrupt.docx"
    f.write_bytes(b"This is not a zip or docx archive")
    with pytest.raises(ValueError, match="Corrupted or invalid Word document"):
        agent.process(f)


def test_rejects_empty_markdown(agent, tmp_path):
    f = tmp_path / "empty.md"
    f.write_text("   \n\n\t", encoding="utf-8")
    with pytest.raises(ValueError, match="is empty"):
        agent.process(f)


def test_rejects_non_utf8_markdown(agent, tmp_path):
    f = tmp_path / "latin1.md"
    f.write_bytes(b"Hello \xe9\xe8\xe0")  # Invalid UTF-8 sequence
    with pytest.raises(ValueError, match="could not be decoded as UTF-8 text"):
        agent.process(f)


def test_rejects_encrypted_pdf(agent, tmp_path):
    pdf_path = tmp_path / "encrypted.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    writer.encrypt("password")
    with open(pdf_path, "wb") as f:
        writer.write(f)

    with pytest.raises(ValueError, match="Encrypted"):
        agent.process(pdf_path)


def test_preserves_valid_docx(agent, tmp_path):
    doc_path = tmp_path / "sample.docx"
    doc = docx.Document()
    doc.add_heading("Test Document", level=1)
    doc.add_paragraph("Sample content")
    doc.save(str(doc_path))

    orig_bytes = doc_path.read_bytes()
    item = agent.process(doc_path)
    assert item.format == "docx"
    assert item.staged_file.exists()
    assert item.staged_file.read_bytes() == orig_bytes
    assert item.size_bytes == len(orig_bytes)


def test_normalizes_markdown_newlines_and_whitespace(agent, tmp_path):
    md_path = tmp_path / "notes.md"
    raw_content = "# Heading\r\n\r\nLine with trailing spaces   \r\n\r\n\r\n\r\nEnd"
    md_path.write_bytes(raw_content.encode("utf-8"))

    item = agent.process(md_path)
    assert item.format == "md"
    text = item.staged_file.read_text(encoding="utf-8")
    assert "\r" not in text
    assert "Line with trailing spaces\n\nEnd" in text


def test_image_exif_strip_and_webp_conversion(agent, tmp_path):
    # Create an RGB image with dimensions 600x400
    img_path = tmp_path / "photo.png"
    img = Image.new("RGB", (600, 400), color=(100, 150, 200))
    img.save(img_path, format="PNG")

    item = agent.process(img_path)
    assert item.format == "webp"
    assert item.staged_file.suffix == ".webp"
    assert item.width == 600
    assert item.height == 400
    assert item.staged_thumb is not None
    assert item.staged_thumb.suffix == ".webp"

    # Verify thumbnail max dimension <= 480
    with Image.open(item.staged_thumb) as thumb_img:
        assert max(thumb_img.size) <= 480
