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
          <FileText size={24} color="#6366f1" />
          <h2 style={styles.title}>QA Periodic Reports</h2>
        </div>

        <div style={styles.controls}>
          <div style={styles.datePickerGroup}>
            <Calendar size={16} color="#9ca3af" />
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              style={styles.dateInput}
            />
            <span style={{ color: '#6b7280' }}>to</span>
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
                className="btn-primary animate-pulse-glow" 
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
                {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
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
              <span style={{ ...styles.metricValue, color: '#10b981' }}>{reportData.bug_metrics.resolved_bugs}</span>
              <span style={styles.metricSubtext}>QA closed / resolved</span>
            </div>
            <div className="glass-panel" style={styles.metricCard}>
              <span style={styles.metricLabel}>Mean Time to Resolve</span>
              <span style={{ ...styles.metricValue, color: '#3b82f6' }}>
                {reportData.bug_metrics.mttr_hours}
                <span style={{ fontSize: '18px', fontWeight: '500', marginLeft: '4px' }}>hrs</span>
              </span>
              <span style={styles.metricSubtext}>average fix duration</span>
            </div>
            <div className="glass-panel" style={styles.metricCard}>
              <span style={styles.metricLabel}>Blockers Encountered</span>
              <span style={{ 
                ...styles.metricValue, 
                color: reportData.bug_metrics.blocker_bugs > 0 ? '#ef4444' : 'var(--text-main)' 
              }}>
                {reportData.bug_metrics.blocker_bugs}
              </span>
              <span style={styles.metricSubtext}>critical gating issues</span>
            </div>
          </div>

          {/* Project Movement Section */}
          <div className="glass-panel" style={styles.sectionPanel}>
            <h3 style={styles.panelTitle}>
              <RefreshCw size={18} color="#6366f1" style={{ marginRight: '8px' }} />
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
                      <span style={{ ...styles.moveStatusBadge, color: `var(--status-${m.from_status.toLowerCase()})`, background: `rgba(255, 255, 255, 0.02)` }}>
                        {m.from_status}
                      </span>
                      <ArrowRight size={14} color="#6b7280" />
                      <span style={{ ...styles.moveStatusBadge, color: `var(--status-${m.to_status.toLowerCase()})`, background: `rgba(255, 255, 255, 0.04)` }}>
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
              <AlertTriangle size={18} color="#ef4444" style={{ marginRight: '8px' }} />
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
                      <td style={{ ...styles.td, fontWeight: '700', color: '#818cf8' }}>
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
              <MessageSquare size={18} color="#0ea5e9" style={{ marginRight: '8px' }} />
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
    fontWeight: '600',
    fontFamily: "'Outfit', sans-serif",
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
    background: 'rgba(30, 41, 59, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    padding: '6px 12px',
  },
  dateInput: {
    background: 'transparent',
    border: 'none',
    color: '#f3f4f6',
    outline: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    colorScheme: 'dark',
  },
  actionBtn: {
    padding: '8px 14px',
    fontSize: '13px',
  },
  loading: {
    textAlign: 'center',
    padding: '80px 0',
    color: '#9ca3af',
  },
  reportLayout: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  summaryBox: {
    padding: '24px',
    borderLeft: '4px solid #6366f1',
  },
  summaryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  sectionTitleDisplay: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#cbd5e1',
    fontFamily: "'Outfit', sans-serif",
  },
  copyBtn: {
    padding: '4px 10px',
    fontSize: '12px',
  },
  summaryText: {
    color: '#e2e8f0',
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
    color: '#9ca3af',
    marginBottom: '12px',
  },
  metricValue: {
    fontSize: '36px',
    fontWeight: '700',
    color: '#f3f4f6',
    lineHeight: '1',
    marginBottom: '8px',
    fontFamily: "'Outfit', sans-serif",
  },
  metricSubtext: {
    fontSize: '11px',
    color: '#6b7280',
  },
  sectionPanel: {
    padding: '24px',
  },
  panelTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    marginBottom: '20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    paddingBottom: '12px',
    fontFamily: "'Outfit', sans-serif",
  },
  emptyText: {
    color: '#475569',
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
    background: 'rgba(255, 255, 255, 0.01)',
    border: '1px solid rgba(255, 255, 255, 0.02)',
    borderRadius: '6px',
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
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.02)',
  },
  moveMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    color: '#94a3b8',
  },
  moveDate: {
    color: '#475569',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '2px solid rgba(255, 255, 255, 0.06)',
    color: '#9ca3af',
    fontWeight: '600',
  },
  tr: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    '&:hover': {
      background: 'rgba(255, 255, 255, 0.01)',
    }
  },
  td: {
    padding: '12px',
    color: '#cbd5e1',
  },
  blockSev: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 6px',
    borderRadius: '4px',
    color: 'white',
  },
  commentsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  commentCard: {
    background: 'rgba(255, 255, 255, 0.01)',
    border: '1px solid rgba(255, 255, 255, 0.02)',
    padding: '16px',
    borderRadius: '8px',
  },
  commentHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '8px',
    borderBottom: '1px dashed rgba(255, 255, 255, 0.04)',
    paddingBottom: '6px',
  },
  commentSource: {
    background: 'rgba(99, 102, 241, 0.1)',
    color: '#818cf8',
    padding: '1px 6px',
    borderRadius: '4px',
    fontWeight: '600',
  },
  commentDate: {
    color: '#475569',
  },
  commentBody: {
    color: '#e2e8f0',
    fontSize: '13px',
    lineHeight: '1.5',
  }
};
