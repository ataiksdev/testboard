import pytest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.main import app
from backend.models import User, Project, Bug, Version, Comment, ActivityLog, ProjectMember, Notification

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override get_db dependency
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

client = TestClient(app)

def test_auth_approval_workflow():
    # 1. Register first user (should automatically be Admin)
    resp = client.post("/api/auth/register", json={
        "email": "admin@test.com",
        "password": "password123",
        "full_name": "Admin User"
    })
    assert resp.status_code == 200
    admin_data = resp.json()
    assert admin_data["role"] == "Admin"
    assert admin_data["email"] == "admin@test.com"

    # 2. Register second user (should be Pending)
    resp = client.post("/api/auth/register", json={
        "email": "dev@test.com",
        "password": "password123",
        "full_name": "Developer User"
    })
    assert resp.status_code == 200
    dev_data = resp.json()
    assert dev_data["role"] == "Pending"

    # 3. Attempt login with pending user (should be 403)
    resp = client.post("/api/auth/login", data={
        "username": "dev@test.com",
        "password": "password123"
    })
    assert resp.status_code == 403
    assert "pending Admin approval" in resp.json()["detail"]

    # 4. Login as Admin
    resp = client.post("/api/auth/login", data={
        "username": "admin@test.com",
        "password": "password123"
    })
    assert resp.status_code == 200
    admin_token = resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 5. List pending users
    resp = client.get("/api/admin/users/pending", headers=admin_headers)
    assert resp.status_code == 200
    pending_list = resp.json()
    assert len(pending_list) == 1
    assert pending_list[0]["id"] == dev_data["id"]

    # 6. Approve the pending user as a Dev
    resp = client.post(f"/api/admin/users/{dev_data['id']}/approve", json={"role": "Dev"}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["role"] == "Dev"

    # 7. Now log in as the approved developer user (should succeed)
    resp = client.post("/api/auth/login", data={
        "username": "dev@test.com",
        "password": "password123"
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_project_crud_and_activity():
    # Setup Admin
    client.post("/api/auth/register", json={
        "email": "admin@test.com",
        "password": "password123",
        "full_name": "Admin"
    })
    token = client.post("/api/auth/login", data={"username": "admin@test.com", "password": "password123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create project
    resp = client.post("/api/projects", json={
        "name": "Project Alpha",
        "key": "ALPHA",
        "description": "First project"
    }, headers=headers)
    assert resp.status_code == 200
    proj = resp.json()
    assert proj["status"] == "Intake"
    assert proj["key"] == "ALPHA"

    # Update status to Testing
    resp = client.put(f"/api/projects/{proj['id']}", json={"status": "Testing"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Testing"

    # Add EOD Comment
    resp = client.post("/api/comments", json={
        "project_id": proj["id"],
        "text": "Starting tests today"
    }, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["text"] == "Starting tests today"


def test_bug_tracker_and_reporting():
    # Setup Admin
    client.post("/api/auth/register", json={
        "email": "admin@test.com",
        "password": "password123",
        "full_name": "Admin"
    })
    token = client.post("/api/auth/login", data={"username": "admin@test.com", "password": "password123"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create project
    proj = client.post("/api/projects", json={"name": "A", "key": "A"}, headers=headers).json()

    # Log a blocker bug
    resp = client.post("/api/bugs", json={
        "title": "Blocker bug",
        "description": "Unable to login",
        "project_id": proj["id"],
        "status": "Open",
        "severity": "Critical",
        "is_blocker": True
    }, headers=headers)
    assert resp.status_code == 200
    bug = resp.json()
    assert bug["is_blocker"] is True

    # Resolve bug
    resp = client.put(f"/api/bugs/{bug['id']}", json={"status": "Resolved"}, headers=headers)
    assert resp.status_code == 200
    resolved_bug = resp.json()
    assert resolved_bug["resolved_at"] is not None

    # Get Report
    today_str = datetime.date.today().isoformat()
    resp = client.get(f"/api/reports?start_date={today_str}&end_date={today_str}", headers=headers)
    assert resp.status_code == 200
    report = resp.json()
    
    assert report["bug_metrics"]["total_bugs"] == 1
    assert report["bug_metrics"]["blocker_bugs"] == 1
    assert len(report["blockers_encountered"]) == 1
    assert report["bug_metrics"]["mttr_hours"] >= 0.0


def _register_and_login(email, full_name, password="password123"):
    client.post("/api/auth/register", json={"email": email, "password": password, "full_name": full_name})
    resp = client.post("/api/auth/login", data={"username": email, "password": password})
    if resp.status_code == 200:
        return resp.json()["access_token"]
    return None


def _make_admin():
    token = _register_and_login("admin@test.com", "Admin")
    return {"Authorization": f"Bearer {token}"}


def _make_user_with_role(admin_headers, email, full_name, role):
    client.post("/api/auth/register", json={"email": email, "password": "password123", "full_name": full_name})
    user_id = client.get("/api/admin/users/pending", headers=admin_headers).json()
    target = next(u for u in user_id if u["email"] == email)
    client.post(f"/api/admin/users/{target['id']}/approve", json={"role": role}, headers=admin_headers)
    token = client.post("/api/auth/login", data={"username": email, "password": "password123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}, target["id"]


def test_role_permission_matrix():
    admin_headers = _make_admin()
    pm_headers, _ = _make_user_with_role(admin_headers, "pm@test.com", "PM User", "PM")
    dev_headers, _ = _make_user_with_role(admin_headers, "dev@test.com", "Dev User", "Dev")
    qa_headers, _ = _make_user_with_role(admin_headers, "qa@test.com", "QA User", "QA")
    guest_headers, _ = _make_user_with_role(admin_headers, "guest@test.com", "Guest User", "Guest")

    # PM can create a project, Dev/Guest cannot
    resp = client.post("/api/projects", json={"name": "PM Project", "key": "PMP"}, headers=pm_headers)
    assert resp.status_code == 200
    pm_project = resp.json()

    resp = client.post("/api/projects", json={"name": "Dev Project", "key": "DEVP"}, headers=dev_headers)
    assert resp.status_code == 403

    resp = client.post("/api/projects", json={"name": "Guest Project", "key": "GSTP"}, headers=guest_headers)
    assert resp.status_code == 403

    # QA can create/edit projects too
    resp = client.post("/api/projects", json={"name": "QA Project", "key": "QAP"}, headers=qa_headers)
    assert resp.status_code == 200

    # Dev and QA can create bugs, PM and Guest cannot
    resp = client.post("/api/bugs", json={"title": "Dev bug", "project_id": pm_project["id"]}, headers=dev_headers)
    assert resp.status_code == 200
    dev_bug = resp.json()

    resp = client.post("/api/bugs", json={"title": "PM bug", "project_id": pm_project["id"]}, headers=pm_headers)
    assert resp.status_code == 403

    resp = client.post("/api/bugs", json={"title": "Guest bug", "project_id": pm_project["id"]}, headers=guest_headers)
    assert resp.status_code == 403

    # Everyone (including Guest) can post comments
    resp = client.post("/api/comments", json={"project_id": pm_project["id"], "text": "PM comment"}, headers=pm_headers)
    assert resp.status_code == 200
    resp = client.post("/api/comments", json={"bug_id": dev_bug["id"], "text": "Guest comment"}, headers=guest_headers)
    assert resp.status_code == 200


def test_project_membership_endpoints():
    admin_headers = _make_admin()
    dev_headers, dev_id = _make_user_with_role(admin_headers, "dev2@test.com", "Dev Two", "Dev")

    project = client.post("/api/projects", json={"name": "Membership Proj", "key": "MEM"}, headers=admin_headers).json()

    # Creating the project auto-assigns the lead (admin) as a member
    members = client.get(f"/api/projects/{project['id']}/members", headers=admin_headers).json()
    assert len(members) == 1

    # Admin adds the Dev as a member
    resp = client.post(f"/api/projects/{project['id']}/members", json={"user_id": dev_id}, headers=admin_headers)
    assert resp.status_code == 200

    # Dev cannot manage membership (not Admin/PM)
    resp = client.post(f"/api/projects/{project['id']}/members", json={"user_id": dev_id}, headers=dev_headers)
    assert resp.status_code in (400, 403)  # already a member (400) or forbidden (403) either way not a new add

    members = client.get(f"/api/projects/{project['id']}/members", headers=admin_headers).json()
    assert len(members) == 2

    # The Dev now shows up in their assigned-projects list
    resp = client.get(f"/api/admin/users/{dev_id}/projects", headers=admin_headers)
    assert resp.status_code == 200
    assert any(p["id"] == project["id"] for p in resp.json())

    # Remove membership
    resp = client.delete(f"/api/projects/{project['id']}/members/{dev_id}", headers=admin_headers)
    assert resp.status_code == 200
    members = client.get(f"/api/projects/{project['id']}/members", headers=admin_headers).json()
    assert len(members) == 1


def test_deactivate_user_blocks_login():
    admin_headers = _make_admin()
    _, dev_id = _make_user_with_role(admin_headers, "dev3@test.com", "Dev Three", "Dev")

    resp = client.put(f"/api/admin/users/{dev_id}", json={"is_active": False}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False

    resp = client.post("/api/auth/login", data={"username": "dev3@test.com", "password": "password123"})
    assert resp.status_code == 403


def test_cannot_remove_last_admin():
    admin_headers = _make_admin()
    me = client.get("/api/auth/me", headers=admin_headers).json()

    resp = client.put(f"/api/admin/users/{me['id']}", json={"role": "Dev"}, headers=admin_headers)
    assert resp.status_code == 400

    resp = client.put(f"/api/admin/users/{me['id']}", json={"is_active": False}, headers=admin_headers)
    assert resp.status_code == 400


def test_email_login_is_case_insensitive():
    resp = client.post("/api/auth/register", json={
        "email": "MixedCase@Test.com",
        "password": "password123",
        "full_name": "Case Test"
    })
    assert resp.status_code == 200
    assert resp.json()["email"] == "mixedcase@test.com"

    # Duplicate registration with different casing is rejected
    resp = client.post("/api/auth/register", json={
        "email": "mixedcase@TEST.com",
        "password": "password123",
        "full_name": "Case Test Dup"
    })
    assert resp.status_code == 400

    # Login works regardless of casing used
    resp = client.post("/api/auth/login", data={"username": "MIXEDCASE@TEST.COM", "password": "password123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_project_document_upload_list_delete(tmp_path, monkeypatch):
    from backend.storage import LocalDiskStorage
    monkeypatch.setattr("backend.main.get_storage_backend", lambda: LocalDiskStorage(base_dir=tmp_path))

    admin_headers = _make_admin()
    project = client.post("/api/projects", json={"name": "Doc Project", "key": "DOCP"}, headers=admin_headers).json()

    resp = client.post(
        f"/api/projects/{project['id']}/documents",
        headers=admin_headers,
        data={"title": "BRD v1", "doc_type": "BRD"},
        files={"file": ("brd.pdf", b"%PDF-1.4 fake pdf bytes", "application/pdf")}
    )
    assert resp.status_code == 200
    doc = resp.json()
    assert doc["title"] == "BRD v1"
    assert doc["doc_type"] == "BRD"
    assert doc["original_filename"] == "brd.pdf"
    assert doc["file_url"].startswith("/uploads/documents/")
    assert doc["uploaded_by"]["email"] == "admin@test.com"

    # Saved to disk under the injected storage backend
    saved_files = list((tmp_path / "documents").iterdir())
    assert len(saved_files) == 1

    # Activity log recorded the upload
    me = client.get("/api/auth/me", headers=admin_headers).json()
    activity = client.get(f"/api/admin/users/{me['id']}/activity", headers=admin_headers).json()
    assert any(a["activity_type"] == "document_uploaded" for a in activity)

    # Listed for the project
    resp = client.get(f"/api/projects/{project['id']}/documents", headers=admin_headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 1

    # Reject unsupported file types
    resp = client.post(
        f"/api/projects/{project['id']}/documents",
        headers=admin_headers,
        data={"title": "Bad file", "doc_type": "Other"},
        files={"file": ("virus.exe", b"MZ", "application/x-msdownload")}
    )
    assert resp.status_code == 400

    # Delete removes the row and the underlying file
    resp = client.delete(f"/api/projects/{project['id']}/documents/{doc['id']}", headers=admin_headers)
    assert resp.status_code == 200
    assert list((tmp_path / "documents").iterdir()) == []

    resp = client.get(f"/api/projects/{project['id']}/documents", headers=admin_headers)
    assert resp.json() == []


def test_project_document_permissions(tmp_path, monkeypatch):
    from backend.storage import LocalDiskStorage
    monkeypatch.setattr("backend.main.get_storage_backend", lambda: LocalDiskStorage(base_dir=tmp_path))

    admin_headers = _make_admin()
    dev_headers, _ = _make_user_with_role(admin_headers, "docdev@test.com", "Doc Dev", "Dev")
    guest_headers, _ = _make_user_with_role(admin_headers, "docguest@test.com", "Doc Guest", "Guest")

    project = client.post("/api/projects", json={"name": "Perm Doc Project", "key": "PDOC"}, headers=admin_headers).json()

    upload_kwargs = dict(
        data={"title": "Report", "doc_type": "Report"},
        files={"file": ("report.pdf", b"%PDF-1.4", "application/pdf")}
    )

    # Dev and Guest cannot upload (only Admin/PM/QA can)
    resp = client.post(f"/api/projects/{project['id']}/documents", headers=dev_headers, **upload_kwargs)
    assert resp.status_code == 403
    resp = client.post(f"/api/projects/{project['id']}/documents", headers=guest_headers, **upload_kwargs)
    assert resp.status_code == 403

    # But everyone (including Guest) can list/view
    resp = client.get(f"/api/projects/{project['id']}/documents", headers=guest_headers)
    assert resp.status_code == 200

    # Admin uploads one so we can test delete permissions
    doc = client.post(f"/api/projects/{project['id']}/documents", headers=admin_headers, **upload_kwargs).json()

    resp = client.delete(f"/api/projects/{project['id']}/documents/{doc['id']}", headers=dev_headers)
    assert resp.status_code == 403


# ==================== NOTIFICATIONS ====================

class _FakeSMTP:
    """Stand-in for smtplib.SMTP that records what would have been sent."""
    instances = []

    def __init__(self, host, port, timeout=10):
        self.host = host
        self.port = port
        self.started_tls = False
        self.logged_in = None
        self.sent = None
        _FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.started_tls = True

    def login(self, user, password):
        self.logged_in = (user, password)

    def sendmail(self, from_addr, to_addrs, msg):
        self.sent = (from_addr, to_addrs, msg)


@pytest.fixture
def fake_smtp(monkeypatch):
    _FakeSMTP.instances = []
    monkeypatch.setattr("backend.notifications.smtplib.SMTP", _FakeSMTP)
    monkeypatch.setenv("TESTBOARD_SMTP_HOST", "smtp.test.local")
    monkeypatch.setenv("TESTBOARD_SMTP_PORT", "587")
    monkeypatch.setenv("TESTBOARD_SMTP_USER", "bot@test.local")
    monkeypatch.setenv("TESTBOARD_SMTP_PASSWORD", "secret")
    monkeypatch.setenv("TESTBOARD_SMTP_FROM", "bot@test.local")
    return _FakeSMTP


def test_send_email_noop_without_smtp_configured(monkeypatch):
    from backend.notifications import send_email
    monkeypatch.delenv("TESTBOARD_SMTP_HOST", raising=False)

    calls = []
    monkeypatch.setattr("backend.notifications.smtplib.SMTP", lambda *a, **k: calls.append(1))

    send_email("someone@test.com", "Subject", "Body")  # must not raise
    assert calls == []


def test_send_email_sends_when_configured(fake_smtp):
    from backend.notifications import send_email
    send_email("someone@test.com", "Hello", "World")

    assert len(fake_smtp.instances) == 1
    sent = fake_smtp.instances[0]
    assert sent.started_tls is True
    assert sent.logged_in == ("bot@test.local", "secret")
    assert sent.sent[0] == "bot@test.local"
    assert sent.sent[1] == ["someone@test.com"]


def test_send_email_swallows_delivery_errors(monkeypatch):
    from backend.notifications import send_email
    monkeypatch.setenv("TESTBOARD_SMTP_HOST", "smtp.test.local")
    monkeypatch.setenv("TESTBOARD_SMTP_FROM", "bot@test.local")

    class _BoomSMTP:
        def __init__(self, *a, **k):
            raise ConnectionRefusedError("nope")

    monkeypatch.setattr("backend.notifications.smtplib.SMTP", _BoomSMTP)
    send_email("someone@test.com", "Hello", "World")  # must not raise


def test_notify_creates_notification_row():
    from backend.notifications import notify
    db = TestingSessionLocal()
    try:
        user = User(email="rowtest@test.com", hashed_password="x", full_name="Row Test", role="QA")
        db.add(user)
        db.commit()
        db.refresh(user)

        notification = notify(db, user.id, notif_type="bug_assigned", title="Test title", body="Test body", link="#bugs")
        assert notification.id is not None
        assert notification.user_id == user.id
        assert notification.is_read is False

        stored = db.query(Notification).filter(Notification.id == notification.id).first()
        assert stored.title == "Test title"
    finally:
        db.close()


def test_register_notifies_admins(fake_smtp):
    admin_headers = _make_admin()

    resp = client.post("/api/auth/register", json={
        "email": "newbie@test.com", "password": "password123", "full_name": "New Bie"
    })
    assert resp.status_code == 200

    resp = client.get("/api/notifications", headers=admin_headers)
    assert resp.status_code == 200
    notifs = resp.json()
    assert any(n["type"] == "access_requested" for n in notifs)

    resp = client.get("/api/notifications/unread-count", headers=admin_headers)
    assert resp.json()["count"] >= 1

    # Access requests are email-worthy
    assert len(fake_smtp.instances) == 1


def test_approve_user_notifies_new_user(fake_smtp):
    admin_headers = _make_admin()
    client.post("/api/auth/register", json={"email": "approveme@test.com", "password": "password123", "full_name": "Approve Me"})
    pending = client.get("/api/admin/users/pending", headers=admin_headers).json()
    target = next(u for u in pending if u["email"] == "approveme@test.com")

    fake_smtp.instances = []  # ignore the access-request email from registration
    resp = client.post(f"/api/admin/users/{target['id']}/approve", json={"role": "Dev"}, headers=admin_headers)
    assert resp.status_code == 200

    login_resp = client.post("/api/auth/login", data={"username": "approveme@test.com", "password": "password123"})
    token = login_resp.json()["access_token"]
    user_headers = {"Authorization": f"Bearer {token}"}

    resp = client.get("/api/notifications", headers=user_headers)
    notifs = resp.json()
    assert any(n["type"] == "account_approved" for n in notifs)
    assert len(fake_smtp.instances) == 1


def test_bug_assignment_notifies_owner(fake_smtp):
    admin_headers = _make_admin()
    dev_headers, dev_id = _make_user_with_role(admin_headers, "assignee@test.com", "Assignee Dev", "Dev")

    project = client.post("/api/projects", json={"name": "Notif Project", "key": "NOTP"}, headers=admin_headers).json()

    fake_smtp.instances = []
    resp = client.post("/api/bugs", json={
        "title": "Assigned bug", "project_id": project["id"], "owner_id": dev_id
    }, headers=admin_headers)
    assert resp.status_code == 200

    resp = client.get("/api/notifications", headers=dev_headers)
    notifs = resp.json()
    assert any(n["type"] == "bug_assigned" for n in notifs)
    assert len(fake_smtp.instances) == 1  # bug assignment is email-worthy


def test_project_status_change_notifies_members_without_email(fake_smtp):
    admin_headers = _make_admin()
    pm_headers, pm_id = _make_user_with_role(admin_headers, "statusmember@test.com", "Status Member", "PM")

    project = client.post("/api/projects", json={"name": "Status Project", "key": "STAP"}, headers=admin_headers).json()
    client.post(f"/api/projects/{project['id']}/members", json={"user_id": pm_id}, headers=admin_headers)

    fake_smtp.instances = []
    resp = client.put(f"/api/projects/{project['id']}", json={"status": "Blocked"}, headers=admin_headers)
    assert resp.status_code == 200

    resp = client.get("/api/notifications", headers=pm_headers)
    notifs = resp.json()
    assert any(n["type"] == "project_status_change" for n in notifs)

    # Status changes are in-app only, no email
    assert len(fake_smtp.instances) == 0


def test_notification_mark_read_and_read_all():
    from backend.notifications import notify
    admin_headers = _make_admin()
    me = client.get("/api/auth/me", headers=admin_headers).json()

    db = TestingSessionLocal()
    try:
        notify(db, me["id"], notif_type="test", title="One")
        notify(db, me["id"], notif_type="test", title="Two")
    finally:
        db.close()

    resp = client.get("/api/notifications/unread-count", headers=admin_headers)
    assert resp.json()["count"] == 2

    notifs = client.get("/api/notifications", headers=admin_headers).json()
    first_id = notifs[0]["id"]

    resp = client.post(f"/api/notifications/{first_id}/read", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["is_read"] is True

    resp = client.get("/api/notifications/unread-count", headers=admin_headers)
    assert resp.json()["count"] == 1

    resp = client.post("/api/notifications/read-all", headers=admin_headers)
    assert resp.status_code == 200

    resp = client.get("/api/notifications/unread-count", headers=admin_headers)
    assert resp.json()["count"] == 0
