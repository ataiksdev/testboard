import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="Pending")  # Pending, Admin, PM, Dev, QA, Guest
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    led_projects = relationship("Project", back_populates="lead", foreign_keys="Project.lead_id")
    reported_bugs = relationship("Bug", back_populates="reporter", foreign_keys="Bug.reporter_id")
    assigned_bugs = relationship("Bug", back_populates="owner", foreign_keys="Bug.owner_id")
    comments = relationship("Comment", back_populates="user")
    activities = relationship("ActivityLog", back_populates="user")
    project_memberships = relationship("ProjectMember", back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    key = Column(String, unique=True, index=True, nullable=False)  # e.g., "TEST"
    description = Column(Text, nullable=True)
    status = Column(String, default="Intake")  # Intake, Reviewing, Testing, Blocked, Completed, Archived
    lead_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    lead = relationship("User", back_populates="led_projects", foreign_keys=[lead_id])
    versions = relationship("Version", back_populates="project", cascade="all, delete-orphan")
    bugs = relationship("Bug", back_populates="project", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="project", cascade="all, delete-orphan")
    activities = relationship("ActivityLog", back_populates="project", cascade="all, delete-orphan")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    documents = relationship("ProjectDocument", back_populates="project", cascade="all, delete-orphan")


class Version(Base):
    __tablename__ = "versions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    version_name = Column(String, nullable=False)  # e.g., "v1.0"
    status = Column(String, default="Planning")  # Planning, QA, Released
    release_date = Column(DateTime, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="versions")
    bugs = relationship("Bug", back_populates="version")


class Bug(Base):
    __tablename__ = "bugs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    project_sequence = Column(Integer, nullable=True)
    version_id = Column(Integer, ForeignKey("versions.id"), nullable=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    expected_behavior = Column(Text, nullable=True)
    screenshot_url = Column(String, nullable=True)
    status = Column(String, default="Open")  # Open, In Progress, In QA, Resolved, Closed
    severity = Column(String, default="Medium")  # Low, Medium, High, Critical
    priority = Column(String, default="Medium")  # Low, Medium, High, Urgent
    bug_type = Column(String, default="Functional")  # Functional, Security, Usability, Regression, Performance, Other
    is_blocker = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="bugs")
    version = relationship("Version", back_populates="bugs")
    owner = relationship("User", back_populates="assigned_bugs", foreign_keys=[owner_id])
    reporter = relationship("User", back_populates="reported_bugs", foreign_keys=[reporter_id])
    comments = relationship("Comment", back_populates="bug", cascade="all, delete-orphan")
    activities = relationship("ActivityLog", back_populates="bug", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    bug_id = Column(Integer, ForeignKey("bugs.id"), nullable=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="comments")
    project = relationship("Project", back_populates="comments")
    bug = relationship("Bug", back_populates="comments")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    bug_id = Column(Integer, ForeignKey("bugs.id"), nullable=True)
    activity_type = Column(String, nullable=False)  # project_status_change, bug_status_change, bug_resolved, bug_created, project_created
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="activities")
    project = relationship("Project", back_populates="activities")
    bug = relationship("Bug", back_populates="activities")

    @property
    def project_name(self):
        return self.project.name if self.project else None

    @property
    def bug_title(self):
        return self.bug.title if self.bug else None


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_member"),)

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    added_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="project_memberships")


class PasswordResetRequest(Base):
    __tablename__ = "password_reset_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="Pending")  # Pending, Resolved, Dismissed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_id])


class ProjectDocument(Base):
    __tablename__ = "project_documents"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)  # e.g. "BRD v2"
    doc_type = Column(String, default="Other")  # BRD, Report, Test Plan, Other
    file_url = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    content_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="documents")
    uploaded_by = relationship("User")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(String, nullable=True)
    link = Column(String, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    bug_id = Column(Integer, ForeignKey("bugs.id"), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User")
