"""Cloudflare R2 Storage backend via boto3 S3 interface."""

import json
import time
import uuid
from pathlib import Path
from typing import Any, Optional, Union
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from ingest.config import (
    CACHE_MANIFEST,
    CACHE_IMMUTABLE,
    get_content_type,
    get_r2_credentials,
)
from ingest.logger import log
from ingest.storage.base import StorageBackend, ConcurrencyError


class R2Storage(StorageBackend):
    def __init__(
        self,
        account_id: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
        endpoint_url: Optional[str] = None,
    ):
        if not (account_id and access_key_id and secret_access_key and bucket_name):
            creds = get_r2_credentials()
            self.account_id = creds["account_id"]
            self.access_key_id = creds["access_key_id"]
            self.secret_access_key = creds["secret_access_key"]
            self.bucket_name = creds["bucket"]
        else:
            self.account_id = account_id
            self.access_key_id = access_key_id
            self.secret_access_key = secret_access_key
            self.bucket_name = bucket_name

        self.endpoint_url = endpoint_url or f"https://{self.account_id}.r2.cloudflarestorage.com"

        # Initialize boto3 S3 client with standard retries
        self.s3 = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            region_name="auto",
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 4, "mode": "standard"},
            ),
        )

    def _clean_key(self, key: str) -> str:
        return key.strip().lstrip("/").replace("\\", "/")

    def get_json(self, key: str) -> tuple[Optional[Union[dict, list]], Optional[str]]:
        clean_key = self._clean_key(key)
        try:
            resp = self.s3.get_object(Bucket=self.bucket_name, Key=clean_key)
            raw = resp["Body"].read()
            etag = resp.get("ETag", "").strip('"')
            data = json.loads(raw.decode("utf-8"))
            return data, etag
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("NoSuchKey", "404"):
                return None, None
            raise

    def put_json(
        self,
        key: str,
        data: Union[dict, list],
        cache: str = "manifest",
        if_match_etag: Optional[str] = None
    ) -> str:
        clean_key = self._clean_key(key)
        encoded = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
        cache_control = CACHE_MANIFEST if cache == "manifest" else CACHE_IMMUTABLE

        kwargs: dict[str, Any] = {
            "Bucket": self.bucket_name,
            "Key": clean_key,
            "Body": encoded,
            "ContentType": "application/json; charset=utf-8",
            "CacheControl": cache_control,
        }

        # Optimistic concurrency ETag check
        if if_match_etag:
            kwargs["IfMatch"] = f'"{if_match_etag.strip(chr(34))}"'

        try:
            resp = self.s3.put_object(**kwargs)
            return resp.get("ETag", "").strip('"')
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("PreconditionFailed", "412"):
                raise ConcurrencyError(
                    f"Conflict on {clean_key}: storage ETag has changed since read. "
                    "Another process may have updated this manifest."
                ) from e
            raise

    def put_file(
        self,
        key: str,
        local_path: Union[Path, str],
        content_type: str,
        cache: str = "immutable"
    ) -> str:
        clean_key = self._clean_key(key)
        src = Path(local_path).resolve()
        if not src.is_file():
            raise FileNotFoundError(f"Local file does not exist: {src}")

        cache_control = CACHE_IMMUTABLE if cache == "immutable" else CACHE_MANIFEST
        c_type = content_type or get_content_type(clean_key)

        with open(src, "rb") as f:
            resp = self.s3.put_object(
                Bucket=self.bucket_name,
                Key=clean_key,
                Body=f,
                ContentType=c_type,
                CacheControl=cache_control,
            )
        return resp.get("ETag", "").strip('"')

    def head(self, key: str) -> Optional[dict[str, Any]]:
        clean_key = self._clean_key(key)
        try:
            resp = self.s3.head_object(Bucket=self.bucket_name, Key=clean_key)
            return {
                "size": resp.get("ContentLength", 0),
                "etag": resp.get("ETag", "").strip('"'),
                "content_type": resp.get("ContentType", ""),
                "last_modified": resp.get("LastModified"),
            }
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("NoSuchKey", "404"):
                return None
            raise

    def exists(self, key: str) -> bool:
        return self.head(key) is not None

    def delete(self, key: str) -> bool:
        clean_key = self._clean_key(key)
        try:
            self.s3.delete_object(Bucket=self.bucket_name, Key=clean_key)
            return True
        except ClientError:
            return False

    def list(self, prefix: str = "") -> list[str]:
        clean_prefix = self._clean_key(prefix)
        results: list[str] = []
        paginator = self.s3.get_paginator("list_objects_v2")

        for page in paginator.paginate(Bucket=self.bucket_name, Prefix=clean_prefix):
            for item in page.get("Contents", []):
                results.append(item["Key"])

        return sorted(results)

    def get_bytes(self, key: str) -> Optional[bytes]:
        clean_key = self._clean_key(key)
        try:
            resp = self.s3.get_object(Bucket=self.bucket_name, Key=clean_key)
            return resp["Body"].read()
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("NoSuchKey", "404"):
                return None
            raise

    def check_connection(self) -> tuple[bool, str]:
        """
        Tests R2 bucket connectivity by performing a safe write, read, and delete of a temporary test object.
        Returns (success, message).
        """
        test_key = f"_ai13_healthcheck_{uuid.uuid4().hex[:8]}.json"
        test_payload = {"healthcheck": True, "timestamp": time.time()}

        try:
            # 1. Write
            self.put_json(test_key, test_payload, cache="manifest")
            # 2. Read back
            data, etag = self.get_json(test_key)
            if not data or not data.get("healthcheck"):
                return False, "Failed to read back written healthcheck payload."
            # 3. Clean up
            self.delete(test_key)
            return True, f"Successfully connected to R2 bucket '{self.bucket_name}' (Write + Read + Delete verified)."
        except Exception as e:
            return False, f"R2 Connection check failed: {type(e).__name__} - {str(e)}"
