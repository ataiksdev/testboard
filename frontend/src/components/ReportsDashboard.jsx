import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import {
  FileText, Calendar, Printer, Copy, Check,
  Bug as BugIcon, AlertTriangle, ArrowRight, MessageSquare, RefreshCw,
  FolderKanban, CheckCircle, Users, GitBranch, BarChart3
} from 'lucide-react';

const SEVERITY_ORDER = ['Low', 'Medium', 'High', 'Critical'];
const SEVERITY_COLORS = {
  Low: 'var(--sev-low)',
  Medium: 'var(--sev-medium)',
  High: 'var(--sev-high)',
  Critical: 'var(--sev-critical)',
};
const STATUS_ORDER = ['Open', 'In Progress', 'In QA', 'Resolved', 'Closed'];
const VERSION_STATUS_COLOR = {
  Planning: 'var(--text-muted)',
  QA: 'var(--accent-mustard)',
  Released: 'var(--primary-neon)',
};
const ACTIVITY_ICONS = {
  project_created: FolderKanban,
  project_status_change: RefreshCw,
  bug_created: BugIcon,
  bug_status_change: RefreshCw,
  bug_resolved: CheckCircle,
  comment_added: MessageSquare,
  document_uploaded: FileText,
};
const EXPORTS = [
  { key: 'bugs', label: 'Bugs CSV', needsDates: true, filenameBase: 'qa_bugs_report' },
  { key: 'projects', label: 'Project Transitions CSV', needsDates: true, filenameBase: 'qa_project_transitions' },
  { key: 'versions', label: 'Version Readiness CSV', needsDates: false, filenameBase: 'qa_version_readiness' },
  { key: 'workload', label: 'Team Workload CSV', needsDates: true, filenameBase: 'qa_team_workload' },
  { key: 'activity', label: 'Activity Timeline CSV', needsDates: true, filenameBase: 'qa_activity_timeline' },
];

const describeActivity = (log) => {
  const who = log.user ? log.user.full_name : 'System';
  const bugRef = log.bug_title ? `"${log.bug_title}"` : (log.bug_id ? `Bug #${log.bug_id}` : 'a bug');
  const projRef = log.project_name || 'a project';
  switch (log.activity_type) {
    case 'project_created':
      return `${who} created project ${projRef}`;
    case 'project_status_change':
      return `${who} moved ${projRef}`;
    case 'bug_created':
      return `${who} logged ${bugRef} in ${projRef}`;
    case 'bug_status_change':
      return `${who} moved ${bugRef}`;
    case 'bug_resolved':
      return `${who} resolved ${bugRef}`;
    case 'comment_added':
      return `${who} commented on ${log.bug_title ? bugRef : projRef}`;
    case 'document_uploaded':
      return `${who} uploaded a document to ${projRef}`;
    default:
      return `${who} — ${log.activity_type.replace(/_/g, ' ')}`;
  }
};

