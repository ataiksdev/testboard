from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict
from datetime import datetime

ASSIGNABLE_ROLES = ["Admin", "PM", "Dev", "QA", "Guest"]

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# User Schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class UserApprove(BaseModel):
    role: str = "QA"

# Password Reset Schemas
class PasswordResetRequestCreate(BaseModel):
    email: EmailStr

class PasswordResetResolve(BaseModel):
    new_password: str

class UserOut(UserBase):
    id: int
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

class PasswordResetRequestOut(BaseModel):
    id: int
    status: str
    user: UserOut
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        orm_mode = True
        from_attributes = True

# Project Schemas
class ProjectBase(BaseModel):
    name: str
    key: str
    description: Optional[str] = None
    status: str = "Intake"
    vendor: Optional[str] = None

class ProjectCreate(ProjectBase):
    lead_id: Optional[int] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    key: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    vendor: Optional[str] = None
    lead_id: Optional[int] = None

class ProjectOut(ProjectBase):
    id: int
    lead_id: Optional[int] = None
    lead: Optional[UserOut] = None
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Project Member Schemas
class ProjectMemberCreate(BaseModel):
    user_id: int

class ProjectMemberOut(BaseModel):
    id: int
    project_id: int
    user_id: int
    user: UserOut
    added_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

class UserProjectOut(BaseModel):
    id: int
    name: str
    key: str
    status: str

    class Config:
        orm_mode = True
        from_attributes = True

# Project Document Schemas
class ProjectDocumentOut(BaseModel):
    id: int
    project_id: int
    version_id: Optional[int] = None
    title: str
    doc_type: str
    file_url: str
    original_filename: str
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    uploaded_by: UserOut
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Notification Schemas
class NotificationOut(BaseModel):
    id: int
    type: str
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    project_id: Optional[int] = None
    bug_id: Optional[int] = None
    is_read: bool
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Version Schemas
class VersionBase(BaseModel):
    version_name: str
    status: str = "Planning"
    release_date: Optional[datetime] = None

class VersionCreate(VersionBase):
    project_id: int

class VersionUpdate(BaseModel):
    version_name: Optional[str] = None
    status: Optional[str] = None
    release_date: Optional[datetime] = None

class VersionOut(VersionBase):
    id: int
    project_id: int

    class Config:
        orm_mode = True
        from_attributes = True

# Component Schemas
class ComponentBase(BaseModel):
    name: str

class ComponentCreate(ComponentBase):
    project_id: int

class ComponentOut(ComponentBase):
    id: int
    project_id: int

    class Config:
        orm_mode = True
        from_attributes = True

# Comment Schemas
class CommentBase(BaseModel):
    text: str
    project_id: Optional[int] = None
    bug_id: Optional[int] = None

class CommentCreate(CommentBase):
    mentioned_user_ids: List[int] = []

class CommentOut(CommentBase):
    id: int
    user_id: int
    user: UserOut
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Bug Attachment Schemas
class BugAttachmentCreate(BaseModel):
    screenshot_data: str
    filename: Optional[str] = None

class BugAttachmentOut(BaseModel):
    id: int
    bug_id: int
    comment_id: Optional[int] = None
    file_url: str
    original_filename: str
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    uploaded_by: UserOut
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Lightweight bug reference used by BugLinkOut, avoids recursive BugOut nesting
class BugSummaryOut(BaseModel):
    id: int
    title: str
    status: str
    project_sequence: Optional[int] = None
    project: Optional[ProjectOut] = None

    class Config:
        orm_mode = True
        from_attributes = True

# Bug Schemas
class BugBase(BaseModel):
    title: str
    description: Optional[str] = None
    expected_behavior: Optional[str] = None
    environment: Optional[str] = None
    environment_details: Optional[str] = None
    status: str = "Open"
    severity: str = "Medium"
    priority: str = "Medium"
    bug_type: str = "Functional"
    is_blocker: bool = False
    project_id: int
    version_id: Optional[int] = None
    component_id: Optional[int] = None
    owner_id: Optional[int] = None

class BugCreate(BugBase):
    pass

class BugUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    expected_behavior: Optional[str] = None
    environment: Optional[str] = None
    environment_details: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    priority: Optional[str] = None
    bug_type: Optional[str] = None
    is_blocker: Optional[bool] = None
    version_id: Optional[int] = None
    component_id: Optional[int] = None
    owner_id: Optional[int] = None

class BugOut(BugBase):
    id: int
    project_sequence: Optional[int] = None
    project: Optional[ProjectOut] = None
    reopen_count: int = 0
    attachments: List[BugAttachmentOut] = []
    component: Optional[ComponentOut] = None
    labels: List[str] = []
    reporter_id: int
    reporter: UserOut
    owner: Optional[UserOut] = None
    version: Optional[VersionOut] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    updated_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Bug Link Schemas
class BugLinkCreate(BaseModel):
    related_bug_id: int
    link_type: str  # relates_to, blocks, duplicate_of

class BugLinkOut(BaseModel):
    id: int
    link_type: str
    direction: str  # outgoing, incoming
    related_bug: BugSummaryOut
    created_at: datetime

# Bug Watcher Schemas
class BugWatcherOut(BaseModel):
    id: int
    user: UserOut
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Bug Label Schemas
class BugLabelCreate(BaseModel):
    name: str

class BugLabelOut(BaseModel):
    id: int
    name: str
    created_by_id: int
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Saved Bug Filter Schemas
class SavedBugFilterCreate(BaseModel):
    name: str
    filters: Dict
    is_shared: bool = False

class SavedBugFilterOut(BaseModel):
    id: int
    name: str
    filters: Dict
    is_shared: bool
    created_at: datetime

# Bulk Update Schema
class BugBulkUpdateIn(BaseModel):
    bug_ids: List[int]
    fields: Dict  # subset of BugUpdate fields, currently: status, owner_id

# ActivityLog Schema
class ActivityLogOut(BaseModel):
    id: int
    user_id: int
    user: UserOut
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    bug_id: Optional[int] = None
    bug_title: Optional[str] = None
    activity_type: str
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Report Schemas
class BugReportMetric(BaseModel):
    total_bugs: int
    resolved_bugs: int
    open_bugs: int
    critical_bugs: int
    blocker_bugs: int
    mttr_hours: float

class VersionReadinessOut(BaseModel):
    version_id: int
    version_name: str
    project_id: int
    project_name: str
    status: str
    release_date: Optional[datetime] = None
    open_bugs: int
    blocker_bugs: int
    resolved_bugs: int
    total_bugs: int

class OwnerWorkloadOut(BaseModel):
    user_id: int
    full_name: str
    open_assigned: int
    resolved_in_period: int
    avg_resolution_hours: Optional[float] = None

class ReportDataOut(BaseModel):
    start_date: datetime
    end_date: datetime
    project_id: Optional[int] = None
    project_name: Optional[str] = None
    summary_paragraph: str
    bug_metrics: BugReportMetric
    severity_breakdown: Dict[str, int]
    status_breakdown: Dict[str, int]
    version_readiness: List[VersionReadinessOut]
    team_workload: List[OwnerWorkloadOut]
    activity_timeline: List[ActivityLogOut]
    activity_timeline_truncated: bool
    comments: List[CommentOut]
    blockers_encountered: List[BugOut]
