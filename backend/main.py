import base64
import datetime
import io
import json
import re
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Query, Form, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import text, func
from sqlalchemy.orm import Session
import os
from dotenv import load_dotenv

# Load .env before any backend module reads its config at import time
# (backend.auth reads TESTBOARD_SECRET_KEY, backend.storage/notifications
# read their own TESTBOARD_* vars). Safe no-op if .env doesn't exist.
load_dotenv()

from backend.database import engine, Base, get_db, SessionLocal
from backend.models import (
    User, Project, Version, Bug, Comment, ActivityLog, ProjectMember, ProjectDocument,
    PasswordResetRequest, Notification, BugAttachment, BugWatcher, BugLink, SavedBugFilter
)
from backend.schemas import (
    UserCreate, UserOut, UserUpdate, UserApprove, Token,
    PasswordResetRequestCreate, PasswordResetRequestOut, PasswordResetResolve,
    ASSIGNABLE_ROLES,
    ProjectCreate, ProjectOut, ProjectUpdate,
    ProjectMemberCreate, ProjectMemberOut, UserProjectOut,
    ProjectDocumentOut,
    NotificationOut,
    VersionBase, VersionCreate, VersionOut, VersionUpdate,
    BugCreate, BugOut, BugUpdate,
    BugAttachmentCreate, BugAttachmentOut, BugSummaryOut, BugLinkCreate, BugLinkOut, BugWatcherOut,
    SavedBugFilterCreate, SavedBugFilterOut, BugBulkUpdateIn,
    CommentCreate, CommentOut,
    ActivityLogOut,
    ReportDataOut
)
from backend.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, get_current_admin, require_roles
)
from backend.reporter import (
    calculate_qa_metrics, generate_csv_bugs_report, generate_csv_projects_report,
    generate_csv_version_readiness, generate_csv_team_workload, generate_csv_activity_timeline
)
from backend.storage import get_storage_backend
from backend.notifications import notify, notify_admins, notify_project_members

# UPLOADS_DIR must match storage.py's LocalDiskStorage default so the /uploads
# static mount always serves whatever the local backend actually writes to.
UPLOADS_DIR = Path(os.getenv("TESTBOARD_STORAGE_DIR") or (Path(__file__).resolve().parent / "uploads"))
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

DOCUMENT_MIME_TYPES = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "txt",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}

# Initialize Database tables
Base.metadata.create_all(bind=engine)

def ensure_sqlite_schema():
    if not str(engine.url).startswith("sqlite"):
        return
    with engine.begin() as connection:
        bug_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(bugs)")).fetchall()
        }
        if "priority" not in bug_columns:
            connection.execute(text("ALTER TABLE bugs ADD COLUMN priority VARCHAR DEFAULT 'Medium'"))
        if "bug_type" not in bug_columns:
            connection.execute(text("ALTER TABLE bugs ADD COLUMN bug_type VARCHAR DEFAULT 'Functional'"))
        if "expected_behavior" not in bug_columns:
            connection.execute(text("ALTER TABLE bugs ADD COLUMN expected_behavior TEXT"))
        if "project_sequence" not in bug_columns:
            connection.execute(text("ALTER TABLE bugs ADD COLUMN project_sequence INTEGER"))
        if "environment" not in bug_columns:
            connection.execute(text("ALTER TABLE bugs ADD COLUMN environment VARCHAR"))
        if "environment_details" not in bug_columns:
            connection.execute(text("ALTER TABLE bugs ADD COLUMN environment_details TEXT"))
        if "reopen_count" not in bug_columns:
            connection.execute(text("ALTER TABLE bugs ADD COLUMN reopen_count INTEGER DEFAULT 0"))

        attachment_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(bug_attachments)")).fetchall()
        }
        if "comment_id" not in attachment_columns:
            connection.execute(text("ALTER TABLE bug_attachments ADD COLUMN comment_id INTEGER"))

        # Legacy screenshot_url -> bug_attachments migration. bug_attachments
        # already exists here since Base.metadata.create_all() runs before this
        # function. NOT EXISTS guard keeps the backfill idempotent even if
        # DROP COLUMN below can't run (older SQLite).
        if "screenshot_url" in bug_columns:
            connection.execute(text("""
                INSERT INTO bug_attachments (bug_id, uploaded_by_id, file_url, original_filename, content_type, file_size, created_at)
                SELECT b.id, b.reporter_id, b.screenshot_url, 'screenshot', NULL, NULL, b.created_at
                FROM bugs b
                WHERE b.screenshot_url IS NOT NULL AND b.screenshot_url != ''
                AND NOT EXISTS (
                    SELECT 1 FROM bug_attachments a
                    WHERE a.bug_id = b.id AND a.file_url = b.screenshot_url
                )
            """))
            try:
                connection.execute(text("ALTER TABLE bugs DROP COLUMN screenshot_url"))
            except Exception:
                pass  # SQLite < 3.35 can't drop columns; the leftover column is inert since the model no longer references it

        # Backfill per-project sequence numbers for any bugs that don't have one yet
        connection.execute(text("""
            UPDATE bugs
            SET project_sequence = (
                SELECT COUNT(*)
                FROM bugs AS earlier
                WHERE earlier.project_id = bugs.project_id
                AND earlier.id <= bugs.id
            )
            WHERE project_sequence IS NULL
        """))

        user_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(users)")).fetchall()
        }
        if "is_active" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))

        # Migrate legacy "Member" role to the new "QA" role
        connection.execute(text("UPDATE users SET role = 'QA' WHERE role = 'Member'"))

        # Normalize emails to lowercase so login/registration are case-insensitive
        connection.execute(text("UPDATE users SET email = LOWER(email) WHERE email != LOWER(email)"))

ensure_sqlite_schema()

def backfill_project_leads_as_members():
    db = SessionLocal()
    try:
        projects_with_leads = db.query(Project).filter(Project.lead_id.isnot(None)).all()
        for project in projects_with_leads:
            exists = db.query(ProjectMember).filter(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == project.lead_id
            ).first()
            if not exists:
                db.add(ProjectMember(project_id=project.id, user_id=project.lead_id))
        db.commit()
    finally:
        db.close()

