import types
from unittest.mock import MagicMock

import pytest

from backend.storage import GoogleDriveStorage, LocalDiskStorage


def test_local_disk_storage_save_and_delete(tmp_path):
    storage = LocalDiskStorage(base_dir=tmp_path)

    url = storage.save(b"hello world", "txt", mime_type="text/plain", subfolder="documents")

    assert url.startswith("/uploads/documents/")
    assert url.endswith(".txt")

    saved_path = tmp_path / "documents" / url.split("/")[-1]
    assert saved_path.is_file()
    assert saved_path.read_bytes() == b"hello world"

    storage.delete(url)
    assert not saved_path.exists()


def test_local_disk_storage_no_subfolder(tmp_path):
    storage = LocalDiskStorage(base_dir=tmp_path)

    url = storage.save(b"\x89PNG", "png", mime_type="image/png")

    assert url == f"/uploads/{url.split('/')[-1]}"
    assert (tmp_path / url.split("/")[-1]).is_file()


def test_local_disk_storage_delete_refuses_path_outside_base(tmp_path):
    storage = LocalDiskStorage(base_dir=tmp_path / "uploads")
    storage.base_dir.mkdir(parents=True, exist_ok=True)

    outside_file = tmp_path / "secret.txt"
    outside_file.write_text("do not delete me")

    # Craft a URL that tries to escape base_dir via traversal
    storage.delete("/uploads/../secret.txt")

    assert outside_file.exists()


def test_local_disk_storage_delete_missing_file_is_noop(tmp_path):
    storage = LocalDiskStorage(base_dir=tmp_path)
    # Should not raise even though nothing was ever saved
    storage.delete("/uploads/nonexistent.png")


def _fake_drive_service(file_id="fake123"):
    files_create = MagicMock()
    files_create.execute.return_value = {"id": file_id}

    files_delete = MagicMock()
    files_delete.execute.return_value = {}

    files_mock = MagicMock()
    files_mock.create.return_value = files_create
    files_mock.delete.return_value = files_delete

    permissions_create = MagicMock()
    permissions_create.execute.return_value = {}
    permissions_mock = MagicMock()
    permissions_mock.create.return_value = permissions_create

    service = MagicMock()
    service.files.return_value = files_mock
    service.permissions.return_value = permissions_mock
    return service, files_mock, permissions_mock


def test_google_drive_storage_save_returns_view_url(monkeypatch):
    service, files_mock, permissions_mock = _fake_drive_service(file_id="abc123")

    storage = GoogleDriveStorage(folder_id="folder-1", credentials_json='{"type": "service_account"}')
    monkeypatch.setattr(storage, "_get_service", lambda: service)

    url = storage.save(b"pdf-bytes", "pdf", mime_type="application/pdf", subfolder="documents")

    assert url == "https://drive.google.com/uc?export=view&id=abc123"
    files_mock.create.assert_called_once()
    create_kwargs = files_mock.create.call_args.kwargs
    assert create_kwargs["body"]["parents"] == ["folder-1"]
    permissions_mock.create.assert_called_once_with(fileId="abc123", body={"role": "reader", "type": "anyone"})


def test_google_drive_storage_delete_extracts_file_id(monkeypatch):
    service, files_mock, _ = _fake_drive_service()

    storage = GoogleDriveStorage(folder_id="folder-1", credentials_json='{"type": "service_account"}')
    monkeypatch.setattr(storage, "_get_service", lambda: service)

    storage.delete("https://drive.google.com/uc?export=view&id=xyz789")

    files_mock.delete.assert_called_once_with(fileId="xyz789")


def test_google_drive_storage_delete_ignores_bad_url(monkeypatch):
    service, files_mock, _ = _fake_drive_service()
    storage = GoogleDriveStorage(folder_id="folder-1", credentials_json='{"type": "service_account"}')
    monkeypatch.setattr(storage, "_get_service", lambda: service)

    storage.delete("not-a-drive-url")

    files_mock.delete.assert_not_called()


def test_google_drive_storage_requires_credentials():
    storage = GoogleDriveStorage(folder_id="folder-1")
    with pytest.raises(RuntimeError):
        storage._get_service()
