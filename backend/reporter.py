import io
import csv
import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_
from backend.models import Bug, Project, ActivityLog, Comment, User

def calculate_qa_metrics(db: Session, start_date: datetime.datetime, end_date: datetime.datetime):
    # Filter bugs created or resolved in the period
    resolved_bugs = db.query(Bug).filter(
        Bug.status.in_(["Resolved", "Closed"]),
        Bug.resolved_at >= start_date,
        Bug.resolved_at <= end_date
    ).all()

    new_bugs = db.query(Bug).filter(
        Bug.created_at >= start_date,
        Bug.created_at <= end_date
    ).all()

    blockers = db.query(Bug).filter(
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
            # If resolved_at is set
            if bug.resolved_at and bug.created_at:
                diff = (bug.resolved_at - bug.created_at).total_seconds()
                total_seconds += max(diff, 0.0) # avoid negative time
        mttr_hours = round((total_seconds / len(resolved_bugs)) / 3600.0, 2)

    # Project movements
    movements_log = db.query(ActivityLog).filter(
        ActivityLog.activity_type == "project_status_change",
        ActivityLog.created_at >= start_date,
        ActivityLog.created_at <= end_date
    ).all()

    # Daily updates (comments)
    comments = db.query(Comment).filter(
        Comment.created_at >= start_date,
        Comment.created_at <= end_date
    ).all()

    # Active projects count
    total_projects = db.query(Project).count()

    # Summary Paragraph Generation
    movement_count = len(movements_log)
    resolved_count = len(resolved_bugs)
    new_bug_count = len(new_bugs)
    blocker_count = len(blockers)
    comment_count = len(comments)

    summary_text = (
        f"QA Activity Report from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}. "
        f"During this period, there were {movement_count} project status transitions across the project pipeline. "
        f"The QA team logged {new_bug_count} new bugs, including {blocker_count} blocker(s). "
        f"A total of {resolved_count} bug(s) were successfully resolved with a Mean Time to Resolve (MTTR) "
        f"of {mttr_hours} hours. Engineers and QA leads posted {comment_count} daily status comments to coordinate progress."
    )

    return {
        "start_date": start_date,
        "end_date": end_date,
        "summary_paragraph": summary_text,
        "bug_metrics": {
            "total_bugs": new_bug_count,
            "resolved_bugs": resolved_count,
            "open_bugs": len([b for b in new_bugs if b.status != "Resolved" and b.status != "Closed"]),
            "critical_bugs": len(critical_bugs),
            "blocker_bugs": blocker_count,
            "mttr_hours": mttr_hours
        },
        "movements": [
            {
                "project_id": log.project_id,
                "project_name": log.project.name if log.project else "Unknown Project",
                "from_status": log.old_value,
                "to_status": log.new_value,
                "user_name": log.user.full_name if log.user else "System",
                "changed_at": log.created_at
            } for log in movements_log
        ],
        "comments": comments,
        "blockers_encountered": blockers
    }

def generate_csv_bugs_report(db: Session, start_date: datetime.datetime, end_date: datetime.datetime) -> str:
    bugs = db.query(Bug).filter(
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

def generate_csv_projects_report(db: Session, start_date: datetime.datetime, end_date: datetime.datetime) -> str:
    logs = db.query(ActivityLog).filter(
        ActivityLog.activity_type == "project_status_change",
        ActivityLog.created_at >= start_date,
        ActivityLog.created_at <= end_date
    ).all()

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
