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


def test_bug_owner_auto_assign_and_priority_type_defaults():
    admin_headers = _make_admin()
    project = client.post("/api/projects", json={"name": "AutoAssign Proj", "key": "AAP"}, headers=admin_headers).json()
    me = client.get("/api/auth/me", headers=admin_headers).json()

    # No owner_id given -> reporter becomes owner, priority/bug_type default
    resp = client.post("/api/bugs", json={
        "title": "Unassigned bug",
        "project_id": project["id"]
    }, headers=admin_headers)
    assert resp.status_code == 200
    bug = resp.json()
    assert bug["owner_id"] == me["id"]
    assert bug["priority"] == "Medium"
    assert bug["bug_type"] == "Functional"

    # Explicit owner_id is still honored
    other_headers, other_id = _make_user_with_role(admin_headers, "owner-explicit@test.com", "Explicit Owner", "QA")
    resp = client.post("/api/bugs", json={
        "title": "Explicitly assigned bug",
        "project_id": project["id"],
        "owner_id": other_id
    }, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["owner_id"] == other_id


def test_bug_priority_and_type_round_trip():
    admin_headers = _make_admin()
    project = client.post("/api/projects", json={"name": "PT Proj", "key": "PTP"}, headers=admin_headers).json()

    resp = client.post("/api/bugs", json={
        "title": "Security hole",
        "project_id": project["id"],
        "priority": "Urgent",
        "bug_type": "Security"
    }, headers=admin_headers)
    assert resp.status_code == 200
    bug = resp.json()
    assert bug["priority"] == "Urgent"
    assert bug["bug_type"] == "Security"

    resp = client.put(f"/api/bugs/{bug['id']}", json={"priority": "Low", "bug_type": "Regression"}, headers=admin_headers)
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["priority"] == "Low"
    assert updated["bug_type"] == "Regression"


def test_dev_bug_create_status_restriction():
    admin_headers = _make_admin()
    dev_headers, _ = _make_user_with_role(admin_headers, "devstatus@test.com", "Dev Status", "Dev")
    project = client.post("/api/projects", json={"name": "DevStatus Proj", "key": "DSP"}, headers=admin_headers).json()

    # Dev is a member so they can see/act on the project's bugs
    dev_me = client.get("/api/auth/me", headers=dev_headers).json()
    client.post(f"/api/projects/{project['id']}/members", json={"user_id": dev_me["id"]}, headers=admin_headers)

    # Dev creating a bug pre-set to a disallowed status is rejected
    resp = client.post("/api/bugs", json={
        "title": "Bad status bug",
        "project_id": project["id"],
        "status": "Closed"
    }, headers=dev_headers)
    assert resp.status_code == 403

    # Dev can create with an allowed status
    resp = client.post("/api/bugs", json={
        "title": "Dev bug",
        "project_id": project["id"],
        "status": "Open"
    }, headers=dev_headers)
    assert resp.status_code == 200


def test_dev_bug_read_only_access():
    admin_headers = _make_admin()
    dev_headers, _ = _make_user_with_role(admin_headers, "devreadonly@test.com", "Dev ReadOnly", "Dev")
    project = client.post("/api/projects", json={"name": "ReadOnly Proj", "key": "ROP"}, headers=admin_headers).json()

    dev_me = client.get("/api/auth/me", headers=dev_headers).json()
    client.post(f"/api/projects/{project['id']}/members", json={"user_id": dev_me["id"]}, headers=admin_headers)

    bug = client.post("/api/bugs", json={
        "title": "Read only bug",
        "project_id": project["id"]
    }, headers=dev_headers).json()

    # Dev cannot change status, severity, priority, type, owner, or blocker flag
    for field, value in [
        ("status", "In Progress"),
        ("severity", "Critical"),
        ("priority", "Urgent"),
        ("bug_type", "Security"),
        ("owner_id", dev_me["id"]),
        ("is_blocker", True),
        ("title", "Renamed"),
    ]:
        resp = client.put(f"/api/bugs/{bug['id']}", json={field: value}, headers=dev_headers)
        assert resp.status_code == 403, f"Dev should not be able to edit {field}"

    # Dev CAN add an attachment via the dedicated endpoint (not PUT)
    tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    resp = client.post(f"/api/bugs/{bug['id']}/attachments", json={"screenshot_data": tiny_png}, headers=dev_headers)
    assert resp.status_code == 200
    assert resp.json()["file_url"] is not None

    # But Dev cannot delete an attachment
    attachment_id = resp.json()["id"]
    resp = client.delete(f"/api/bugs/{bug['id']}/attachments/{attachment_id}", headers=dev_headers)
    assert resp.status_code == 403

    # Admin/QA remain fully able to edit
    resp = client.put(f"/api/bugs/{bug['id']}", json={"status": "Closed"}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Closed"


def test_reports_hidden_from_dev():
    admin_headers = _make_admin()
    dev_headers, _ = _make_user_with_role(admin_headers, "devreports@test.com", "Dev Reports", "Dev")

    today_str = datetime.date.today().isoformat()
    resp = client.get(f"/api/reports?start_date={today_str}&end_date={today_str}", headers=dev_headers)
    assert resp.status_code == 403

    resp = client.get(f"/api/reports/export/bugs?start_date={today_str}&end_date={today_str}", headers=dev_headers)
    assert resp.status_code == 403

    # Admin retains access
    resp = client.get(f"/api/reports?start_date={today_str}&end_date={today_str}", headers=admin_headers)
    assert resp.status_code == 200


def test_bug_project_sequence_numbering():
    admin_headers = _make_admin()
    project_a = client.post("/api/projects", json={"name": "Seq Proj A", "key": "SQA"}, headers=admin_headers).json()
    project_b = client.post("/api/projects", json={"name": "Seq Proj B", "key": "SQB"}, headers=admin_headers).json()

    a1 = client.post("/api/bugs", json={"title": "A bug 1", "project_id": project_a["id"]}, headers=admin_headers).json()
    b1 = client.post("/api/bugs", json={"title": "B bug 1", "project_id": project_b["id"]}, headers=admin_headers).json()
    a2 = client.post("/api/bugs", json={"title": "A bug 2", "project_id": project_a["id"]}, headers=admin_headers).json()

    # Each project has its own independent sequence starting at 1
    assert a1["project_sequence"] == 1
    assert b1["project_sequence"] == 1
    assert a2["project_sequence"] == 2

    # The nested project object is present so the frontend never has to fall back to "Unknown Project"
    assert a1["project"]["key"] == "SQA"
    assert a1["project"]["name"] == "Seq Proj A"


def test_dev_visibility_scoping():
    admin_headers = _make_admin()
    dev_headers, dev_id = _make_user_with_role(admin_headers, "devscope@test.com", "Dev Scope", "Dev")
    qa_headers, _ = _make_user_with_role(admin_headers, "qascope@test.com", "QA Scope", "QA")

    project_a = client.post("/api/projects", json={"name": "Scope Proj A", "key": "SPA"}, headers=admin_headers).json()
    project_b = client.post("/api/projects", json={"name": "Scope Proj B", "key": "SPB"}, headers=admin_headers).json()

    # Dev is only a member of Project A
    client.post(f"/api/projects/{project_a['id']}/members", json={"user_id": dev_id}, headers=admin_headers)

    # Bugs in both projects, created by admin (not the Dev)
    bug_a = client.post("/api/bugs", json={"title": "Bug in A", "project_id": project_a["id"]}, headers=admin_headers).json()
    bug_b = client.post("/api/bugs", json={"title": "Bug in B", "project_id": project_b["id"]}, headers=admin_headers).json()

    # Dev: projects list only shows A
    resp = client.get("/api/projects", headers=dev_headers)
    assert resp.status_code == 200
    project_ids = [p["id"] for p in resp.json()]
    assert project_a["id"] in project_ids
    assert project_b["id"] not in project_ids

    # Dev: fetching Project B directly 404s
    resp = client.get(f"/api/projects/{project_b['id']}", headers=dev_headers)
    assert resp.status_code == 404

    # Dev: fetching Project A directly succeeds
    resp = client.get(f"/api/projects/{project_a['id']}", headers=dev_headers)
    assert resp.status_code == 200

    # Dev: bug list only shows bugs from A (including ones not owned/reported by them)
    resp = client.get("/api/bugs", headers=dev_headers)
    assert resp.status_code == 200
    bug_ids = [b["id"] for b in resp.json()]
    assert bug_a["id"] in bug_ids
    assert bug_b["id"] not in bug_ids

    # Admin and QA continue to see everything
    for headers in (admin_headers, qa_headers):
        resp = client.get("/api/projects", headers=headers)
        seen_ids = [p["id"] for p in resp.json()]
        assert project_a["id"] in seen_ids
        assert project_b["id"] in seen_ids

        resp = client.get(f"/api/projects/{project_b['id']}", headers=headers)
        assert resp.status_code == 200

        resp = client.get("/api/bugs", headers=headers)
        seen_bug_ids = [b["id"] for b in resp.json()]
        assert bug_a["id"] in seen_bug_ids


def test_bug_environment_fields_round_trip():
    admin_headers = _make_admin()
    project = client.post("/api/projects", json={"name": "Env Proj", "key": "ENV"}, headers=admin_headers).json()

    bug = client.post("/api/bugs", json={
        "title": "Env bug",
        "project_id": project["id"],
        "environment": "Staging",
        "environment_details": "Chrome 126 on Windows 11"
    }, headers=admin_headers).json()
    assert bug["environment"] == "Staging"
    assert bug["environment_details"] == "Chrome 126 on Windows 11"

    # Defaults to None when omitted
    bug2 = client.post("/api/bugs", json={"title": "No env bug", "project_id": project["id"]}, headers=admin_headers).json()
    assert bug2["environment"] is None

    resp = client.put(f"/api/bugs/{bug2['id']}", json={"environment": "Live", "environment_details": "Prod incident"}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["environment"] == "Live"
    assert resp.json()["environment_details"] == "Prod incident"


def test_bug_reopen_tracking():
    admin_headers = _make_admin()
    project = client.post("/api/projects", json={"name": "Reopen Proj", "key": "RPN"}, headers=admin_headers).json()
    bug = client.post("/api/bugs", json={"title": "Reopen bug", "project_id": project["id"]}, headers=admin_headers).json()
    assert bug["reopen_count"] == 0

    # Open -> In Progress does not count as a reopen
    resp = client.put(f"/api/bugs/{bug['id']}", json={"status": "In Progress"}, headers=admin_headers)
    assert resp.json()["reopen_count"] == 0

    # In Progress -> Resolved does not count as a reopen
    resp = client.put(f"/api/bugs/{bug['id']}", json={"status": "Resolved"}, headers=admin_headers)
    assert resp.json()["reopen_count"] == 0

    # Resolved -> Open is a reopen
    resp = client.put(f"/api/bugs/{bug['id']}", json={"status": "Open"}, headers=admin_headers)
    assert resp.json()["reopen_count"] == 1

    # Resolve then close then reopen again
    client.put(f"/api/bugs/{bug['id']}", json={"status": "Closed"}, headers=admin_headers)
    resp = client.put(f"/api/bugs/{bug['id']}", json={"status": "In Progress"}, headers=admin_headers)
    assert resp.json()["reopen_count"] == 2

    me = client.get("/api/auth/me", headers=admin_headers).json()
    activity = client.get(f"/api/admin/users/{me['id']}/activity", headers=admin_headers).json()
    assert any(a["activity_type"] == "bug_reopened" for a in activity)


def test_bug_attachments_multi_upload_list_delete(tmp_path, monkeypatch):
    from backend.storage import LocalDiskStorage
    monkeypatch.setattr("backend.main.get_storage_backend", lambda: LocalDiskStorage(base_dir=tmp_path))

    admin_headers = _make_admin()
    project = client.post("/api/projects", json={"name": "Attach Proj", "key": "ATP"}, headers=admin_headers).json()
    bug = client.post("/api/bugs", json={"title": "Attach bug", "project_id": project["id"]}, headers=admin_headers).json()

    tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

    ids = []
    for i in range(2):
        resp = client.post(f"/api/bugs/{bug['id']}/attachments", json={"screenshot_data": tiny_png, "filename": f"shot{i}.png"}, headers=admin_headers)
        assert resp.status_code == 200
        ids.append(resp.json()["id"])

    resp = client.get("/api/bugs", headers=admin_headers)
    fetched = next(b for b in resp.json() if b["id"] == bug["id"])
    assert len(fetched["attachments"]) == 2

    resp = client.delete(f"/api/bugs/{bug['id']}/attachments/{ids[0]}", headers=admin_headers)
    assert resp.status_code == 200

    resp = client.get("/api/bugs", headers=admin_headers)
    fetched = next(b for b in resp.json() if b["id"] == bug["id"])
    assert len(fetched["attachments"]) == 1

    # Rejects non-image data
    resp = client.post(f"/api/bugs/{bug['id']}/attachments", json={"screenshot_data": "not-an-image"}, headers=admin_headers)
    assert resp.status_code == 400


def test_bug_links():
    admin_headers = _make_admin()
    project = client.post("/api/projects", json={"name": "Link Proj", "key": "LNK"}, headers=admin_headers).json()
    bug_a = client.post("/api/bugs", json={"title": "Bug A", "project_id": project["id"]}, headers=admin_headers).json()
    bug_b = client.post("/api/bugs", json={"title": "Bug B", "project_id": project["id"]}, headers=admin_headers).json()

    resp = client.post(f"/api/bugs/{bug_a['id']}/links", json={"related_bug_id": bug_b["id"], "link_type": "blocks"}, headers=admin_headers)
    assert resp.status_code == 200
    link = resp.json()
    assert link["direction"] == "outgoing"
    assert link["related_bug"]["id"] == bug_b["id"]

    # A's side shows it as outgoing "blocks"
    resp = client.get(f"/api/bugs/{bug_a['id']}/links", headers=admin_headers)
    a_links = resp.json()
    assert len(a_links) == 1
    assert a_links[0]["direction"] == "outgoing"
    assert a_links[0]["link_type"] == "blocks"

    # B's side shows the same link as incoming
    resp = client.get(f"/api/bugs/{bug_b['id']}/links", headers=admin_headers)
    b_links = resp.json()
    assert len(b_links) == 1
    assert b_links[0]["direction"] == "incoming"
    assert b_links[0]["related_bug"]["id"] == bug_a["id"]

    # Invalid link_type rejected
    resp = client.post(f"/api/bugs/{bug_a['id']}/links", json={"related_bug_id": bug_b["id"], "link_type": "nonsense"}, headers=admin_headers)
    assert resp.status_code == 400

    # Cannot link a bug to itself
    resp = client.post(f"/api/bugs/{bug_a['id']}/links", json={"related_bug_id": bug_a["id"], "link_type": "relates_to"}, headers=admin_headers)
    assert resp.status_code == 400

    # Delete permission: a non-creator, non-Admin/QA Dev cannot delete
    dev_headers, dev_id = _make_user_with_role(admin_headers, "linkdev@test.com", "Link Dev", "Dev")
    client.post(f"/api/projects/{project['id']}/members", json={"user_id": dev_id}, headers=admin_headers)
    resp = client.delete(f"/api/bugs/{bug_a['id']}/links/{link['id']}", headers=dev_headers)
    assert resp.status_code == 403

    resp = client.delete(f"/api/bugs/{bug_a['id']}/links/{link['id']}", headers=admin_headers)
    assert resp.status_code == 200


def test_bug_watchers_and_notifications(fake_smtp):
    admin_headers = _make_admin()
    watcher_headers, watcher_id = _make_user_with_role(admin_headers, "watcher@test.com", "Watcher", "QA")
    project = client.post("/api/projects", json={"name": "Watch Proj", "key": "WCH"}, headers=admin_headers).json()

    bug = client.post("/api/bugs", json={"title": "Watch bug", "project_id": project["id"]}, headers=admin_headers).json()

    # Reporter (admin) is auto-watching their own bug
    resp = client.get(f"/api/bugs/{bug['id']}/watchers", headers=admin_headers)
    watcher_ids = [w["user"]["id"] for w in resp.json()]
    me = client.get("/api/auth/me", headers=admin_headers).json()
    assert me["id"] in watcher_ids

    # Explicit watch/unwatch toggle
    resp = client.post(f"/api/bugs/{bug['id']}/watch", headers=watcher_headers)
    assert resp.status_code == 200
    resp = client.get(f"/api/bugs/{bug['id']}/watchers", headers=admin_headers)
    assert watcher_id in [w["user"]["id"] for w in resp.json()]

    # A status change now notifies the watcher, who is neither reporter nor owner
    resp = client.put(f"/api/bugs/{bug['id']}", json={"status": "In Progress"}, headers=admin_headers)
    assert resp.status_code == 200
    resp = client.get("/api/notifications", headers=watcher_headers)
    assert any(n["type"] == "bug_status_change" for n in resp.json())

    resp = client.delete(f"/api/bugs/{bug['id']}/watch", headers=watcher_headers)
    assert resp.status_code == 200
    resp = client.get(f"/api/bugs/{bug['id']}/watchers", headers=admin_headers)
    assert watcher_id not in [w["user"]["id"] for w in resp.json()]


def test_comment_mentions(fake_smtp):
    admin_headers = _make_admin()
    mentioned_headers, mentioned_id = _make_user_with_role(admin_headers, "mentioned@test.com", "Mentioned Person", "QA")
    project = client.post("/api/projects", json={"name": "Mention Proj", "key": "MNT"}, headers=admin_headers).json()
    bug = client.post("/api/bugs", json={"title": "Mention bug", "project_id": project["id"]}, headers=admin_headers).json()

    resp = client.post("/api/comments", json={
        "bug_id": bug["id"],
        "text": "Hey @Mentioned Person can you take a look?",
        "mentioned_user_ids": [mentioned_id]
    }, headers=admin_headers)
    assert resp.status_code == 200

    resp = client.get("/api/notifications", headers=mentioned_headers)
    assert any(n["type"] == "comment_mention" for n in resp.json())


def test_comment_attachments(tmp_path, monkeypatch):
    from backend.storage import LocalDiskStorage
    monkeypatch.setattr("backend.main.get_storage_backend", lambda: LocalDiskStorage(base_dir=tmp_path))

    admin_headers = _make_admin()
    dev_headers, dev_id = _make_user_with_role(admin_headers, "commentattach@test.com", "Comment Attach Dev", "Dev")
    project = client.post("/api/projects", json={"name": "Comment Attach Proj", "key": "CAP"}, headers=admin_headers).json()
    client.post(f"/api/projects/{project['id']}/members", json={"user_id": dev_id}, headers=admin_headers)
    bug = client.post("/api/bugs", json={"title": "Comment attach bug", "project_id": project["id"]}, headers=admin_headers).json()

    # Dev can comment (already true) and attach an image to that comment
    comment = client.post("/api/comments", json={"bug_id": bug["id"], "text": "Here's what I found"}, headers=dev_headers).json()

    tiny_png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    resp = client.post(f"/api/comments/{comment['id']}/attachments", json={"screenshot_data": tiny_png, "filename": "evidence.png"}, headers=dev_headers)
    assert resp.status_code == 200
    attachment = resp.json()
    assert attachment["comment_id"] == comment["id"]
    assert attachment["bug_id"] == bug["id"]

    # The attachment shows up on the bug's aggregate attachments list
    resp = client.get("/api/bugs", headers=admin_headers)
    fetched = next(b for b in resp.json() if b["id"] == bug["id"])
    assert len(fetched["attachments"]) == 1
    assert fetched["attachments"][0]["comment_id"] == comment["id"]

    # A comment on a project (no bug) cannot take an attachment
    project_comment = client.post("/api/comments", json={"project_id": project["id"], "text": "Project note"}, headers=admin_headers).json()
    resp = client.post(f"/api/comments/{project_comment['id']}/attachments", json={"screenshot_data": tiny_png}, headers=admin_headers)
    assert resp.status_code == 400


def test_saved_bug_filters():
    admin_headers = _make_admin()
    guest_headers, _ = _make_user_with_role(admin_headers, "guestfilter@test.com", "Guest Filter", "Guest")

    resp = client.post("/api/bugs/saved-filters", json={
        "name": "My Critical Bugs",
        "filters": {"severity": "Critical"},
        "is_shared": False
    }, headers=admin_headers)
    assert resp.status_code == 200
    private_filter = resp.json()
    assert private_filter["filters"] == {"severity": "Critical"}

    resp = client.post("/api/bugs/saved-filters", json={
        "name": "Team Blockers",
        "filters": {"priority": "Urgent"},
        "is_shared": True
    }, headers=admin_headers)
    assert resp.status_code == 200
    shared_filter = resp.json()
    assert shared_filter["is_shared"] is True

    # Guest attempting to share is silently downgraded to private
    resp = client.post("/api/bugs/saved-filters", json={
        "name": "Guest View",
        "filters": {},
        "is_shared": True
    }, headers=guest_headers)
    assert resp.status_code == 200
    assert resp.json()["is_shared"] is False

    # Admin sees their own private filter + the shared one, not the guest's
    resp = client.get("/api/bugs/saved-filters", headers=admin_headers)
    names = {f["name"] for f in resp.json()}
    assert "My Critical Bugs" in names
    assert "Team Blockers" in names
    assert "Guest View" not in names

    # Guest sees the shared filter + their own private one
    resp = client.get("/api/bugs/saved-filters", headers=guest_headers)
    names = {f["name"] for f in resp.json()}
    assert "Team Blockers" in names
    assert "Guest View" in names
    assert "My Critical Bugs" not in names

    # Only the creator or Admin can delete
    resp = client.delete(f"/api/bugs/saved-filters/{shared_filter['id']}", headers=guest_headers)
    assert resp.status_code == 403
    resp = client.delete(f"/api/bugs/saved-filters/{shared_filter['id']}", headers=admin_headers)
    assert resp.status_code == 200


def test_bulk_update_bugs():
    admin_headers = _make_admin()
    qa_headers, _ = _make_user_with_role(admin_headers, "bulkqa@test.com", "Bulk QA", "QA")
    dev_headers, dev_id = _make_user_with_role(admin_headers, "bulkdev@test.com", "Bulk Dev", "Dev")

    project_a = client.post("/api/projects", json={"name": "Bulk Proj A", "key": "BKA"}, headers=admin_headers).json()
    project_b = client.post("/api/projects", json={"name": "Bulk Proj B", "key": "BKB"}, headers=admin_headers).json()
    bug_a = client.post("/api/bugs", json={"title": "Bulk bug A", "project_id": project_a["id"]}, headers=admin_headers).json()
    bug_b = client.post("/api/bugs", json={"title": "Bulk bug B", "project_id": project_b["id"]}, headers=admin_headers).json()

    # Admin/QA bulk status change across bugs in different projects succeeds
    resp = client.patch("/api/bugs/bulk-update", json={
        "bug_ids": [bug_a["id"], bug_b["id"]],
        "fields": {"status": "In Progress"}
    }, headers=qa_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert sorted(body["updated"]) == sorted([bug_a["id"], bug_b["id"]])
    assert body["failed"] == []

    # Dev's bulk attempt reports every bug as failed (zero editable fields)
    client.post(f"/api/projects/{project_a['id']}/members", json={"user_id": dev_id}, headers=admin_headers)
    resp = client.patch("/api/bugs/bulk-update", json={
        "bug_ids": [bug_a["id"]],
        "fields": {"status": "Resolved"}
    }, headers=dev_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["updated"] == []
    assert len(body["failed"]) == 1
    assert body["failed"][0]["bug_id"] == bug_a["id"]

    # Unsupported field rejected up front
    resp = client.patch("/api/bugs/bulk-update", json={
        "bug_ids": [bug_a["id"]],
        "fields": {"title": "Nope"}
    }, headers=admin_headers)
    assert resp.status_code == 400

    # Nonexistent bug id fails gracefully without blocking the valid one
    resp = client.patch("/api/bugs/bulk-update", json={
        "bug_ids": [bug_b["id"], 999999],
        "fields": {"owner_id": -1}
    }, headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert bug_b["id"] in body["updated"]
    assert any(f["bug_id"] == 999999 for f in body["failed"])


def test_screenshot_url_migration_backfill(tmp_path):
    from sqlalchemy import create_engine as _create_engine, text as _text
    import backend.main as main_module

    db_path = tmp_path / "legacy.db"
    legacy_engine = _create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})

    # Build the current schema (including bug_attachments), then add back the
    # legacy screenshot_url column to simulate a pre-migration database.
    Base.metadata.create_all(bind=legacy_engine)
    with legacy_engine.begin() as conn:
        conn.execute(_text("ALTER TABLE bugs ADD COLUMN screenshot_url VARCHAR"))
        conn.execute(_text(
            "INSERT INTO users (id, email, hashed_password, full_name, role, is_active) "
            "VALUES (1, 'legacy@test.com', 'x', 'Legacy', 'Admin', 1)"
        ))
        conn.execute(_text(
            "INSERT INTO projects (id, name, key, status) VALUES (1, 'Legacy Proj', 'LEG', 'Intake')"
        ))
        conn.execute(_text(
            "INSERT INTO bugs (id, project_id, title, status, severity, priority, bug_type, reporter_id, screenshot_url) "
            "VALUES (1, 1, 'Legacy bug', 'Open', 'Medium', 'Medium', 'Functional', 1, '/uploads/screenshots/legacy.png')"
        ))

    original_engine = main_module.engine
    main_module.engine = legacy_engine
    try:
        main_module.ensure_sqlite_schema()
        main_module.ensure_sqlite_schema()  # idempotency check
    finally:
        main_module.engine = original_engine

    with legacy_engine.begin() as conn:
        bug_columns = {row[1] for row in conn.execute(_text("PRAGMA table_info(bugs)")).fetchall()}
        assert "screenshot_url" not in bug_columns

        rows = conn.execute(_text("SELECT bug_id, file_url FROM bug_attachments")).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == 1
        assert rows[0][1] == "/uploads/screenshots/legacy.png"


def test_component_crud_and_bug_assignment():
    admin_headers = _make_admin()
    pm_headers, _ = _make_user_with_role(admin_headers, "compsspm@test.com", "Comp PM", "PM")
    dev_headers, _ = _make_user_with_role(admin_headers, "compsdev@test.com", "Comp Dev", "Dev")
    guest_headers, _ = _make_user_with_role(admin_headers, "compsguest@test.com", "Comp Guest", "Guest")

    project_a = client.post("/api/projects", json={"name": "Comp Proj A", "key": "CPA"}, headers=admin_headers).json()
    project_b = client.post("/api/projects", json={"name": "Comp Proj B", "key": "CPB"}, headers=admin_headers).json()

    # Admin, PM, QA can create components; Dev and Guest cannot
    resp = client.post(f"/api/projects/{project_a['id']}/components", json={"name": "Checkout"}, headers=admin_headers)
    assert resp.status_code == 200
    component = resp.json()
    assert component["name"] == "Checkout"
    assert component["project_id"] == project_a["id"]

    resp = client.post(f"/api/projects/{project_a['id']}/components", json={"name": "Auth"}, headers=pm_headers)
    assert resp.status_code == 200

    resp = client.post(f"/api/projects/{project_a['id']}/components", json={"name": "Nope"}, headers=dev_headers)
    assert resp.status_code == 403
    resp = client.post(f"/api/projects/{project_a['id']}/components", json={"name": "Nope"}, headers=guest_headers)
    assert resp.status_code == 403

    # List returns both
    resp = client.get(f"/api/projects/{project_a['id']}/components", headers=dev_headers)
    assert resp.status_code == 200
    names = {c["name"] for c in resp.json()}
    assert names == {"Checkout", "Auth"}

    # Assign on create
    bug = client.post("/api/bugs", json={
        "title": "Checkout bug",
        "project_id": project_a["id"],
        "component_id": component["id"]
    }, headers=admin_headers).json()
    assert bug["component"]["name"] == "Checkout"

    # Assign on update
    bug2 = client.post("/api/bugs", json={"title": "No component yet", "project_id": project_a["id"]}, headers=admin_headers).json()
    assert bug2["component"] is None
    resp = client.put(f"/api/bugs/{bug2['id']}", json={"component_id": component["id"]}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["component"]["name"] == "Checkout"

    # A component from a different project is rejected
    component_b = client.post(f"/api/projects/{project_b['id']}/components", json={"name": "OtherComp"}, headers=admin_headers).json()
    resp = client.post("/api/bugs", json={
        "title": "Cross-project component",
        "project_id": project_a["id"],
        "component_id": component_b["id"]
    }, headers=admin_headers)
    assert resp.status_code == 404


def test_bug_labels():
    admin_headers = _make_admin()
    dev_headers, dev_id = _make_user_with_role(admin_headers, "labeldev@test.com", "Label Dev", "Dev")
    guest_headers, _ = _make_user_with_role(admin_headers, "labelguest@test.com", "Label Guest", "Guest")
    project = client.post("/api/projects", json={"name": "Label Proj", "key": "LBP"}, headers=admin_headers).json()
    bug = client.post("/api/bugs", json={"title": "Label bug", "project_id": project["id"]}, headers=admin_headers).json()

    # Guest and Dev can both add labels
    resp = client.post(f"/api/bugs/{bug['id']}/labels", json={"name": "Regression"}, headers=guest_headers)
    assert resp.status_code == 200
    guest_label = resp.json()
    assert guest_label["name"] == "regression"  # normalized to lowercase

    resp = client.post(f"/api/bugs/{bug['id']}/labels", json={"name": "customer-reported"}, headers=dev_headers)
    assert resp.status_code == 200
    dev_label = resp.json()

    # Duplicate (case-insensitive) add is idempotent, no new row
    resp = client.post(f"/api/bugs/{bug['id']}/labels", json={"name": "regression"}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == guest_label["id"]

    resp = client.get(f"/api/bugs/{bug['id']}/labels", headers=admin_headers)
    assert len(resp.json()) == 2

    # Labels show up embedded on the bug
    resp = client.get("/api/bugs", headers=admin_headers)
    fetched = next(b for b in resp.json() if b["id"] == bug["id"])
    assert sorted(fetched["labels"]) == ["customer-reported", "regression"]

    # Delete permission: a Dev who didn't create the label cannot remove it
    resp = client.delete(f"/api/bugs/{bug['id']}/labels/{guest_label['id']}", headers=dev_headers)
    assert resp.status_code == 403

    # But the Dev can remove their own label
    resp = client.delete(f"/api/bugs/{bug['id']}/labels/{dev_label['id']}", headers=dev_headers)
    assert resp.status_code == 200

    # Admin can remove anyone's label
    resp = client.delete(f"/api/bugs/{bug['id']}/labels/{guest_label['id']}", headers=admin_headers)
    assert resp.status_code == 200

    resp = client.get(f"/api/bugs/{bug['id']}/labels", headers=admin_headers)
    assert resp.json() == []


def test_label_suggestions():
    admin_headers = _make_admin()
    project = client.post("/api/projects", json={"name": "Suggest Proj", "key": "SGP"}, headers=admin_headers).json()
    bug_a = client.post("/api/bugs", json={"title": "Bug A", "project_id": project["id"]}, headers=admin_headers).json()
    bug_b = client.post("/api/bugs", json={"title": "Bug B", "project_id": project["id"]}, headers=admin_headers).json()

    client.post(f"/api/bugs/{bug_a['id']}/labels", json={"name": "Flaky"}, headers=admin_headers)
    client.post(f"/api/bugs/{bug_b['id']}/labels", json={"name": "flaky"}, headers=admin_headers)  # same after normalization
    client.post(f"/api/bugs/{bug_b['id']}/labels", json={"name": "perf"}, headers=admin_headers)

    resp = client.get(f"/api/projects/{project['id']}/labels/suggestions", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json() == ["flaky", "perf"]


def test_project_vendor_field():
    admin_headers = _make_admin()
    project = client.post(
        "/api/projects",
        json={"name": "Vendor Proj", "key": "VDP", "vendor": "Acme Corp"},
        headers=admin_headers
    ).json()
    assert project["vendor"] == "Acme Corp"

    # Update the vendor
    resp = client.put(f"/api/projects/{project['id']}", json={"vendor": "Globex Inc"}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["vendor"] == "Globex Inc"

    # Project created without a vendor defaults to null
    project_b = client.post("/api/projects", json={"name": "No Vendor Proj", "key": "NVP"}, headers=admin_headers).json()
    assert project_b["vendor"] is None


def test_version_scoped_document_upload(tmp_path, monkeypatch):
    from backend.storage import LocalDiskStorage
    monkeypatch.setattr("backend.main.get_storage_backend", lambda: LocalDiskStorage(base_dir=tmp_path))

    admin_headers = _make_admin()
    project_a = client.post("/api/projects", json={"name": "Changelog Proj A", "key": "CLA"}, headers=admin_headers).json()
    project_b = client.post("/api/projects", json={"name": "Changelog Proj B", "key": "CLB"}, headers=admin_headers).json()
    version = client.post(
        f"/api/projects/{project_a['id']}/versions",
        json={"version_name": "v1.0"},
        headers=admin_headers
    ).json()

    resp = client.post(
        f"/api/projects/{project_a['id']}/documents",
        headers=admin_headers,
        data={"title": "v1.0 Changelog", "doc_type": "Changelog", "version_id": str(version["id"])},
        files={"file": ("changelog.txt", b"- fixed things", "text/plain")}
    )
    assert resp.status_code == 200
    doc = resp.json()
    assert doc["version_id"] == version["id"]
    assert doc["doc_type"] == "Changelog"

    # A version_id belonging to a different project is rejected
    resp = client.post(
        f"/api/projects/{project_b['id']}/documents",
        headers=admin_headers,
        data={"title": "Cross-project", "doc_type": "Changelog", "version_id": str(version["id"])},
        files={"file": ("changelog.txt", b"- fixed things", "text/plain")}
    )
    assert resp.status_code == 404

    # A document uploaded without a version_id is still project-level (null)
    resp = client.post(
        f"/api/projects/{project_a['id']}/documents",
        headers=admin_headers,
        data={"title": "General doc", "doc_type": "Other"},
        files={"file": ("notes.txt", b"notes", "text/plain")}
    )
    assert resp.status_code == 200
    assert resp.json()["version_id"] is None
