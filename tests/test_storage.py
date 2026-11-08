"""Tests for Storage Backends (LocalStorage and R2Storage)."""
import json
import pytest
from pathlib import Path
from moto import mock_aws
import boto3

from ingest.storage.base import ConcurrencyError
from ingest.storage.local import LocalStorage
from ingest.storage.r2 import R2Storage


def test_local_storage_crud(tmp_path):
    storage = LocalStorage(tmp_path)

    # 1. Put and Get JSON
    data = {"name": "Test Module", "version": 1}
    etag = storage.put_json("modules/test/manifest.json", data)
    assert etag is not None

    loaded, loaded_etag = storage.get_json("modules/test/manifest.json")
    assert loaded == data
    assert loaded_etag == etag

    # 2. Put file
    sample_file = tmp_path / "sample.txt"
    sample_file.write_text("Hello World", encoding="utf-8")
    file_etag = storage.put_file("content/sample.txt", sample_file, "text/plain")
    assert file_etag is not None
    assert storage.exists("content/sample.txt")

    # 3. List keys
    keys = storage.list("modules/")
    assert "modules/test/manifest.json" in keys

    # 4. Metadata
    meta = storage.head("content/sample.txt")
    assert meta is not None
    assert meta["size"] == len(b"Hello World")

    # 5. Concurrency check
    # Same ETag passes
    new_etag = storage.put_json("modules/test/manifest.json", {"version": 2}, if_match_etag=loaded_etag)
    assert new_etag != loaded_etag

    # Stale ETag raises ConcurrencyError
    with pytest.raises(ConcurrencyError):
        storage.put_json("modules/test/manifest.json", {"version": 3}, if_match_etag="stale_etag")

    # 6. Delete
    deleted = storage.delete("content/sample.txt")
    assert deleted is True
    assert not storage.exists("content/sample.txt")


@mock_aws
def test_r2_storage_mock(tmp_path):
    # Setup mock S3
    s3_client = boto3.client("s3", region_name="us-east-1")
    s3_client.create_bucket(Bucket="my-test-bucket")

    # Instantiate R2Storage pointing to mock bucket
    r2 = R2Storage(
        account_id="mock-account",
        access_key_id="mock-key",
        secret_access_key="mock-secret",
        bucket_name="my-test-bucket",
    )
    # Direct mock S3 client for moto inside the test
    r2.s3 = boto3.client(
        "s3",
        region_name="us-east-1",
        aws_access_key_id="mock-key",
        aws_secret_access_key="mock-secret",
    )

    # 1. Connection check
    ok, msg = r2.check_connection()
    assert ok is True

    # 2. Put and Get JSON
    manifest_data = {"slug": "ai-13", "title": "AI 13 Course"}
    etag = r2.put_json("modules/ai-13/manifest.json", manifest_data)
    assert etag is not None

    loaded, loaded_etag = r2.get_json("modules/ai-13/manifest.json")
    assert loaded == manifest_data
    assert loaded_etag == etag

    # 3. Put File
    test_file = tmp_path / "photo.webp"
    test_file.write_bytes(b"FAKE_WEBP_IMAGE_BYTES")
    r2.put_file("modules/ai-13/board-1.webp", test_file, "image/webp")
    assert r2.exists("modules/ai-13/board-1.webp")

    # 4. List Keys
    keys = r2.list("modules/ai-13/")
    assert "modules/ai-13/manifest.json" in keys
    assert "modules/ai-13/board-1.webp" in keys

    # 5. Optimistic Concurrency - valid match succeeds
    r2.put_json("modules/ai-13/manifest.json", {"slug": "ai-13", "v": 2}, if_match_etag=loaded_etag)

    # Optimistic Concurrency - mismatched match raises ConcurrencyError
    with pytest.raises(ConcurrencyError):
        r2.put_json("modules/ai-13/manifest.json", {"slug": "ai-13", "v": 3}, if_match_etag="stale_etag_value")
