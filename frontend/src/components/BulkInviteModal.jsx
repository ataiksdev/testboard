import React, { useState } from 'react';
import { useAuth } from '../utils/auth';
import { useToast } from './Toast';
import { X, UploadCloud, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ROLES } from '../utils/roles';

const splitCsvRow = (line) => line.split(',').map(cell => cell.trim().replace(/^"(.*)"$/, '$1'));

const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const header = splitCsvRow(lines[0]).map(h => h.toLowerCase());
  const emailIdx = header.indexOf('email');
  const hasHeader = emailIdx !== -1;

  const eIdx = hasHeader ? emailIdx : 0;
  const rIdx = hasHeader ? header.indexOf('role') : 1;
  const nIdx = hasHeader ? (header.indexOf('full_name') !== -1 ? header.indexOf('full_name') : header.indexOf('name')) : 2;

  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map(line => {
    const cells = splitCsvRow(line);
    return {
      email: (cells[eIdx] || '').trim(),
      role: (cells[rIdx] || '').trim(),
      full_name: nIdx >= 0 ? (cells[nIdx] || '').trim() : '',
    };
  }).filter(row => row.email);
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateRow = (row) => {
  if (!EMAIL_RE.test(row.email)) return 'Invalid email';
  const matchedRole = ROLES.find(r => r.toLowerCase() === row.role.toLowerCase());
  if (!matchedRole) return `Unknown role "${row.role}"`;
  return null;
};

export const BulkInviteModal = ({ onClose, onInvited }) => {
  const { token, API_URL } = useAuth();
  const { showSuccess, showError } = useToast();
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const parsed = parseCsv(String(evt.target.result));
      setRows(parsed.map(row => ({
        ...row,
        // Normalize role casing to match ROLES exactly when it's a valid role
        role: ROLES.find(r => r.toLowerCase() === row.role.toLowerCase()) || row.role,
      })));
    };
    reader.readAsText(file);
  };

  const validRows = rows.filter(row => !validateRow(row));

  const handleSend = async () => {
    if (validRows.length === 0) return;
    try {
      setSubmitting(true);
      const response = await fetch(`${API_URL}/api/admin/users/bulk-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ invites: validRows.map(({ email, role, full_name }) => ({ email, role, full_name: full_name || undefined })) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Bulk invite failed');
      setResult(data);
      if (data.invited.length > 0) {
        showSuccess(`Invited ${data.invited.length} user(s).`);
        onInvited();
      }
      if (data.skipped.length > 0) {
        showError(`${data.skipped.length} row(s) skipped — see details below.`);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Bulk Invite via CSV</h3>
          <button style={styles.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        <p style={styles.helpText}>
          Upload a CSV with <code>email</code> and <code>role</code> columns (an optional <code>full_name</code>
          column too). Each row gets a Pending account and an email with a link to set their password;
          an Admin still needs to approve them afterward.
        </p>

        <label style={styles.fileDrop}>
          <UploadCloud size={22} color="var(--text-muted)" />
          <span>{fileName || 'Choose a CSV file'}</span>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
        </label>

        {rows.length > 0 && !result && (
          <>
            <div style={styles.previewWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Email</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const err = validateRow(row);
                    return (
                      <tr key={i}>
                        <td style={styles.td}>{row.email}</td>
                        <td style={styles.td}>{row.role}</td>
                        <td style={styles.td}>{row.full_name || <span style={{ color: 'var(--text-subtle)' }}>(derived)</span>}</td>
                        <td style={{ ...styles.td, color: err ? 'var(--danger-text)' : 'var(--status-completed)' }}>
                          {err || 'Valid'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryText}>
                {validRows.length} of {rows.length} row(s) will be invited.
              </span>
              <button
                className="btn-primary"
                style={styles.sendBtn}
                onClick={handleSend}
                disabled={submitting || validRows.length === 0}
              >
                <Send size={15} />
                {submitting ? 'Sending...' : `Send ${validRows.length} Invite(s)`}
              </button>
            </div>
          </>
        )}

        {result && (
          <div style={styles.resultBox} className="animate-slide-up">
            <div style={styles.resultRow}>
              <CheckCircle2 size={16} color="var(--status-completed)" />
              <span>{result.invited.length} invited: {result.invited.join(', ') || '—'}</span>
            </div>
            {result.skipped.length > 0 && (
              <div style={styles.resultRow}>
                <AlertTriangle size={16} color="var(--danger-text)" />
                <span>
                  {result.skipped.length} skipped: {result.skipped.map(s => `${s.email} (${s.reason})`).join('; ')}
                </span>
              </div>
            )}
            <button className="btn-secondary" style={{ marginTop: '12px' }} onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '2px solid var(--glass-border)',
    paddingBottom: '16px',
    marginBottom: '16px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  helpText: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  fileDrop: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px',
    background: 'var(--bg-tertiary)',
    border: '2px dashed var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '16px',
  },
  previewWrap: {
    maxHeight: '280px',
    overflowY: 'auto',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    marginBottom: '12px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '2px solid var(--glass-border)',
    color: 'var(--text-muted)',
    fontWeight: '700',
    fontSize: '11px',
    textTransform: 'uppercase',
    position: 'sticky',
    top: 0,
    background: 'var(--bg-elevated)',
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--glass-border)',
    color: 'var(--text-main)',
  },
  summaryRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  summaryText: {
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  sendBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    fontSize: '13px',
  },
  resultBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '14px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '13px',
    color: 'var(--text-main)',
    lineHeight: '1.5',
  },
};
