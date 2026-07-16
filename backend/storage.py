import functools
import json
import os
import re
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional


class StorageBackend(ABC):
    @abstractmethod
    def save(self, content: bytes, extension: str, mime_type: Optional[str] = None, subfolder: str = "") -> str:
        """Persist content and return the URL to store on the record (relative /uploads/... path or absolute URL)."""
        raise NotImplementedError

    @abstractmethod
    def delete(self, url: str) -> None:
        """Best-effort removal of a previously saved file. Must not raise if the file is already gone."""
        raise NotImplementedError


class LocalDiskStorage(StorageBackend):
    def __init__(self, base_dir: Path, base_url_path: str = "/uploads"):
        self.base_dir = Path(base_dir)
        self.base_url_path = base_url_path.rstrip("/")

    def save(self, content: bytes, extension: str, mime_type: Optional[str] = None, subfolder: str = "") -> str:
        target_dir = (self.base_dir / subfolder) if subfolder else self.base_dir
        target_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{uuid.uuid4().hex}.{extension}"
        (target_dir / filename).write_bytes(content)

        url_subfolder = f"/{subfolder}" if subfolder else ""
        return f"{self.base_url_path}{url_subfolder}/{filename}"

    def delete(self, url: str) -> None:
        if not url or not url.startswith(self.base_url_path):
            return

        relative = url[len(self.base_url_path):].lstrip("/")
        path = (self.base_dir / relative).resolve()
        base_resolved = self.base_dir.resolve()

        if path != base_resolved and base_resolved not in path.parents:
            return  # refuse to delete outside base_dir

        try:
            if path.is_file():
                path.unlink()
        except OSError:
            pass


class GoogleDriveStorage(StorageBackend):
    """Uploads via a Google service account into a single shared Drive folder.

    Files are made 'anyone with the link can view' so they can be embedded
    directly as <img>/download URLs with no proxying through this backend.
    """

    SCOPES = ["https://www.googleapis.com/auth/drive"]

    def __init__(self, folder_id: str, credentials_file: Optional[str] = None, credentials_json: Optional[str] = None):
        self.folder_id = folder_id
        self._credentials_file = credentials_file
        self._credentials_json = credentials_json
        self._service = None

    def _get_service(self):
        if self._service is not None:
            return self._service

        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        if self._credentials_json:
            info = json.loads(self._credentials_json)
            credentials = service_account.Credentials.from_service_account_info(info, scopes=self.SCOPES)
        elif self._credentials_file:
            credentials = service_account.Credentials.from_service_account_file(self._credentials_file, scopes=self.SCOPES)
        else:
            raise RuntimeError(
                "Google Drive storage requires TESTBOARD_GDRIVE_CREDENTIALS_FILE or TESTBOARD_GDRIVE_CREDENTIALS_JSON"
            )

        self._service = build("drive", "v3", credentials=credentials, cache_discovery=False)
        return self._service

    def save(self, content: bytes, extension: str, mime_type: Optional[str] = None, subfolder: str = "") -> str:
        import io
        from googleapiclient.http import MediaIoBaseUpload

        service = self._get_service()
        filename = f"{uuid.uuid4().hex}.{extension}"
        media = MediaIoBaseUpload(io.BytesIO(content), mimetype=mime_type or "application/octet-stream", resumable=False)

        created = service.files().create(
            body={"name": filename, "parents": [self.folder_id]},
            media_body=media,
            fields="id",
        ).execute()
        file_id = created["id"]

        service.permissions().create(
            fileId=file_id,
            body={"role": "reader", "type": "anyone"},
        ).execute()

        return f"https://drive.google.com/uc?export=view&id={file_id}"

    def delete(self, url: str) -> None:
        file_id = self._extract_file_id(url)
        if not file_id:
            return
        try:
            self._get_service().files().delete(fileId=file_id).execute()
        except Exception:
            pass

    @staticmethod
    def _extract_file_id(url: str) -> Optional[str]:
        match = re.search(r"[?&]id=([^&]+)", url or "")
        return match.group(1) if match else None


@functools.lru_cache()
def get_storage_backend() -> StorageBackend:
    backend = os.getenv("TESTBOARD_STORAGE_BACKEND", "local").lower()

    if backend == "gdrive":
        folder_id = os.getenv("TESTBOARD_GDRIVE_FOLDER_ID")
        if not folder_id:
            raise RuntimeError("TESTBOARD_GDRIVE_FOLDER_ID must be set when TESTBOARD_STORAGE_BACKEND=gdrive")
        return GoogleDriveStorage(
            folder_id=folder_id,
            credentials_file=os.getenv("TESTBOARD_GDRIVE_CREDENTIALS_FILE"),
            credentials_json=os.getenv("TESTBOARD_GDRIVE_CREDENTIALS_JSON"),
        )

    base_dir = Path(os.getenv("TESTBOARD_STORAGE_DIR") or (Path(__file__).resolve().parent / "uploads"))
    return LocalDiskStorage(base_dir=base_dir)
