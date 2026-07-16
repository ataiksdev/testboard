import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import { 
  FileText, Calendar, Download, Printer, Copy, Check, 
  Bug, AlertTriangle, ArrowRight, Clock, MessageSquare, RefreshCw
} from 'lucide-react';

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
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const { token, API_URL } = useAuth();

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/reports?start_date=${startDate}&end_date=${endDate}`, {
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

  const handleCopySummary = () => {
    if (!reportData) return;
    navigator.clipboard.writeText(reportData.summary_paragraph);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const triggerPrint = () => {
    window.print();
  };

  const getExportBugsUrl = () => {
    return `${API_URL}/api/reports/export/bugs?start_date=${startDate}&end_date=${endDate}`;
  };

  const getExportProjectsUrl = () => {
    return `${API_URL}/api/reports/export/projects?start_date=${startDate}&end_date=${endDate}`;
  };

  const handleDownloadCsv = (type) => {
    // We can fetch with Authorization header and download via Blob to avoid token in query string if desired
    // Let's do a clean fetch that downloads the file directly
    const url = type === 'bugs' ? getExportBugsUrl() : getExportProjectsUrl();
    
    // We trigger download by fetching with credentials and saving blob
    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(response => {
      if (!response.ok) throw new Error("Failed to download CSV");
      return response.blob();
    })
    .then(blob => {
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = type === 'bugs' 
        ? `qa_bugs_report_${startDate}_to_${endDate}.csv`
        : `qa_projects_movement_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    })
    .catch(err => alert(err.message));
  };

  return (
    <div style={styles.container} className="print-container">
      {/* Date Selectors and Action Bar (Hidden when printing) */}
      <div style={styles.actionBar} className="no-print">
        <div style={styles.headerTitleSec}>
          <FileText size={24} color="var(--primary-neon)" />
          <h2 style={styles.title}>QA Periodic Reports</h2>
        </div>

        <div style={styles.controls}>
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
            onClick={fetchReport} 
            disabled={loading}
            style={styles.actionBtn}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Generate
          </button>

          {reportData && (
            <>
              <button 
                className="btn-secondary" 
                onClick={() => handleDownloadCsv('bugs')}
                style={styles.actionBtn}
              >
                <Download size={14} /> Bugs CSV
              </button>
              <button 
                className="btn-secondary" 
                onClick={() => handleDownloadCsv('projects')}
                style={styles.actionBtn}
              >
                <Download size={14} /> Projects CSV
              </button>
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
          
          {/* Email-Friendly Summary (Hidden when printing? No, user wants it at the top of printed report too! Let's display it prominently) */}
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

          {/* Project Movement Section */}
          <div className="glass-panel" style={styles.sectionPanel}>
            <h3 style={styles.panelTitle}>
              <RefreshCw size={18} color="var(--primary-neon)" style={{ marginRight: '8px' }} />
              Project Transitions Pipeline
            </h3>
            {reportData.movements.length === 0 ? (
              <p style={styles.emptyText}>No project status movements recorded during this period.</p>
            ) : (
              <div style={styles.movementsList}>
                {reportData.movements.map((m, idx) => (
                  <div key={idx} style={styles.movementItem}>
                    <div style={styles.moveProjName}>
                      <strong>{m.project_name}</strong>
                    </div>
                    <div style={styles.moveAction}>
                      <span style={{ ...styles.moveStatusBadge, color: `var(--status-${m.from_status.toLowerCase()})`, borderColor: `var(--status-${m.from_status.toLowerCase()})` }}>
                        {m.from_status}
                      </span>
                      <ArrowRight size={14} color="var(--text-subtle)" />
                      <span style={{ ...styles.moveStatusBadge, color: `var(--status-${m.to_status.toLowerCase()})`, borderColor: `var(--status-${m.to_status.toLowerCase()})` }}>
                        {m.to_status}
                      </span>
                    </div>
                    <div style={styles.moveMeta}>
                      <span>by {m.user_name}</span>
                      <span style={styles.moveDate}>
                        {new Date(m.changed_at).toLocaleDateString([], { dateStyle: 'short' })}
                      </span>
                    </div>
                  </div>
                ))}
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
                        {bug.project ? bug.project.key : 'BUG'}-{bug.id}
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
    gap: '12px',
  },
  movementItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    flexWrap: 'wrap',
    gap: '12px',
  },
  moveProjName: {
    flex: '1 1 200px',
  },
  moveAction: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: '1 1 200px',
  },
  moveStatusBadge: {
    fontSize: '12px',
    fontWeight: '700',
    padding: '3px 10px',
    borderRadius: 'var(--border-radius-sm)',
    borderWidth: '2px',
    borderStyle: 'solid',
    background: 'var(--bg-elevated)',
  },
  moveMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  moveDate: {
    color: 'var(--text-subtle)',
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
  td: {
    padding: '12px',
    color: 'var(--text-muted)',
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
