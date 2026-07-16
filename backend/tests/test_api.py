import pytest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.main import app
from backend.models import User, Project, Bug, Version, Comment, ActivityLog, ProjectMember

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
