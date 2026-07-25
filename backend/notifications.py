import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from backend.email_templates import render_email
from backend.models import Notification, ProjectMember, User


def send_email(to_email: str, subject: str, body: str, html_body: Optional[str] = None) -> None:
    """Best-effort SMTP send.

    Silently no-ops if TESTBOARD_SMTP_HOST isn't set, so notifications work
    with zero config out of the box. Swallows delivery errors so a broken
    mail server never breaks the request that triggered the notification.

    `body` is always sent as the plain-text part (accessibility + spam-filter
    friendliness). When `html_body` is given, the message becomes
    multipart/alternative so HTML-capable clients render the branded version.
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

    if html_body:
        message = MIMEMultipart("alternative")
        message.attach(MIMEText(body, "plain"))
        message.attach(MIMEText(html_body, "html"))
    else:
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
    if not base:
        return ""
    if not link:
        return base
    # The app uses hash-based client-side routing (window.location.hash), so
    # the '#' must be preserved in the built URL, not stripped along with it.
    return f"{base}/#{link.lstrip('#/')}"


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
            app_link = _app_link(link)
            subject, html_body, text_body = render_email(
                notif_type, title, body, app_link, recipient_name=recipient.full_name
            )
            background_tasks.add_task(send_email, recipient.email, subject, text_body, html_body)

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
    role: Optional[str] = None,
) -> None:
    """Notify project members, optionally restricted to a single User.role (e.g. "QA")."""
    query = db.query(ProjectMember).filter(ProjectMember.project_id == project_id)
    if role:
        query = query.join(User, User.id == ProjectMember.user_id).filter(User.role == role)
    member_ids = {m.user_id for m in query.all()}
    for user_id in member_ids:
        if user_id == exclude_user_id:
            continue
        notify(db, user_id, notif_type, title, body, link, project_id, bug_id, background_tasks, email)
