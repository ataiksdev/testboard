import pytest
import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.main import app
from backend.models import User, Project, Bug, Version, Comment, ActivityLog

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

    # 6. Approve the pending user
    resp = client.post(f"/api/admin/users/{dev_data['id']}/approve", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["role"] == "Member"

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
    # Bug.created_at/resolved_at are stored in UTC (datetime.utcnow()), and the
    # /api/reports endpoint interprets start_date/end_date as UTC calendar dates,
    # so "today" must be computed in UTC here too (local date can differ near midnight).
    today_str = datetime.datetime.utcnow().date().isoformat()
    resp = client.get(f"/api/reports?start_date={today_str}&end_date={today_str}", headers=headers)
    assert resp.status_code == 200
    report = resp.json()
    
    assert report["bug_metrics"]["total_bugs"] == 1
    assert report["bug_metrics"]["blocker_bugs"] == 1
    assert len(report["blockers_encountered"]) == 1
    assert report["bug_metrics"]["mttr_hours"] >= 0.0
