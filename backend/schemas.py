from pydantic import BaseModel, EmailStr
from typing import Optional, List
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

class UserOut(UserBase):
    id: int
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Project Schemas
class ProjectBase(BaseModel):
    name: str
    key: str
    description: Optional[str] = None
    status: str = "Intake"

class ProjectCreate(ProjectBase):
    lead_id: Optional[int] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    key: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
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

# Comment Schemas
class CommentBase(BaseModel):
    text: str
    project_id: Optional[int] = None
    bug_id: Optional[int] = None

class CommentCreate(CommentBase):
    pass

class CommentOut(CommentBase):
    id: int
    user_id: int
    user: UserOut
    created_at: datetime

    class Config:
        orm_mode = True
        from_attributes = True

# Bug Schemas
class BugBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "Open"
    severity: str = "Medium"
    is_blocker: bool = False
    project_id: int
    version_id: Optional[int] = None
    owner_id: Optional[int] = None

class BugCreate(BugBase):
    screenshot_data: Optional[str] = None

class BugUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    screenshot_data: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    is_blocker: Optional[bool] = None
    version_id: Optional[int] = None
    owner_id: Optional[int] = None

class BugOut(BugBase):
    id: int
    screenshot_url: Optional[str] = None
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

class ProjectMovementMetric(BaseModel):
    project_id: int
    project_name: str
    from_status: str
    to_status: str
    user_name: str
    changed_at: datetime

class ReportDataOut(BaseModel):
    start_date: datetime
    end_date: datetime
    summary_paragraph: str
    bug_metrics: BugReportMetric
    movements: List[ProjectMovementMetric]
    comments: List[CommentOut]
    blockers_encountered: List[BugOut]
