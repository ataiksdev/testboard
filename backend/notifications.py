import os
import smtplib
from email.mime.text import MIMEText
from typing import Optional

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from backend.models import Notification, ProjectMember, User


def send_email(to_email: str, subject: str, body: str) -> None:
    """Best-effort SMTP send.

    Silently no-ops if TESTBOARD_SMTP_HOST isn't set, so notifications work
    with zero config out of the box. Swallows delivery errors so a broken
    mail server never breaks the request that triggered the notification.
    """
    host = os.getenv("TESTBOARD_SMTP_HOST")
    if not host:
        return

    from_addr = os.getenv("TESTBOARD_SMTP_FROM") or os.getenv("TESTBOARD_SMTP_USER")
    if not from_addr:
        return

    port = int(os.getenv("TESTBOARD_SMTP_PORT", "587"))
    user = os.getenv("TESTBOARD_SMTP_USER")
    password = os.getenv("TESTBOARD_SMTP_PASSWORD")
    use_tls = os.getenv("TESTBOARD_SMTP_USE_TLS", "true").lower() != "false"

    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = from_addr
    message["To"] = to_email

    # Port 465 is implicit SSL (SMTPS) and uses a different connection class
    # than STARTTLS-based ports like 587/25 — some networks block one but not
    # the other, so both need to work.
    smtp_cls = smtplib.SMTP_SSL if port == 465 else smtplib.SMTP

    try:
        with smtp_cls(host, port, timeout=10) as server:
            if use_tls and port != 465:
                server.starttls()
            if user and password:
                server.login(user, password)
            server.sendmail(from_addr, [to_email], message.as_string())
    except Exception:
        pass


def _app_link(link: Optional[str]) -> str:
    base = os.getenv("TESTBOARD_APP_URL", "").rstrip("/")
    if not base or not link:
        return ""
    return f"{base}/{link.lstrip('#/')}"


def notify(
    db: Session,
    user_id: int,
    notif_type: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    project_id: Optional[int] = None,
    bug_id: Optional[int] = None,
    background_tasks: Optional[BackgroundTasks] = None,
    email: bool = False,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        link=link,
        project_id=project_id,
        bug_id=bug_id,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)

    if email and background_tasks is not None:
        recipient = db.query(User).filter(User.id == user_id).first()
        if recipient:
            email_body = body or title
            app_link = _app_link(link)
            if app_link:
                email_body = f"{email_body}\n\nOpen TestBoard: {app_link}"
            background_tasks.add_task(send_email, recipient.email, title, email_body)

    return notification


def notify_admins(
    db: Session,
    notif_type: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    project_id: Optional[int] = None,
    bug_id: Optional[int] = None,
    background_tasks: Optional[BackgroundTasks] = None,
    email: bool = False,
    exclude_user_id: Optional[int] = None,
) -> None:
    admins = db.query(User).filter(User.role == "Admin", User.is_active == True).all()
    for admin in admins:
        if admin.id == exclude_user_id:
            continue
        notify(db, admin.id, notif_type, title, body, link, project_id, bug_id, background_tasks, email)


def notify_project_members(
    db: Session,
    project_id: int,
    notif_type: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    bug_id: Optional[int] = None,
    background_tasks: Optional[BackgroundTasks] = None,
    email: bool = False,
    exclude_user_id: Optional[int] = None,
) -> None:
    member_ids = {
        m.user_id for m in db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
    }
    for user_id in member_ids:
        if user_id == exclude_user_id:
            continue
        notify(db, user_id, notif_type, title, body, link, project_id, bug_id, background_tasks, email)