const DistributionBar = ({ label, count, total, color }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={styles.distRow}>
      <span style={styles.distLabel}>{label}</span>
      <div style={styles.distTrack}>
        <div style={{ ...styles.distFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={styles.distCount}>{count}</span>
    </div>
  );
};

export const ReportsDashboard = () => {
  const getPastDateStr = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  };

  const getTodayDateStr = () => {
    return new Date().toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState(getPastDateStr(7));
  const [endDate, setEndDate] = useState(getTodayDateStr());
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const { token, API_URL } = useAuth();

  const fetchProjects = async () => {
    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) setProjects(await response.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchReport = async (overrideProjectId) => {
    try {
      setLoading(true);
      const scopeId = overrideProjectId !== undefined ? overrideProjectId : projectId;
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      if (scopeId) params.set('project_id', scopeId);
      const response = await fetch(`${API_URL}/api/reports?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error("Failed to compile report");
      const data = await response.json();
      setReportData(data);
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopySummary = () => {
    if (!reportData) return;
    navigator.clipboard.writeText(reportData.summary_paragraph);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const triggerPrint = () => {
    window.print();
  };

  const handleDownloadCsv = (exportKey) => {
    const exp = EXPORTS.find(x => x.key === exportKey);
    if (!exp) return;

    const params = new URLSearchParams();
    if (exp.needsDates) {
      params.set('start_date', startDate);
      params.set('end_date', endDate);
    }
    if (projectId) params.set('project_id', projectId);

    const url = `${API_URL}/api/reports/export/${exp.key}?${params.toString()}`;

    fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(response => {
        if (!response.ok) throw new Error("Failed to download CSV");
        return response.blob();
      })
      .then(blob => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = exp.needsDates
          ? `${exp.filenameBase}_${startDate}_to_${endDate}.csv`
          : `${exp.filenameBase}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);
      })
      .catch(err => alert(err.message));
  };

  const severityTotal = reportData
    ? SEVERITY_ORDER.reduce((sum, key) => sum + (reportData.severity_breakdown[key] || 0), 0)
    : 0;
  const statusTotal = reportData
    ? STATUS_ORDER.reduce((sum, key) => sum + (reportData.status_breakdown[key] || 0), 0)
    : 0;
  const showProjectColumn = !projectId;

  return (
    <div style={styles.container} className="print-container">
      {/* Date/Scope Selectors and Action Bar (Hidden when printing) */}
      <div style={styles.actionBar} className="no-print">
        <div style={styles.headerTitleSec}>
          <FileText size={24} color="var(--primary-neon)" />
          <h2 style={styles.title}>QA Periodic Reports</h2>
        </div>

        <div style={styles.controls}>
          <select
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); fetchReport(e.target.value); }}
            style={styles.projectSelect}
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <div style={styles.datePickerGroup}>
            <Calendar size={16} color="var(--text-muted)" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={styles.dateInput}
            />
            <span style={{ color: 'var(--text-subtle)' }}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={styles.dateInput}
            />
          </div>

          <button
            className="btn-secondary"
            onClick={() => fetchReport()}
            disabled={loading}
            style={styles.actionBtn}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Generate
          </button>

          {reportData && (
            <>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) handleDownloadCsv(e.target.value);
                  e.target.value = "";
                }}
                style={styles.exportSelect}
              >
                <option value="">Export CSV...</option>
                {EXPORTS.map(exp => <option key={exp.key} value={exp.key}>{exp.label}</option>)}
              </select>
              <button
                className="btn-primary"
                onClick={triggerPrint}
                style={styles.actionBtn}
              >
                <Printer size={14} /> Print Report
              </button>
            </>
          )}
        </div>
      </div>

      {loading && <div style={styles.loading}>Compiling periodic metrics...</div>}

      {reportData && !loading && (
        <div className="animate-fade-in" style={styles.reportLayout}>

          {/* Email-Friendly Summary */}
          <div className="glass-panel" style={styles.summaryBox}>
            <div style={styles.summaryHeader}>
              <h3 style={styles.sectionTitleDisplay}>Email-Friendly Status Summary</h3>
              <button
                className="btn-secondary no-print"
                onClick={handleCopySummary}
                style={styles.copyBtn}
              >
                {copied ? <Check size={14} color="var(--primary-neon)" /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy Text"}
              </button>
            </div>
            <p style={styles.summaryText}>{reportData.summary_paragraph}</p>
          </div>

          {/* Metrics Overview Grid */}
          <div style={styles.metricsGrid}>
            <div className="glass-panel" style={styles.metricCard}>
              <span style={styles.metricLabel}>New Bugs Logged</span>
              <span style={styles.metricValue}>{reportData.bug_metrics.total_bugs}</span>
              <span style={styles.metricSubtext}>reported in period</span>
            </div>
            <div className="glass-panel" style={styles.metricCard}>
              <span style={styles.metricLabel}>Bugs Resolved</span>
              <span style={{ ...styles.metricValue, color: 'var(--primary-neon)' }}>{reportData.bug_metrics.resolved_bugs}</span>
              <span style={styles.metricSubtext}>QA closed / resolved</span>
            </div>
            <div className="glass-panel" style={styles.metricCard}>
              <span style={styles.metricLabel}>Mean Time to Resolve</span>
              <span style={{ ...styles.metricValue, color: 'var(--accent-mustard)' }}>
                {reportData.bug_metrics.mttr_hours}
                <span style={{ fontSize: '18px', fontWeight: '500', marginLeft: '4px' }}>hrs</span>
              </span>
              <span style={styles.metricSubtext}>average fix duration</span>
            </div>
            <div className="glass-panel" style={styles.metricCard}>
              <span style={styles.metricLabel}>Blockers Encountered</span>
              <span style={{
                ...styles.metricValue,
                color: reportData.bug_metrics.blocker_bugs > 0 ? 'var(--accent-rust)' : 'var(--text-main)'
              }}>
                {reportData.bug_metrics.blocker_bugs}
              </span>
              <span style={styles.metricSubtext}>critical gating issues</span>
            </div>
          </div>

          {/* Severity & Status Distribution */}
          <div style={styles.distGrid}>
            <div className="glass-panel" style={styles.sectionPanel}>
              <h3 style={styles.panelTitle}>
                <BarChart3 size={18} color="var(--primary-neon)" style={{ marginRight: '8px' }} />
                Severity Mix (new bugs in period)
              </h3>
              {severityTotal === 0 ? (
                <p style={styles.emptyText}>No bugs logged in this period.</p>
              ) : (
                SEVERITY_ORDER.map(key => (
                  <DistributionBar
                    key={key}
                    label={key}
                    count={reportData.severity_breakdown[key] || 0}
                    total={severityTotal}
                    color={SEVERITY_COLORS[key]}
                  />
                ))
              )}
            </div>
            <div className="glass-panel" style={styles.sectionPanel}>
              <h3 style={styles.panelTitle}>
                <BarChart3 size={18} color="var(--primary-neon)" style={{ marginRight: '8px' }} />
                Current Backlog by Status
              </h3>
              <p style={styles.snapshotNote}>Live snapshot — not limited to the selected date range.</p>
              {statusTotal === 0 ? (
                <p style={styles.emptyText}>No bugs in scope.</p>
              ) : (
                STATUS_ORDER.map(key => (
                  <DistributionBar
                    key={key}
                    label={key}
                    count={reportData.status_breakdown[key] || 0}
                    total={statusTotal}
                    color="var(--primary-neon)"
                  />
                ))
              )}
            </div>
          </div>

          {/* Release Readiness */}
          <div className="glass-panel" style={styles.sectionPanel}>
            <h3 style={styles.panelTitle}>
              <GitBranch size={18} color="var(--primary-neon)" style={{ marginRight: '8px' }} />
              Release Readiness
            </h3>
            <p style={styles.snapshotNote}>Live snapshot per version — not limited to the selected date range.</p>
            {reportData.version_readiness.length === 0 ? (
              <p style={styles.emptyText}>No versions found in scope.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Version</th>
                    {showProjectColumn && <th style={styles.th}>Project</th>}
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Release Date</th>
                    <th style={styles.th}>Open</th>
                    <th style={styles.th}>Blockers</th>
                    <th style={styles.th}>Resolved</th>
                    <th style={styles.th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.version_readiness.map(v => (
                    <tr key={v.version_id} style={v.blocker_bugs > 0 ? styles.blockerRow : styles.tr}>
                      <td style={{ ...styles.td, fontWeight: '700', color: 'var(--text-strong)' }}>{v.version_name}</td>
                      {showProjectColumn && <td style={styles.td}>{v.project_name}</td>}
                      <td style={styles.td}>
                        <span style={{
                          ...styles.versionStatusBadge,
                          color: VERSION_STATUS_COLOR[v.status] || 'var(--text-muted)',
                          borderColor: VERSION_STATUS_COLOR[v.status] || 'var(--glass-border)',
                        }}>
                          {v.status}
                        </span>
                      </td>
                      <td style={styles.td}>{v.release_date ? new Date(v.release_date).toLocaleDateString() : '—'}</td>
                      <td style={styles.td}>{v.open_bugs}</td>
                      <td style={{ ...styles.td, color: v.blocker_bugs > 0 ? 'var(--accent-rust)' : 'var(--text-muted)', fontWeight: v.blocker_bugs > 0 ? '700' : '400' }}>
                        {v.blocker_bugs}
                      </td>
                      <td style={styles.td}>{v.resolved_bugs}</td>
                      <td style={styles.td}>{v.total_bugs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Team Workload */}
          <div className="glass-panel" style={styles.sectionPanel}>
            <h3 style={styles.panelTitle}>
              <Users size={18} color="var(--primary-neon)" style={{ marginRight: '8px' }} />
              Team Workload
            </h3>
            {reportData.team_workload.length === 0 ? (
              <p style={styles.emptyText}>No bugs are currently assigned in scope.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Member</th>
                    <th style={styles.th}>Currently Assigned</th>
                    <th style={styles.th}>Resolved in Period</th>
                    <th style={styles.th}>Avg Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.team_workload.map(w => (
                    <tr key={w.user_id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight: '700', color: 'var(--text-strong)' }}>{w.full_name}</td>
                      <td style={styles.td}>{w.open_assigned}</td>
                      <td style={styles.td}>{w.resolved_in_period}</td>
                      <td style={styles.td}>{w.avg_resolution_hours != null ? `${w.avg_resolution_hours} hrs` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="glass-panel" style={styles.sectionPanel}>
            <h3 style={styles.panelTitle}>
              <RefreshCw size={18} color="var(--primary-neon)" style={{ marginRight: '8px' }} />
              Activity Timeline
            </h3>
            {reportData.activity_timeline_truncated && (
              <p style={styles.snapshotNote}>
                Showing the latest 200 entries — export the Activity Timeline CSV for the complete list.
              </p>
            )}
            {reportData.activity_timeline.length === 0 ? (
              <p style={styles.emptyText}>No activity recorded during this period.</p>
            ) : (
              <div style={styles.movementsList}>
                {reportData.activity_timeline.map(log => {
                  const Icon = ACTIVITY_ICONS[log.activity_type] || RefreshCw;
                  const isTransition = log.activity_type === 'project_status_change' || log.activity_type === 'bug_status_change' || log.activity_type === 'bug_resolved';
                  return (
                    <div key={log.id} style={styles.timelineItem}>
                      <Icon size={16} color="var(--primary-neon)" style={{ flexShrink: 0 }} />
                      <div style={styles.timelineBody}>
                        <span>{describeActivity(log)}</span>
                        {isTransition && log.old_value && log.new_value && (
                          <span style={styles.timelineTransition}>
                            <span style={styles.moveStatusBadge}>{log.old_value}</span>
                            <ArrowRight size={12} color="var(--text-subtle)" />
                            <span style={styles.moveStatusBadge}>{log.new_value}</span>
                          </span>
                        )}
                      </div>
                      <span style={styles.moveDate}>
                        {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Blockers Encountered Details */}
          <div className="glass-panel" style={styles.sectionPanel}>
            <h3 style={styles.panelTitle}>
              <AlertTriangle size={18} color="var(--accent-rust)" style={{ marginRight: '8px' }} />
              Active Blockers Logs
            </h3>
            {reportData.blockers_encountered.length === 0 ? (
              <p style={styles.emptyText}>No active blocker bugs logged during this period.</p>
            ) : (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Bug ID</th>
                    <th style={styles.th}>Title</th>
                    <th style={styles.th}>Severity</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Owner</th>
                    <th style={styles.th}>Logged Date</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.blockers_encountered.map(bug => (
                    <tr key={bug.id} style={styles.tr}>
                      <td style={{ ...styles.td, fontWeight: '700', color: 'var(--primary-neon)' }}>
                        {bug.project ? `${bug.project.key}-${String(bug.project_sequence != null ? bug.project_sequence : bug.id).padStart(3, '0')}` : `BUG-${bug.id}`}
                      </td>
                      <td style={styles.td}>{bug.title}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.blockSev,
                          background: `var(--sev-${bug.severity.toLowerCase()})`
                        }}>
                          {bug.severity}
                        </span>
                      </td>
                      <td style={styles.td}>{bug.status}</td>
                      <td style={styles.td}>{bug.owner ? bug.owner.full_name : 'Unassigned'}</td>
                      <td style={styles.td}>{new Date(bug.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* EOD Comments Summary */}
          <div className="glass-panel" style={styles.sectionPanel}>
            <h3 style={styles.panelTitle}>
              <MessageSquare size={18} color="var(--primary-accent)" style={{ marginRight: '8px' }} />
              Logged Status updates / Comments
            </h3>
            {reportData.comments.length === 0 ? (
              <p style={styles.emptyText}>No status comments or EOD check-ins logged in this timeframe.</p>
            ) : (
              <div style={styles.commentsContainer}>
                {reportData.comments.map(c => (
                  <div key={c.id} style={styles.commentCard}>
                    <div style={styles.commentHeader}>
                      <strong>{c.user.full_name}</strong>
                      <span style={styles.commentSource}>
                        {c.bug_id ? `Bug ID: ${c.bug_id}` : c.project_id ? `Project ID: ${c.project_id}` : 'General'}
                      </span>
                      <span style={styles.commentDate}>
                        {new Date(c.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <p style={styles.commentBody}>{c.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '10px 0',
  },
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  headerTitleSec: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-strong)',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  projectSelect: {
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    outline: 'none',
    fontSize: '14px',
  },
  exportSelect: {
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    outline: 'none',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  datePickerGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '6px 12px',
  },
  dateInput: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-main)',
    outline: 'none',
    fontSize: '14px',
    cursor: 'pointer',
  },
  actionBtn: {
    padding: '8px 14px',
    fontSize: '13px',
  },
  loading: {
    textAlign: 'center',
    padding: '80px 0',
    color: 'var(--text-muted)',
  },
  reportLayout: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  summaryBox: {
    padding: '24px',
    borderLeft: '6px solid var(--primary-neon)',
  },
  summaryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  sectionTitleDisplay: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
  },
  copyBtn: {
    padding: '4px 10px',
    fontSize: '12px',
  },
  summaryText: {
    color: 'var(--text-main)',
    fontSize: '15px',
    lineHeight: '1.6',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '16px',
  },
  metricCard: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    marginBottom: '12px',
  },
  metricValue: {
    fontSize: '36px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    lineHeight: '1',
    marginBottom: '8px',
    fontFamily: 'var(--font-display)',
  },
  metricSubtext: {
    fontSize: '11px',
    color: 'var(--text-subtle)',
  },
  distGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '16px',
  },
  distRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '10px',
  },
  distLabel: {
    width: '90px',
    flexShrink: 0,
    fontSize: '13px',
    color: 'var(--text-muted)',
    fontWeight: '600',
  },
  distTrack: {
    flex: 1,
    height: '10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    overflow: 'hidden',
  },
  distFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  distCount: {
    width: '28px',
    flexShrink: 0,
    textAlign: 'right',
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-strong)',
  },
  snapshotNote: {
    fontSize: '12px',
    color: 'var(--text-subtle)',
    marginTop: '-10px',
    marginBottom: '16px',
    fontStyle: 'italic',
  },
  sectionPanel: {
    padding: '24px',
  },
  panelTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    display: 'flex',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '2px solid var(--glass-border)',
    paddingBottom: '12px',
    fontFamily: 'var(--font-display)',
  },
  emptyText: {
    color: 'var(--text-subtle)',
    fontSize: '14px',
    textAlign: 'center',
    padding: '20px 0',
  },
  movementsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  timelineItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  timelineBody: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    fontSize: '13px',
    color: 'var(--text-main)',
  },
  timelineTransition: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  moveStatusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: 'var(--border-radius-sm)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--glass-border)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-muted)',
  },
  moveDate: {
    fontSize: '12px',
    color: 'var(--text-subtle)',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '2px solid var(--glass-border)',
    color: 'var(--text-muted)',
    fontWeight: '700',
  },
  tr: {
    borderBottom: '2px solid var(--glass-border)',
  },
  blockerRow: {
    borderBottom: '2px solid var(--glass-border)',
    background: 'var(--danger-bg)',
  },
  td: {
    padding: '12px',
    color: 'var(--text-muted)',
  },
  versionStatusBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: 'var(--border-radius-sm)',
    borderWidth: '2px',
    borderStyle: 'solid',
    background: 'var(--bg-elevated)',
  },
  blockSev: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: 'var(--border-radius-sm)',
    color: '#12100d',
  },
  commentsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  commentCard: {
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    padding: '16px',
    borderRadius: 'var(--border-radius-sm)',
  },
  commentHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginBottom: '8px',
    borderBottom: '2px dashed var(--glass-border)',
    paddingBottom: '6px',
  },
  commentSource: {
    background: 'var(--primary-soft)',
    color: 'var(--primary-neon)',
    padding: '1px 6px',
    borderRadius: 'var(--border-radius-sm)',
    fontWeight: '700',
  },
  commentDate: {
    color: 'var(--text-subtle)',
  },
  commentBody: {
    color: 'var(--text-main)',
    fontSize: '13px',
    lineHeight: '1.5',
  }
};
