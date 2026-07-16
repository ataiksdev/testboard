import base64
import datetime
import io
import re
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import text
from sqlalchemy.orm import Session
import os

from backend.database import engine, Base, get_db, SessionLocal
from backend.models import User, Project, Version, Bug, Comment, ActivityLog, ProjectMember
from backend.schemas import (
    UserCreate, UserOut, UserUpdate, UserApprove, Token,
    ASSIGNABLE_ROLES,
    ProjectCreate, ProjectOut, ProjectUpdate,
    ProjectMemberCreate, ProjectMemberOut, UserProjectOut,
    VersionBase, VersionCreate, VersionOut, VersionUpdate,
    BugCreate, BugOut, BugUpdate,
    CommentCreate, CommentOut,
    ActivityLogOut,
    ReportDataOut
)
from backend.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, get_current_admin, require_roles
)
from backend.reporter import (
    calculate_qa_metrics, generate_csv_bugs_report, generate_csv_projects_report
)

UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
SCREENSHOTS_DIR = UPLOADS_DIR / "screenshots"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

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
        if "screenshot_url" not in bug_columns:
            connection.execute(text("ALTER TABLE bugs ADD COLUMN screenshot_url VARCHAR"))

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
    filename = f"{uuid.uuid4().hex}.{extension}"
    path = SCREENSHOTS_DIR / filename
    path.write_bytes(image_bytes)
    return f"/uploads/screenshots/{filename}"

# ==================== AUTHENTICATION ENDPOINTS ====================

@app.post("/api/auth/register", response_model=UserOut)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
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


# ==================== ADMIN ENDPOINTS ====================

