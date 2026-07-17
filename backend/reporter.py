import io
import csv
import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_
from backend.models import Bug, Project, Version, ActivityLog, Comment, User

OPEN_STATUSES = ("Open", "In Progress", "In QA")
CLOSED_STATUSES = ("Resolved", "Closed")


def _bugs_query(db: Session, project_id=None):
    query = db.query(Bug)
    if project_id is not None:
        query = query.filter(Bug.project_id == project_id)
    return query


def _compute_version_readiness(db: Session, project_id=None):
    """Live snapshot (not date-bound) of open/blocker/resolved bug counts per version."""
    query = db.query(Version).join(Project)
    if project_id is not None:
        query = query.filter(Version.project_id == project_id)

    readiness = []
    for version in query.all():
        version_bugs = db.query(Bug).filter(Bug.version_id == version.id).all()
        open_count = len([b for b in version_bugs if b.status not in CLOSED_STATUSES])
        blocker_count = len([b for b in version_bugs if b.is_blocker and b.status not in CLOSED_STATUSES])
        resolved_count = len([b for b in version_bugs if b.status in CLOSED_STATUSES])
        readiness.append({
            "version_id": version.id,
            "version_name": version.version_name,
            "project_id": version.project_id,
            "project_name": version.project.name if version.project else "Unknown Project",
            "status": version.status,
            "release_date": version.release_date,
            "open_bugs": open_count,
            "blocker_bugs": blocker_count,
            "resolved_bugs": resolved_count,
            "total_bugs": len(version_bugs),
        })

    readiness.sort(key=lambda v: (
        v["blocker_bugs"] == 0,
        v["release_date"] is None,
        v["release_date"] or datetime.datetime.max,
    ))
    return readiness


def _compute_team_workload(db: Session, start_date: datetime.datetime, end_date: datetime.datetime, project_id=None):
    """Currently-assigned (snapshot) vs resolved-in-period (date-bound), per bug owner."""
    owner_ids = [
        row[0] for row in
        _bugs_query(db, project_id).filter(Bug.owner_id.isnot(None)).with_entities(Bug.owner_id).distinct().all()
    ]

    workload = []
    for owner_id in owner_ids:
        owner = db.query(User).filter(User.id == owner_id).first()
        if not owner:
            continue
        owned_bugs = _bugs_query(db, project_id).filter(Bug.owner_id == owner_id).all()
        open_assigned = len([b for b in owned_bugs if b.status not in CLOSED_STATUSES])
        resolved_in_period = [
            b for b in owned_bugs
            if b.status in CLOSED_STATUSES and b.resolved_at and start_date <= b.resolved_at <= end_date
        ]
        avg_hours = None
        if resolved_in_period:
            total_seconds = sum(
                max((b.resolved_at - b.created_at).total_seconds(), 0.0)
                for b in resolved_in_period if b.created_at
            )
            avg_hours = round((total_seconds / len(resolved_in_period)) / 3600.0, 2)
        workload.append({
            "user_id": owner.id,
            "full_name": owner.full_name,
            "open_assigned": open_assigned,
            "resolved_in_period": len(resolved_in_period),
            "avg_resolution_hours": avg_hours,
        })

    workload.sort(key=lambda w: w["open_assigned"], reverse=True)
    return workload