backfill_project_leads_as_members()

app = FastAPI(title="TestBoard QA Tracker API", version="1.0.0")

# Enable CORS for development
allowed_origins = [
    origin.strip()
    for origin in os.getenv("TESTBOARD_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Also allow access from other devices on the same private network (dev only).
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def require_active_user(db: Session, user_id: int, detail: str = "User not found") -> User:
    user = db.query(User).filter(
        User.id == user_id,
        User.role.in_(["Admin", "PM", "Dev", "QA"]),
        User.is_active == True
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail=detail)
    return user

def ensure_project_membership(db: Session, project_id: int, user_id: int):
    exists = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()
    if not exists:
        db.add(ProjectMember(project_id=project_id, user_id=user_id))
        db.commit()

def require_project(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

def require_version_for_project(db: Session, version_id: int, project_id: int) -> Version:
    version = db.query(Version).filter(
        Version.id == version_id,
        Version.project_id == project_id
    ).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found for project")
    return version

def save_screenshot_data(screenshot_data: Optional[str]) -> Optional[str]:
    if not screenshot_data:
        return None

    match = re.match(r"^data:(image/(png|jpeg|jpg|webp|gif));base64,(.+)$", screenshot_data)
    if not match:
        raise HTTPException(status_code=400, detail="Screenshot must be a PNG, JPEG, WebP, or GIF image")

    mime_type = match.group(1)
    raw_data = match.group(3)
    try:
        image_bytes = base64.b64decode(raw_data, validate=True)
    except ValueError:
        raise HTTPException(status_code=400, detail="Screenshot data is not valid base64")

    max_size_bytes = 5 * 1024 * 1024
    if len(image_bytes) > max_size_bytes:
        raise HTTPException(status_code=400, detail="Screenshot must be 5 MB or smaller")

    extension = "jpg" if mime_type == "image/jpeg" else mime_type.split("/")[-1]
    return get_storage_backend().save(image_bytes, extension, mime_type=mime_type, subfolder="screenshots")

# ==================== AUTHENTICATION ENDPOINTS ====================

@app.post("/api/auth/register", response_model=UserOut)
def register(user_in: UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    normalized_email = user_in.email.lower()

    # Check if email exists
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # First user is automatically Admin, others are Pending
    total_users = db.query(User).count()
    role = "Admin" if total_users == 0 else "Pending"

    hashed_pwd = get_password_hash(user_in.password)
    new_user = User(
        email=normalized_email,
        hashed_password=hashed_pwd,
        full_name=user_in.full_name,
        role=role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    if role == "Pending":
        notify_admins(
            db,
            notif_type="access_requested",
            title=f"New access request from {new_user.full_name}",
            body=f"{new_user.full_name} ({new_user.email}) requested access to TestBoard.",
            link="#admin",
            background_tasks=background_tasks,
            email=True,
        )

    return new_user

@app.post("/api/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username.lower()).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect email or password"
        )
    
    if user.role == "Pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your registration access request is pending Admin approval."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator."
        )

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserOut)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/api/auth/forgot-password")
def forgot_password(request_in: PasswordResetRequestCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request_in.email.lower()).first()
    # Always return a generic response so this endpoint can't be used to
    # enumerate which emails have accounts.
    generic_response = {
        "message": "If an account exists for this email, an admin has been notified and will be in touch to reset your password."
    }
    if not user:
        return generic_response

    existing_pending = db.query(PasswordResetRequest).filter(
        PasswordResetRequest.user_id == user.id,
        PasswordResetRequest.status == "Pending"
    ).first()
    if not existing_pending:
        db.add(PasswordResetRequest(user_id=user.id))
        db.commit()

        notify_admins(
            db,
            notif_type="password_reset_requested",
            title=f"Password reset requested by {user.full_name}",
            body=f"{user.full_name} ({user.email}) requested a password reset.",
            link="#admin",
            background_tasks=background_tasks,
            email=True,
        )

    return generic_response


# ==================== NOTIFICATIONS ENDPOINTS ====================

@app.get("/api/notifications", response_model=List[NotificationOut])
def list_notifications(
    unread_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    return query.order_by(Notification.created_at.desc()).limit(50).all()

@app.get("/api/notifications/unread-count")
def get_unread_notification_count(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).count()
    return {"count": count}

@app.post("/api/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(notification_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification

@app.post("/api/notifications/read-all")
def mark_all_notifications_read(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read"}


# ==================== ADMIN ENDPOINTS ====================

@app.get("/api/admin/users/pending", response_model=List[UserOut])
def get_pending_users(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(User).filter(User.role == "Pending").all()

@app.get("/api/admin/password-resets/pending", response_model=List[PasswordResetRequestOut])
def get_pending_password_resets(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(PasswordResetRequest).filter(PasswordResetRequest.status == "Pending").order_by(PasswordResetRequest.created_at).all()

@app.post("/api/admin/password-resets/{request_id}/resolve", response_model=PasswordResetRequestOut)
def resolve_password_reset(request_id: int, resolution: PasswordResetResolve, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    reset_request = db.query(PasswordResetRequest).filter(PasswordResetRequest.id == request_id).first()
    if not reset_request:
        raise HTTPException(status_code=404, detail="Password reset request not found")
    if reset_request.status != "Pending":
        raise HTTPException(status_code=400, detail="This request has already been handled")
    if len(resolution.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    reset_request.user.hashed_password = get_password_hash(resolution.new_password)
    reset_request.status = "Resolved"
    reset_request.resolved_at = datetime.datetime.utcnow()
    reset_request.resolved_by_id = admin.id
    db.commit()
    db.refresh(reset_request)
    return reset_request

@app.post("/api/admin/password-resets/{request_id}/dismiss", response_model=PasswordResetRequestOut)
def dismiss_password_reset(request_id: int, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    reset_request = db.query(PasswordResetRequest).filter(PasswordResetRequest.id == request_id).first()
    if not reset_request:
        raise HTTPException(status_code=404, detail="Password reset request not found")
    if reset_request.status != "Pending":
        raise HTTPException(status_code=400, detail="This request has already been handled")

    reset_request.status = "Dismissed"
    reset_request.resolved_at = datetime.datetime.utcnow()
    reset_request.resolved_by_id = admin.id
    db.commit()
    db.refresh(reset_request)
    return reset_request

@app.post("/api/admin/users/{user_id}/approve", response_model=UserOut)
def approve_user(user_id: int, approval: UserApprove, background_tasks: BackgroundTasks, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    if approval.role not in ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {ASSIGNABLE_ROLES}")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = approval.role
    db.commit()
    db.refresh(user)

    notify(
        db,
        user.id,
        notif_type="account_approved",
        title="Your access to TestBoard has been approved",
        body=f"You've been approved as {user.role}. You can now sign in.",
        background_tasks=background_tasks,
        email=True,
    )

    return user

@app.post("/api/admin/users/{user_id}/reject")
def reject_user(user_id: int, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "Pending":
        raise HTTPException(status_code=400, detail="Can only reject pending users")
    db.delete(user)
    db.commit()
    return {"message": "Access request rejected and user deleted successfully"}

@app.get("/api/admin/users", response_model=List[UserOut])
def list_all_users(
    role: Optional[str] = None,
    search: Optional[str] = None,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if search:
        like = f"%{search}%"
        query = query.filter((User.full_name.ilike(like)) | (User.email.ilike(like)))
    return query.order_by(User.full_name).all()

def _count_active_admins(db: Session, exclude_user_id: Optional[int] = None) -> int:
    query = db.query(User).filter(User.role == "Admin", User.is_active == True)
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return query.count()

@app.put("/api/admin/users/{user_id}", response_model=UserOut)
def update_user_admin(user_id: int, update: UserUpdate, background_tasks: BackgroundTasks, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    demoting_admin = update.role is not None and update.role != "Admin" and user.role == "Admin"
    deactivating_admin = update.is_active is False and user.role == "Admin" and user.is_active

    if (demoting_admin or deactivating_admin) and _count_active_admins(db, exclude_user_id=user.id) == 0:
        raise HTTPException(status_code=400, detail="Cannot remove the last active Admin")

    old_role = user.role
    if update.role is not None:
        if update.role not in ASSIGNABLE_ROLES:
            raise HTTPException(status_code=400, detail=f"Role must be one of {ASSIGNABLE_ROLES}")
        user.role = update.role
    if update.full_name is not None:
        user.full_name = update.full_name
    if update.is_active is not None:
        user.is_active = update.is_active

    db.commit()
    db.refresh(user)

    if update.role is not None and update.role != old_role:
        notify(
            db,
            user.id,
            notif_type="role_changed",
            title="Your TestBoard role has changed",
            body=f"Your role was changed from {old_role} to {user.role}.",
            background_tasks=background_tasks,
            email=True,
        )

    return user

@app.get("/api/admin/users/{user_id}/activity", response_model=List[ActivityLogOut])
def get_user_activity(user_id: int, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=404, detail="User not found")
    return db.query(ActivityLog).filter(ActivityLog.user_id == user_id).order_by(ActivityLog.created_at.desc()).limit(100).all()

@app.get("/api/admin/users/{user_id}/projects", response_model=List[UserProjectOut])
def get_user_projects(user_id: int, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    if not db.query(User).filter(User.id == user_id).first():
        raise HTTPException(status_code=404, detail="User not found")
    return (
        db.query(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == user_id)
        .all()
    )


# ==================== USERS ENDPOINTS ====================

@app.get("/api/users", response_model=List[UserOut])
def get_all_active_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Returns assignable users (excludes Guest/Pending) for lead/owner pickers
    return db.query(User).filter(User.role.in_(["Admin", "PM", "Dev", "QA"]), User.is_active == True).all()


# ==================== PROJECTS ENDPOINTS ====================

@app.post("/api/projects", response_model=ProjectOut)
def create_project(project_in: ProjectCreate, current_user: User = Depends(require_roles("Admin", "PM", "QA")), db: Session = Depends(get_db)):
    # Check key uniqueness
    dup_key = db.query(Project).filter(Project.key == project_in.key.upper()).first()
    if dup_key:
        raise HTTPException(status_code=400, detail="Project key already exists")

    # Check name uniqueness
    dup_name = db.query(Project).filter(Project.name == project_in.name).first()
    if dup_name:
        raise HTTPException(status_code=400, detail="Project name already exists")

    lead_id = project_in.lead_id or current_user.id
    require_active_user(db, lead_id, detail="Project lead not found")

    new_project = Project(
        name=project_in.name,
        key=project_in.key.upper(),
        description=project_in.description,
        status=project_in.status,
        lead_id=lead_id
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    ensure_project_membership(db, new_project.id, lead_id)

    # Log activity
    log = ActivityLog(
        user_id=current_user.id,
        project_id=new_project.id,
        activity_type="project_created",
        new_value=new_project.status
    )
    db.add(log)
    db.commit()

    return new_project

def _visible_project_ids(db: Session, user: User) -> Optional[List[int]]:
    """Returns None for unrestricted visibility, or the list of project IDs
    a scoped role (currently just Dev) is a member of."""
    if user.role != "Dev":
        return None
    return [m.project_id for m in db.query(ProjectMember).filter(ProjectMember.user_id == user.id).all()]

@app.get("/api/projects", response_model=List[ProjectOut])
def list_projects(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    visible_ids = _visible_project_ids(db, current_user)
    query = db.query(Project)
    if visible_ids is not None:
        query = query.filter(Project.id.in_(visible_ids))
    return query.all()

@app.get("/api/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    visible_ids = _visible_project_ids(db, current_user)
    if visible_ids is not None and project_id not in visible_ids:
        raise HTTPException(status_code=404, detail="Project not found")
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.put("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, project_in: ProjectUpdate, background_tasks: BackgroundTasks, current_user: User = Depends(require_roles("Admin", "PM", "QA")), db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    old_status = project.status

    # Apply updates
    if project_in.name is not None:
        project.name = project_in.name
    if project_in.key is not None:
        project.key = project_in.key.upper()
    if project_in.description is not None:
        project.description = project_in.description
    if project_in.status is not None:
        project.status = project_in.status
    if project_in.lead_id is not None:
        require_active_user(db, project_in.lead_id, detail="Project lead not found")
        project.lead_id = project_in.lead_id

    db.commit()
    db.refresh(project)

    if project_in.lead_id is not None:
        ensure_project_membership(db, project.id, project.lead_id)
    
    # Log status change if applicable
    if project_in.status is not None and old_status != project.status:
        log = ActivityLog(
            user_id=current_user.id,
            project_id=project.id,
            activity_type="project_status_change",
            old_value=old_status,
            new_value=project.status
        )
        db.add(log)
        db.commit()

        notify_project_members(
            db,
            project.id,
            notif_type="project_status_change",
            title=f"{project.name} moved to {project.status}",
            body=f"{current_user.full_name} changed the status from {old_status} to {project.status}.",
            link="#projects",
            background_tasks=background_tasks,
            exclude_user_id=current_user.id,
        )

    return project


# ==================== VERSIONS ENDPOINTS ====================

@app.post("/api/projects/{project_id}/versions", response_model=VersionOut)
def create_version(project_id: int, version_in: VersionBase, current_user: User = Depends(require_roles("Admin", "PM", "QA")), db: Session = Depends(get_db)):
    # Verify project exists
    require_project(db, project_id)
        
    new_version = Version(
        project_id=project_id,
        version_name=version_in.version_name,
        status=version_in.status,
        release_date=version_in.release_date
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)
    return new_version

@app.get("/api/projects/{project_id}/versions", response_model=List[VersionOut])
def list_versions(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_project(db, project_id)
    return db.query(Version).filter(Version.project_id == project_id).all()


# ==================== PROJECT MEMBERS ENDPOINTS ====================

@app.get("/api/projects/{project_id}/members", response_model=List[ProjectMemberOut])
def list_project_members(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_project(db, project_id)
    return db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()

@app.post("/api/projects/{project_id}/members", response_model=ProjectMemberOut)
def add_project_member(project_id: int, member_in: ProjectMemberCreate, current_user: User = Depends(require_roles("Admin", "PM")), db: Session = Depends(get_db)):
    require_project(db, project_id)
    require_active_user(db, member_in.user_id, detail="User not found")

    existing = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == member_in.user_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member of this project")

    member = ProjectMember(project_id=project_id, user_id=member_in.user_id)
    db.add(member)
    db.commit()
    db.refresh(member)
    return member

@app.delete("/api/projects/{project_id}/members/{user_id}")
def remove_project_member(project_id: int, user_id: int, current_user: User = Depends(require_roles("Admin", "PM")), db: Session = Depends(get_db)):
    member = db.query(ProjectMember).filter(
        ProjectMember.project_id == project_id,
        ProjectMember.user_id == user_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Membership not found")
    db.delete(member)
    db.commit()
    return {"message": "Member removed from project"}


# ==================== PROJECT DOCUMENTS ENDPOINTS ====================

MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024

@app.get("/api/projects/{project_id}/documents", response_model=List[ProjectDocumentOut])
def list_project_documents(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_project(db, project_id)
    return (
        db.query(ProjectDocument)
        .filter(ProjectDocument.project_id == project_id)
        .order_by(ProjectDocument.created_at.desc())
        .all()
    )

@app.post("/api/projects/{project_id}/documents", response_model=ProjectDocumentOut)
async def upload_project_document(
    project_id: int,
    title: str = Form(...),
    doc_type: str = Form("Other"),
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles("Admin", "PM", "QA")),
    db: Session = Depends(get_db)
):
    require_project(db, project_id)

    extension = DOCUMENT_MIME_TYPES.get(file.content_type)
    if not extension:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: PDF, Word, Excel, PowerPoint, text, or image files."
        )

    content = await file.read()
    if len(content) > MAX_DOCUMENT_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="Document must be 20 MB or smaller")

    file_url = get_storage_backend().save(content, extension, mime_type=file.content_type, subfolder="documents")

    document = ProjectDocument(
        project_id=project_id,
        uploaded_by_id=current_user.id,
        title=title,
        doc_type=doc_type,
        file_url=file_url,
        original_filename=file.filename or f"document.{extension}",
        content_type=file.content_type,
        file_size=len(content)
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    log = ActivityLog(
        user_id=current_user.id,
        project_id=project_id,
        activity_type="document_uploaded",
        new_value=title
    )
    db.add(log)
    db.commit()

    return document

@app.delete("/api/projects/{project_id}/documents/{document_id}")
def delete_project_document(
    project_id: int,
    document_id: int,
    current_user: User = Depends(require_roles("Admin", "PM", "QA")),
    db: Session = Depends(get_db)
):
    document = db.query(ProjectDocument).filter(
        ProjectDocument.id == document_id,
        ProjectDocument.project_id == project_id
    ).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    get_storage_backend().delete(document.file_url)
    db.delete(document)
    db.commit()
    return {"message": "Document deleted"}


# ==================== BUGS ENDPOINTS ====================

DEV_ALLOWED_BUG_STATUSES = ["Open", "In Progress", "Resolved"]

def _check_dev_status_allowed(current_user: User, status: Optional[str]):
    if status is not None and current_user.role == "Dev" and status not in DEV_ALLOWED_BUG_STATUSES:
        raise HTTPException(
            status_code=403,
            detail=f"Devs can only set bug status to one of {DEV_ALLOWED_BUG_STATUSES}"
        )

def _check_dev_can_edit_bug(current_user: User, bug_in: BugUpdate):
    # Devs are fully read-only on existing bugs. Their only mutation paths are
    # the dedicated attachments/comments/links/watch endpoints, which have
    # their own permission checks and don't go through PUT /api/bugs/{id}.
    if current_user.role == "Dev" and bug_in.dict(exclude_unset=True):
        raise HTTPException(
            status_code=403,
            detail="Devs have read-only access to bugs; use the attachment, comment, or link endpoints instead."
        )

def _add_watcher(db: Session, bug_id: int, user_id: int) -> None:
    exists = db.query(BugWatcher).filter(BugWatcher.bug_id == bug_id, BugWatcher.user_id == user_id).first()
    if not exists:
        db.add(BugWatcher(bug_id=bug_id, user_id=user_id))

@app.post("/api/bugs", response_model=BugOut)
def create_bug(bug_in: BugCreate, background_tasks: BackgroundTasks, current_user: User = Depends(require_roles("Admin", "Dev", "QA")), db: Session = Depends(get_db)):
    # Verify project exists
    project = require_project(db, bug_in.project_id)
    if bug_in.version_id is not None:
        require_version_for_project(db, bug_in.version_id, bug_in.project_id)
    if bug_in.owner_id is not None:
        require_active_user(db, bug_in.owner_id, detail="Bug owner not found")
    _check_dev_status_allowed(current_user, bug_in.status)

    # Reporter becomes the owner by default unless someone else is picked
    owner_id = bug_in.owner_id if bug_in.owner_id is not None else current_user.id

    max_sequence = db.query(func.max(Bug.project_sequence)).filter(Bug.project_id == bug_in.project_id).scalar()
    next_sequence = (max_sequence or 0) + 1

    new_bug = Bug(
        project_id=bug_in.project_id,
        project_sequence=next_sequence,
        version_id=bug_in.version_id,
        title=bug_in.title,
        description=bug_in.description,
        expected_behavior=bug_in.expected_behavior,
        environment=bug_in.environment,
        environment_details=bug_in.environment_details,
        status=bug_in.status,
        severity=bug_in.severity,
        priority=bug_in.priority,
        bug_type=bug_in.bug_type,
        is_blocker=bug_in.is_blocker,
        owner_id=owner_id,
        reporter_id=current_user.id
    )
    db.add(new_bug)
    db.commit()
    db.refresh(new_bug)

    # Reporter (and owner, if different) auto-watch their own bug
    _add_watcher(db, new_bug.id, current_user.id)
    if owner_id != current_user.id:
        _add_watcher(db, new_bug.id, owner_id)
    db.commit()

    # Log activity
    log = ActivityLog(
        user_id=current_user.id,
        bug_id=new_bug.id,
        project_id=new_bug.project_id,
        activity_type="bug_created",
        new_value=new_bug.status
    )
    db.add(log)
    db.commit()

    if new_bug.owner_id is not None and new_bug.owner_id != current_user.id:
        notify(
            db,
            new_bug.owner_id,
            notif_type="bug_assigned",
            title=f"You've been assigned: {new_bug.title}",
            body=f"{current_user.full_name} assigned you a bug in {project.name}.",
            link="#bugs",
            project_id=new_bug.project_id,
            bug_id=new_bug.id,
            background_tasks=background_tasks,
            email=True,
        )

    if new_bug.is_blocker:
        notify_project_members(
            db,
            new_bug.project_id,
            notif_type="bug_blocker",
            title=f"New blocker: {new_bug.title}",
            body=f"{current_user.full_name} flagged a new blocker in {project.name}.",
            link="#bugs",
            bug_id=new_bug.id,
            background_tasks=background_tasks,
            exclude_user_id=current_user.id,
        )

    return new_bug

@app.get("/api/bugs", response_model=List[BugOut])
def list_bugs(project_id: Optional[int] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Bug)
    if project_id is not None:
        query = query.filter(Bug.project_id == project_id)
    visible_ids = _visible_project_ids(db, current_user)
    if visible_ids is not None:
        query = query.filter(Bug.project_id.in_(visible_ids))
    return query.all()

@app.put("/api/bugs/{bug_id}", response_model=BugOut)
def update_bug(bug_id: int, bug_in: BugUpdate, background_tasks: BackgroundTasks, current_user: User = Depends(require_roles("Admin", "Dev", "QA")), db: Session = Depends(get_db)):
    bug = db.query(Bug).filter(Bug.id == bug_id).first()
    if not bug:
        raise HTTPException(status_code=404, detail="Bug not found")

    old_status = bug.status
    old_owner_id = bug.owner_id
    old_is_blocker = bug.is_blocker

    _check_dev_can_edit_bug(current_user, bug_in)

    # Apply updates
    if bug_in.title is not None:
        bug.title = bug_in.title
    if bug_in.description is not None:
        bug.description = bug_in.description
    if bug_in.expected_behavior is not None:
        bug.expected_behavior = bug_in.expected_behavior
    if bug_in.environment is not None:
        bug.environment = bug_in.environment
    if bug_in.environment_details is not None:
        bug.environment_details = bug_in.environment_details
    reopened = False
    if bug_in.status is not None:
        bug.status = bug_in.status
        # Handle resolution timestamp
        if bug_in.status in ["Resolved", "Closed"] and old_status not in ["Resolved", "Closed"]:
            bug.resolved_at = datetime.datetime.utcnow()
        elif bug_in.status not in ["Resolved", "Closed"] and old_status in ["Resolved", "Closed"]:
            bug.resolved_at = None
            reopened = True
            bug.reopen_count = (bug.reopen_count or 0) + 1

    if bug_in.severity is not None:
        bug.severity = bug_in.severity
    if bug_in.priority is not None:
        bug.priority = bug_in.priority
    if bug_in.bug_type is not None:
        bug.bug_type = bug_in.bug_type
    if bug_in.is_blocker is not None:
        bug.is_blocker = bug_in.is_blocker
    if bug_in.version_id is not None:
        require_version_for_project(db, bug_in.version_id, bug.project_id)
        bug.version_id = bug_in.version_id
    if bug_in.owner_id is not None:
        # Note: can pass -1 to unassign
        if bug_in.owner_id == -1:
            bug.owner_id = None
        else:
            require_active_user(db, bug_in.owner_id, detail="Bug owner not found")
            bug.owner_id = bug_in.owner_id
        
    db.commit()
    db.refresh(bug)

    # Log status change
    if bug_in.status is not None and old_status != bug.status:
        if reopened:
            activity_type = "bug_reopened"
        elif bug.status in ["Resolved", "Closed"]:
            activity_type = "bug_resolved"
        else:
            activity_type = "bug_status_change"
        log = ActivityLog(
            user_id=current_user.id,
            bug_id=bug.id,
            project_id=bug.project_id,
            activity_type=activity_type,
            old_value=old_status,
            new_value=bug.status
        )
        db.add(log)
        db.commit()

        watcher_ids = {w.user_id for w in db.query(BugWatcher).filter(BugWatcher.bug_id == bug.id).all()}
        interested_ids = ({bug.reporter_id, bug.owner_id} | watcher_ids) - {None, current_user.id}
        for recipient_id in interested_ids:
            notify(
                db,
                recipient_id,
                notif_type=activity_type,
                title=f"{bug.title}: {old_status} → {bug.status}",
                body=f"{current_user.full_name} updated this bug's status.",
                link="#bugs",
                project_id=bug.project_id,
                bug_id=bug.id,
                background_tasks=background_tasks,
            )

    if bug.owner_id is not None and bug.owner_id != old_owner_id and bug.owner_id != current_user.id:
        notify(
            db,
            bug.owner_id,
            notif_type="bug_assigned",
            title=f"You've been assigned: {bug.title}",
            body=f"{current_user.full_name} assigned you this bug.",
            link="#bugs",
            project_id=bug.project_id,
            bug_id=bug.id,
            background_tasks=background_tasks,
            email=True,
        )

    if bug.is_blocker and not old_is_blocker:
        notify_project_members(
            db,
            bug.project_id,
            notif_type="bug_blocker",
            title=f"New blocker: {bug.title}",
            body=f"{current_user.full_name} flagged this bug as a blocker.",
            link="#bugs",
            bug_id=bug.id,
            background_tasks=background_tasks,
            exclude_user_id=current_user.id,
        )

    return bug

BUG_BULK_UPDATE_ALLOWED_FIELDS = {"status", "owner_id"}

@app.patch("/api/bugs/bulk-update")
def bulk_update_bugs(
    bulk_in: BugBulkUpdateIn,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles("Admin", "Dev", "QA")),
    db: Session = Depends(get_db)
):
    unsupported = set(bulk_in.fields.keys()) - BUG_BULK_UPDATE_ALLOWED_FIELDS
    if unsupported:
        raise HTTPException(status_code=400, detail=f"Bulk update only supports {sorted(BUG_BULK_UPDATE_ALLOWED_FIELDS)}")

    updated = []
    failed = []
    for bug_id in bulk_in.bug_ids:
        try:
            bug_update = BugUpdate(**bulk_in.fields)
            update_bug(bug_id=bug_id, bug_in=bug_update, background_tasks=background_tasks, current_user=current_user, db=db)
            updated.append(bug_id)
        except HTTPException as e:
            failed.append({"bug_id": bug_id, "reason": e.detail})

    return {"updated": updated, "failed": failed}


# ==================== BUG ATTACHMENTS ENDPOINTS ====================

@app.post("/api/bugs/{bug_id}/attachments", response_model=BugAttachmentOut)
def upload_bug_attachment(
    bug_id: int,
    attachment_in: BugAttachmentCreate,
    current_user: User = Depends(require_roles("Admin", "Dev", "QA")),
    db: Session = Depends(get_db)
):
    bug = db.query(Bug).filter(Bug.id == bug_id).first()
    if not bug:
        raise HTTPException(status_code=404, detail="Bug not found")

    file_url = save_screenshot_data(attachment_in.screenshot_data)
    if not file_url:
        raise HTTPException(status_code=400, detail="No screenshot data provided")

    attachment = BugAttachment(
        bug_id=bug.id,
        uploaded_by_id=current_user.id,
        file_url=file_url,
        original_filename=attachment_in.filename or "screenshot",
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment

@app.delete("/api/bugs/{bug_id}/attachments/{attachment_id}")
def delete_bug_attachment(
    bug_id: int,
    attachment_id: int,
    current_user: User = Depends(require_roles("Admin", "QA")),
    db: Session = Depends(get_db)
):
    attachment = db.query(BugAttachment).filter(
        BugAttachment.id == attachment_id,
        BugAttachment.bug_id == bug_id
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    get_storage_backend().delete(attachment.file_url)
    db.delete(attachment)
    db.commit()
    return {"message": "Attachment deleted"}


# ==================== BUG LINKS ENDPOINTS ====================

BUG_LINK_TYPES = ["relates_to", "blocks", "duplicate_of"]

def _bug_link_out(link: BugLink, direction: str, related_bug: Bug) -> BugLinkOut:
    return BugLinkOut(
        id=link.id,
        link_type=link.link_type,
        direction=direction,
        related_bug=related_bug,
        created_at=link.created_at,
    )

@app.get("/api/bugs/{bug_id}/links", response_model=List[BugLinkOut])
def list_bug_links(bug_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bug = db.query(Bug).filter(Bug.id == bug_id).first()
    if not bug:
        raise HTTPException(status_code=404, detail="Bug not found")

    results = []
    for link in db.query(BugLink).filter(BugLink.bug_id == bug_id).all():
        related = db.query(Bug).filter(Bug.id == link.related_bug_id).first()
        if related:
            results.append(_bug_link_out(link, "outgoing", related))
    for link in db.query(BugLink).filter(BugLink.related_bug_id == bug_id).all():
        related = db.query(Bug).filter(Bug.id == link.bug_id).first()
        if related:
            results.append(_bug_link_out(link, "incoming", related))
    return results

@app.post("/api/bugs/{bug_id}/links", response_model=BugLinkOut)
def create_bug_link(
    bug_id: int,
    link_in: BugLinkCreate,
    current_user: User = Depends(require_roles("Admin", "Dev", "QA")),
    db: Session = Depends(get_db)
):
    if link_in.link_type not in BUG_LINK_TYPES:
        raise HTTPException(status_code=400, detail=f"link_type must be one of {BUG_LINK_TYPES}")
    if link_in.related_bug_id == bug_id:
        raise HTTPException(status_code=400, detail="A bug cannot be linked to itself")

    bug = db.query(Bug).filter(Bug.id == bug_id).first()
    if not bug:
        raise HTTPException(status_code=404, detail="Bug not found")
    related_bug = db.query(Bug).filter(Bug.id == link_in.related_bug_id).first()
    if not related_bug:
        raise HTTPException(status_code=404, detail="Related bug not found")

    link = BugLink(
        bug_id=bug_id,
        related_bug_id=link_in.related_bug_id,
        link_type=link_in.link_type,
        created_by_id=current_user.id,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _bug_link_out(link, "outgoing", related_bug)

@app.delete("/api/bugs/{bug_id}/links/{link_id}")
def delete_bug_link(bug_id: int, link_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    link = db.query(BugLink).filter(BugLink.id == link_id, BugLink.bug_id == bug_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    if current_user.role not in ("Admin", "QA") and link.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only Admin, QA, or the link's creator can remove it")
    db.delete(link)
    db.commit()
    return {"message": "Link removed"}


# ==================== BUG WATCHERS ENDPOINTS ====================

@app.get("/api/bugs/{bug_id}/watchers", response_model=List[BugWatcherOut])
def list_bug_watchers(bug_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bug = db.query(Bug).filter(Bug.id == bug_id).first()
    if not bug:
        raise HTTPException(status_code=404, detail="Bug not found")
    return db.query(BugWatcher).filter(BugWatcher.bug_id == bug_id).all()

@app.post("/api/bugs/{bug_id}/watch", response_model=BugWatcherOut)
def watch_bug(bug_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bug = db.query(Bug).filter(Bug.id == bug_id).first()
    if not bug:
        raise HTTPException(status_code=404, detail="Bug not found")

    existing = db.query(BugWatcher).filter(BugWatcher.bug_id == bug_id, BugWatcher.user_id == current_user.id).first()
    if existing:
        return existing

    watcher = BugWatcher(bug_id=bug_id, user_id=current_user.id)
    db.add(watcher)
    db.commit()
    db.refresh(watcher)
    return watcher

@app.delete("/api/bugs/{bug_id}/watch")
def unwatch_bug(bug_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    watcher = db.query(BugWatcher).filter(BugWatcher.bug_id == bug_id, BugWatcher.user_id == current_user.id).first()
    if watcher:
        db.delete(watcher)
        db.commit()
    return {"message": "No longer watching this bug"}


# ==================== SAVED BUG FILTERS ENDPOINTS ====================

def _saved_filter_out(saved_filter: SavedBugFilter) -> SavedBugFilterOut:
    return SavedBugFilterOut(
        id=saved_filter.id,
        name=saved_filter.name,
        filters=json.loads(saved_filter.filters_json),
        is_shared=saved_filter.is_shared,
        created_at=saved_filter.created_at,
    )

@app.get("/api/bugs/saved-filters", response_model=List[SavedBugFilterOut])
def list_saved_bug_filters(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    filters = db.query(SavedBugFilter).filter(
        (SavedBugFilter.user_id == current_user.id) | (SavedBugFilter.is_shared == True)
    ).order_by(SavedBugFilter.created_at.desc()).all()
    return [_saved_filter_out(f) for f in filters]

@app.post("/api/bugs/saved-filters", response_model=SavedBugFilterOut)
def create_saved_bug_filter(
    filter_in: SavedBugFilterCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    is_shared = filter_in.is_shared and current_user.role != "Guest"
    saved_filter = SavedBugFilter(
        user_id=current_user.id,
        name=filter_in.name,
        filters_json=json.dumps(filter_in.filters),
        is_shared=is_shared,
    )
    db.add(saved_filter)
    db.commit()
    db.refresh(saved_filter)
    return _saved_filter_out(saved_filter)

@app.delete("/api/bugs/saved-filters/{filter_id}")
def delete_saved_bug_filter(filter_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    saved_filter = db.query(SavedBugFilter).filter(SavedBugFilter.id == filter_id).first()
    if not saved_filter:
        raise HTTPException(status_code=404, detail="Saved filter not found")
    if saved_filter.user_id != current_user.id and current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Only the creator or an Admin can delete this saved filter")
    db.delete(saved_filter)
    db.commit()
    return {"message": "Saved filter deleted"}


# ==================== COMMENTS ENDPOINTS ====================

@app.post("/api/comments", response_model=CommentOut)
def create_comment(comment_in: CommentCreate, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Requires at least project_id or bug_id
    if not comment_in.project_id and not comment_in.bug_id:
        raise HTTPException(status_code=400, detail="Comment must belong to a project or a bug")
    bug = None
    if comment_in.project_id:
        require_project(db, comment_in.project_id)
    if comment_in.bug_id:
        bug = db.query(Bug).filter(Bug.id == comment_in.bug_id).first()
        if not bug:
            raise HTTPException(status_code=404, detail="Bug not found")
        if comment_in.project_id and bug.project_id != comment_in.project_id:
            raise HTTPException(status_code=400, detail="Bug does not belong to project")

    new_comment = Comment(
        user_id=current_user.id,
        project_id=comment_in.project_id,
        bug_id=comment_in.bug_id,
        text=comment_in.text
    )
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)

    # Log activity
    snippet = comment_in.text[:50] + "..." if len(comment_in.text) > 50 else comment_in.text
    log = ActivityLog(
        user_id=current_user.id,
        project_id=comment_in.project_id,
        bug_id=comment_in.bug_id,
        activity_type="comment_added",
        new_value=snippet
    )
    db.add(log)
    db.commit()

    if bug is not None:
        watcher_ids = {w.user_id for w in db.query(BugWatcher).filter(BugWatcher.bug_id == bug.id).all()}
        interested_ids = ({bug.reporter_id, bug.owner_id} | watcher_ids) - {None, current_user.id}
        for recipient_id in interested_ids:
            notify(
                db,
                recipient_id,
                notif_type="comment_added",
                title=f"New comment on {bug.title}",
                body=f"{current_user.full_name}: {snippet}",
                link="#bugs",
                project_id=bug.project_id,
                bug_id=bug.id,
                background_tasks=background_tasks,
            )

        mentioned_ids = set(comment_in.mentioned_user_ids) - interested_ids - {current_user.id}
        for recipient_id in mentioned_ids:
            notify(
                db,
                recipient_id,
                notif_type="comment_mention",
                title=f"{current_user.full_name} mentioned you on {bug.title}",
                body=f"{current_user.full_name}: {snippet}",
                link="#bugs",
                project_id=bug.project_id,
                bug_id=bug.id,
                background_tasks=background_tasks,
                email=True,
            )
    elif comment_in.project_id:
        notify_project_members(
            db,
            comment_in.project_id,
            notif_type="comment_added",
            title="New project comment",
            body=f"{current_user.full_name}: {snippet}",
            link="#projects",
            background_tasks=background_tasks,
            exclude_user_id=current_user.id,
        )

    return new_comment

@app.get("/api/comments", response_model=List[CommentOut])
def list_comments(project_id: Optional[int] = None, bug_id: Optional[int] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Comment)
    if bug_id is not None:
        query = query.filter(Comment.bug_id == bug_id)
    elif project_id is not None:
        query = query.filter(Comment.project_id == project_id)
    return query.order_by(Comment.created_at.desc()).all()

@app.post("/api/comments/{comment_id}/attachments", response_model=BugAttachmentOut)
def upload_comment_attachment(
    comment_id: int,
    attachment_in: BugAttachmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not comment.bug_id:
        raise HTTPException(status_code=400, detail="Only comments on a bug can have attachments")

    file_url = save_screenshot_data(attachment_in.screenshot_data)
    if not file_url:
        raise HTTPException(status_code=400, detail="No screenshot data provided")

    attachment = BugAttachment(
        bug_id=comment.bug_id,
        comment_id=comment.id,
        uploaded_by_id=current_user.id,
        file_url=file_url,
        original_filename=attachment_in.filename or "screenshot",
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


# ==================== REPORTING ENDPOINTS ====================

def parse_report_range(start_date: str, end_date: str):
    try:
        start = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        # Include the full end day
        end = datetime.datetime.strptime(end_date, "%Y-%m-%d") + datetime.timedelta(days=1) - datetime.timedelta(seconds=1)
        return start, end
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

@app.get("/api/reports", response_model=ReportDataOut)
def get_report(
    start_date: str = Query(..., description="Format: YYYY-MM-DD"),
    end_date: str = Query(..., description="Format: YYYY-MM-DD"),
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_roles("Admin", "PM", "QA", "Guest")),
    db: Session = Depends(get_db)
):
    start, end = parse_report_range(start_date, end_date)
    if project_id is not None:
        require_project(db, project_id)

    metrics = calculate_qa_metrics(db, start, end, project_id)
    return metrics

@app.get("/api/reports/export/bugs")
def export_bugs(
    start_date: str = Query(..., description="Format: YYYY-MM-DD"),
    end_date: str = Query(..., description="Format: YYYY-MM-DD"),
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_roles("Admin", "PM", "QA", "Guest")),
    db: Session = Depends(get_db)
):
    start, end = parse_report_range(start_date, end_date)
    if project_id is not None:
        require_project(db, project_id)

    csv_data = generate_csv_bugs_report(db, start, end, project_id)

    response = StreamingResponse(io.StringIO(csv_data), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=qa_bugs_report_{start_date}_to_{end_date}.csv"
    return response

@app.get("/api/reports/export/projects")
def export_projects(
    start_date: str = Query(..., description="Format: YYYY-MM-DD"),
    end_date: str = Query(..., description="Format: YYYY-MM-DD"),
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_roles("Admin", "PM", "QA", "Guest")),
    db: Session = Depends(get_db)
):
    start, end = parse_report_range(start_date, end_date)
    if project_id is not None:
        require_project(db, project_id)

    csv_data = generate_csv_projects_report(db, start, end, project_id)

    response = StreamingResponse(io.StringIO(csv_data), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=qa_projects_movement_{start_date}_to_{end_date}.csv"
    return response

@app.get("/api/reports/export/versions")
def export_versions(
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_roles("Admin", "PM", "QA", "Guest")),
    db: Session = Depends(get_db)
):
    if project_id is not None:
        require_project(db, project_id)

    csv_data = generate_csv_version_readiness(db, project_id)

    response = StreamingResponse(io.StringIO(csv_data), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=qa_version_readiness.csv"
    return response

@app.get("/api/reports/export/workload")
def export_workload(
    start_date: str = Query(..., description="Format: YYYY-MM-DD"),
    end_date: str = Query(..., description="Format: YYYY-MM-DD"),
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_roles("Admin", "PM", "QA", "Guest")),
    db: Session = Depends(get_db)
):
    start, end = parse_report_range(start_date, end_date)
    if project_id is not None:
        require_project(db, project_id)

    csv_data = generate_csv_team_workload(db, start, end, project_id)

    response = StreamingResponse(io.StringIO(csv_data), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=qa_team_workload_{start_date}_to_{end_date}.csv"
    return response

@app.get("/api/reports/export/activity")
def export_activity(
    start_date: str = Query(..., description="Format: YYYY-MM-DD"),
    end_date: str = Query(..., description="Format: YYYY-MM-DD"),
    project_id: Optional[int] = Query(None),
    current_user: User = Depends(require_roles("Admin", "PM", "QA", "Guest")),
    db: Session = Depends(get_db)
):
    start, end = parse_report_range(start_date, end_date)
    if project_id is not None:
        require_project(db, project_id)

    csv_data = generate_csv_activity_timeline(db, start, end, project_id)

    response = StreamingResponse(io.StringIO(csv_data), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=qa_activity_timeline_{start_date}_to_{end_date}.csv"
    return response


# ==================== STATIC FILE SERVING ====================

# Mount the static files directory if we're serving the built frontend directly
frontend_dist_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend/dist"))

if os.path.exists(frontend_dist_path):
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
    app.mount("/", StaticFiles(directory=frontend_dist_path, html=True), name="static")
else:
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
    @app.get("/")
    def index_placeholder():
        return {
            "message": "Welcome to TestBoard API. Build the React frontend under frontend/ to serve static UI files here."
        }