@app.get("/api/admin/users/pending", response_model=List[UserOut])
def get_pending_users(admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    return db.query(User).filter(User.role == "Pending").all()

@app.post("/api/admin/users/{user_id}/approve", response_model=UserOut)
def approve_user(user_id: int, approval: UserApprove, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    if approval.role not in ASSIGNABLE_ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {ASSIGNABLE_ROLES}")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = approval.role
    db.commit()
    db.refresh(user)
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
def update_user_admin(user_id: int, update: UserUpdate, admin: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    demoting_admin = update.role is not None and update.role != "Admin" and user.role == "Admin"
    deactivating_admin = update.is_active is False and user.role == "Admin" and user.is_active

    if (demoting_admin or deactivating_admin) and _count_active_admins(db, exclude_user_id=user.id) == 0:
        raise HTTPException(status_code=400, detail="Cannot remove the last active Admin")

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

@app.get("/api/projects", response_model=List[ProjectOut])
def list_projects(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Project).all()

@app.get("/api/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@app.put("/api/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, project_in: ProjectUpdate, current_user: User = Depends(require_roles("Admin", "PM", "QA")), db: Session = Depends(get_db)):
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


# ==================== BUGS ENDPOINTS ====================

@app.post("/api/bugs", response_model=BugOut)
def create_bug(bug_in: BugCreate, current_user: User = Depends(require_roles("Admin", "Dev", "QA")), db: Session = Depends(get_db)):
    # Verify project exists
    require_project(db, bug_in.project_id)
    if bug_in.version_id is not None:
        require_version_for_project(db, bug_in.version_id, bug_in.project_id)
    if bug_in.owner_id is not None:
        require_active_user(db, bug_in.owner_id, detail="Bug owner not found")
        
    new_bug = Bug(
        project_id=bug_in.project_id,
        version_id=bug_in.version_id,
        title=bug_in.title,
        description=bug_in.description,
        screenshot_url=save_screenshot_data(bug_in.screenshot_data),
        status=bug_in.status,
        severity=bug_in.severity,
        is_blocker=bug_in.is_blocker,
        owner_id=bug_in.owner_id,
        reporter_id=current_user.id
    )
    db.add(new_bug)
    db.commit()
    db.refresh(new_bug)
    
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
    
    return new_bug

@app.get("/api/bugs", response_model=List[BugOut])
def list_bugs(project_id: Optional[int] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Bug)
    if project_id is not None:
        query = query.filter(Bug.project_id == project_id)
    return query.all()

@app.put("/api/bugs/{bug_id}", response_model=BugOut)
def update_bug(bug_id: int, bug_in: BugUpdate, current_user: User = Depends(require_roles("Admin", "Dev", "QA")), db: Session = Depends(get_db)):
    bug = db.query(Bug).filter(Bug.id == bug_id).first()
    if not bug:
        raise HTTPException(status_code=404, detail="Bug not found")
        
    old_status = bug.status
    
    # Apply updates
    if bug_in.title is not None:
        bug.title = bug_in.title
    if bug_in.description is not None:
        bug.description = bug_in.description
    if bug_in.screenshot_data is not None:
        bug.screenshot_url = save_screenshot_data(bug_in.screenshot_data)
    if bug_in.status is not None:
        bug.status = bug_in.status
        # Handle resolution timestamp
        if bug_in.status in ["Resolved", "Closed"] and old_status not in ["Resolved", "Closed"]:
            bug.resolved_at = datetime.datetime.utcnow()
        elif bug_in.status not in ["Resolved", "Closed"] and old_status in ["Resolved", "Closed"]:
            bug.resolved_at = None
            
    if bug_in.severity is not None:
        bug.severity = bug_in.severity
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
        activity_type = "bug_resolved" if bug.status in ["Resolved", "Closed"] else "bug_status_change"
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
        
    return bug


# ==================== COMMENTS ENDPOINTS ====================

@app.post("/api/comments", response_model=CommentOut)
def create_comment(comment_in: CommentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Requires at least project_id or bug_id
    if not comment_in.project_id and not comment_in.bug_id:
        raise HTTPException(status_code=400, detail="Comment must belong to a project or a bug")
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
    log = ActivityLog(
        user_id=current_user.id,
        project_id=comment_in.project_id,
        bug_id=comment_in.bug_id,
        activity_type="comment_added",
        new_value=comment_in.text[:50] + "..." if len(comment_in.text) > 50 else comment_in.text
    )
    db.add(log)
    db.commit()
    
    return new_comment

@app.get("/api/comments", response_model=List[CommentOut])
def list_comments(project_id: Optional[int] = None, bug_id: Optional[int] = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Comment)
    if bug_id is not None:
        query = query.filter(Comment.bug_id == bug_id)
    elif project_id is not None:
        query = query.filter(Comment.project_id == project_id)
    return query.order_by(Comment.created_at.desc()).all()


# ==================== REPORTING ENDPOINTS ====================

@app.get("/api/reports", response_model=ReportDataOut)
def get_report(
    start_date: str = Query(..., description="Format: YYYY-MM-DD"),
    end_date: str = Query(..., description="Format: YYYY-MM-DD"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        start = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        # Include the full end day
        end = datetime.datetime.strptime(end_date, "%Y-%m-%d") + datetime.timedelta(days=1) - datetime.timedelta(seconds=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    metrics = calculate_qa_metrics(db, start, end)
    return metrics

@app.get("/api/reports/export/bugs")
def export_bugs(
    start_date: str = Query(..., description="Format: YYYY-MM-DD"),
    end_date: str = Query(..., description="Format: YYYY-MM-DD"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        start = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.datetime.strptime(end_date, "%Y-%m-%d") + datetime.timedelta(days=1) - datetime.timedelta(seconds=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    csv_data = generate_csv_bugs_report(db, start, end)
    
    # Return as download stream
    response = StreamingResponse(io.StringIO(csv_data), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=qa_bugs_report_{start_date}_to_{end_date}.csv"
    return response

@app.get("/api/reports/export/projects")
def export_projects(
    start_date: str = Query(..., description="Format: YYYY-MM-DD"),
    end_date: str = Query(..., description="Format: YYYY-MM-DD"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        start = datetime.datetime.strptime(start_date, "%Y-%m-%d")
        end = datetime.datetime.strptime(end_date, "%Y-%m-%d") + datetime.timedelta(days=1) - datetime.timedelta(seconds=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    csv_data = generate_csv_projects_report(db, start, end)
    
    # Return as download stream
    response = StreamingResponse(io.StringIO(csv_data), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=qa_projects_movement_{start_date}_to_{end_date}.csv"
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