def calculate_qa_metrics(db: Session, start_date: datetime.datetime, end_date: datetime.datetime, project_id=None):
    scope_project = db.query(Project).filter(Project.id == project_id).first() if project_id is not None else None

    resolved_bugs = _bugs_query(db, project_id).filter(
        Bug.status.in_(CLOSED_STATUSES),
        Bug.resolved_at >= start_date,
        Bug.resolved_at <= end_date
    ).all()

    new_bugs = _bugs_query(db, project_id).filter(
        Bug.created_at >= start_date,
        Bug.created_at <= end_date
    ).all()

    blockers = _bugs_query(db, project_id).filter(
        Bug.is_blocker == True,
        Bug.created_at >= start_date,
        Bug.created_at <= end_date
    ).all()

    critical_bugs = [b for b in new_bugs if b.severity == "Critical"]

    # Calculate MTTR
    mttr_hours = 0.0
    if resolved_bugs:
        total_seconds = 0.0
        for bug in resolved_bugs:
            if bug.resolved_at and bug.created_at:
                diff = (bug.resolved_at - bug.created_at).total_seconds()
                total_seconds += max(diff, 0.0)  # avoid negative time
        mttr_hours = round((total_seconds / len(resolved_bugs)) / 3600.0, 2)

    # Severity mix of bugs created in this period
    severity_breakdown = {"Low": 0, "Medium": 0, "High": 0, "Critical": 0}
    for bug in new_bugs:
        severity_breakdown[bug.severity] = severity_breakdown.get(bug.severity, 0) + 1

    # Current backlog distribution (snapshot, not date-bound)
    status_breakdown = {"Open": 0, "In Progress": 0, "In QA": 0, "Resolved": 0, "Closed": 0}
    for bug in _bugs_query(db, project_id).all():
        status_breakdown[bug.status] = status_breakdown.get(bug.status, 0) + 1

    # Comments: bug-linked comments only carry bug_id (no project_id), so scope via bug ids too
    comments_query = db.query(Comment)
    if project_id is not None:
        project_bug_ids = [b.id for b in _bugs_query(db, project_id).with_entities(Bug.id).all()]
        comments_query = comments_query.filter(
            or_(Comment.project_id == project_id, Comment.bug_id.in_(project_bug_ids))
        )
    comments = comments_query.filter(
        Comment.created_at >= start_date,
        Comment.created_at <= end_date
    ).all()

    # Activity timeline: every logged activity type, scoped + date-bound
    activity_base_query = db.query(ActivityLog)
    if project_id is not None:
        activity_base_query = activity_base_query.filter(ActivityLog.project_id == project_id)
    activity_base_query = activity_base_query.filter(
        ActivityLog.created_at >= start_date,
        ActivityLog.created_at <= end_date
    )
    activity_total = activity_base_query.count()
    movement_count = activity_base_query.filter(ActivityLog.activity_type == "project_status_change").count()
    activity_timeline = activity_base_query.order_by(ActivityLog.created_at.desc()).limit(200).all()

    version_readiness = _compute_version_readiness(db, project_id)
    team_workload = _compute_team_workload(db, start_date, end_date, project_id)

    # Summary Paragraph Generation
    resolved_count = len(resolved_bugs)
    new_bug_count = len(new_bugs)
    blocker_count = len(blockers)
    comment_count = len(comments)

    scope_phrase = f" for {scope_project.name}" if scope_project else " across all projects"
    versions_with_blockers = [v["version_name"] for v in version_readiness if v["blocker_bugs"] > 0]
    blocker_note = ""
    if versions_with_blockers:
        shown = ", ".join(versions_with_blockers[:3])
        more = "..." if len(versions_with_blockers) > 3 else ""
        blocker_note = f" {len(versions_with_blockers)} version(s) currently have open blockers: {shown}{more}."

    summary_text = (
        f"QA Activity Report{scope_phrase} from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}. "
        f"During this period, there were {movement_count} project status transitions across the project pipeline. "
        f"The QA team logged {new_bug_count} new bugs, including {blocker_count} blocker(s). "
        f"A total of {resolved_count} bug(s) were successfully resolved with a Mean Time to Resolve (MTTR) "
        f"of {mttr_hours} hours. Engineers and QA leads posted {comment_count} daily status comments to coordinate progress."
        f"{blocker_note}"
    )

    return {
        "start_date": start_date,
        "end_date": end_date,
        "project_id": project_id,
        "project_name": scope_project.name if scope_project else None,
        "summary_paragraph": summary_text,
        "bug_metrics": {
            "total_bugs": new_bug_count,
            "resolved_bugs": resolved_count,
            "open_bugs": len([b for b in new_bugs if b.status not in CLOSED_STATUSES]),
            "critical_bugs": len(critical_bugs),
            "blocker_bugs": blocker_count,
            "mttr_hours": mttr_hours
        },
        "severity_breakdown": severity_breakdown,
        "status_breakdown": status_breakdown,
        "version_readiness": version_readiness,
        "team_workload": team_workload,
        "activity_timeline": activity_timeline,
        "activity_timeline_truncated": activity_total > 200,
        "comments": comments,
        "blockers_encountered": blockers
    }

def generate_csv_bugs_report(db: Session, start_date: datetime.datetime, end_date: datetime.datetime, project_id=None) -> str:
    bugs = _bugs_query(db, project_id).filter(
        Bug.created_at >= start_date,
        Bug.created_at <= end_date
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Headers
    writer.writerow([
        "Bug ID", "Project Key", "Project Name", "Title", "Description",
        "Status", "Severity", "Is Blocker", "Owner", "Reporter",
        "Created At", "Resolved At", "MTTR (Hours)"
    ])

    for bug in bugs:
        mttr = ""
        if bug.resolved_at and bug.created_at:
            mttr = round((bug.resolved_at - bug.created_at).total_seconds() / 3600.0, 2)

        writer.writerow([
            f"{bug.project.key}-{bug.id}" if bug.project else bug.id,
            bug.project.key if bug.project else "",
            bug.project.name if bug.project else "",
            bug.title,
            bug.description,
            bug.status,
            bug.severity,
            "YES" if bug.is_blocker else "NO",
            bug.owner.full_name if bug.owner else "Unassigned",
            bug.reporter.full_name if bug.reporter else "",
            bug.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            bug.resolved_at.strftime('%Y-%m-%d %H:%M:%S') if bug.resolved_at else "",
            mttr
        ])

    return output.getvalue()

def generate_csv_projects_report(db: Session, start_date: datetime.datetime, end_date: datetime.datetime, project_id=None) -> str:
    query = db.query(ActivityLog).filter(
        ActivityLog.activity_type == "project_status_change",
        ActivityLog.created_at >= start_date,
        ActivityLog.created_at <= end_date
    )
    if project_id is not None:
        query = query.filter(ActivityLog.project_id == project_id)
    logs = query.all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Headers
    writer.writerow([
        "Transition ID", "Project Key", "Project Name",
        "From Status", "To Status", "Updated By", "Changed At"
    ])

    for log in logs:
        writer.writerow([
            log.id,
            log.project.key if log.project else "",
            log.project.name if log.project else "",
            log.old_value,
            log.new_value,
            log.user.full_name if log.user else "System",
            log.created_at.strftime('%Y-%m-%d %H:%M:%S')
        ])

    return output.getvalue()

def generate_csv_version_readiness(db: Session, project_id=None) -> str:
    readiness = _compute_version_readiness(db, project_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Version ID", "Version Name", "Project Name", "Status",
        "Release Date", "Open Bugs", "Blocker Bugs", "Resolved Bugs", "Total Bugs"
    ])
    for v in readiness:
        writer.writerow([
            v["version_id"],
            v["version_name"],
            v["project_name"],
            v["status"],
            v["release_date"].strftime('%Y-%m-%d') if v["release_date"] else "",
            v["open_bugs"],
            v["blocker_bugs"],
            v["resolved_bugs"],
            v["total_bugs"],
        ])
    return output.getvalue()

def generate_csv_team_workload(db: Session, start_date: datetime.datetime, end_date: datetime.datetime, project_id=None) -> str:
    workload = _compute_team_workload(db, start_date, end_date, project_id)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "User ID", "Full Name", "Currently Assigned (Open)", "Resolved In Period", "Avg Resolution (Hours)"
    ])
    for w in workload:
        writer.writerow([
            w["user_id"],
            w["full_name"],
            w["open_assigned"],
            w["resolved_in_period"],
            w["avg_resolution_hours"] if w["avg_resolution_hours"] is not None else "",
        ])
    return output.getvalue()

def generate_csv_activity_timeline(db: Session, start_date: datetime.datetime, end_date: datetime.datetime, project_id=None) -> str:
    query = db.query(ActivityLog).filter(
        ActivityLog.created_at >= start_date,
        ActivityLog.created_at <= end_date
    )
    if project_id is not None:
        query = query.filter(ActivityLog.project_id == project_id)
    logs = query.order_by(ActivityLog.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Activity ID", "Type", "Project", "Bug", "User", "Old Value", "New Value", "Timestamp"
    ])
    for log in logs:
        bug_label = ""
        if log.bug:
            bug_label = f"{log.bug.project.key}-{log.bug.id}" if log.bug.project else str(log.bug.id)
        writer.writerow([
            log.id,
            log.activity_type,
            log.project.name if log.project else "",
            bug_label,
            log.user.full_name if log.user else "System",
            log.old_value or "",
            log.new_value or "",
            log.created_at.strftime('%Y-%m-%d %H:%M:%S')
        ])
    return output.getvalue()
