import React, { useEffect, useState } from 'react';
import { useAuth } from '../utils/auth';
import { useToast } from './Toast';
import { formatDateTimeWAT } from '../utils/datetime';
import { Mail, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

export const ReportSubscriptionsPanel = ({ projects }) => {
  const { token, API_URL } = useAuth();
  const { showSuccess, showError } = useToast();
  const [subscriptions, setSubscriptions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [creating, setCreating] = useState(false);

  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [subsRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/report-subscriptions`, { headers: authHeaders }),
        fetch(`${API_URL}/api/admin/users`, { headers: authHeaders }),
      ]);
      if (subsRes.ok) setSubscriptions(await subsRes.json());
      if (usersRes.ok) setUsers((await usersRes.json()).filter(u => u.role !== 'Pending'));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!selectedUserId || !selectedProjectId) return;
    try {
      setCreating(true);
      const response = await fetch(`${API_URL}/api/admin/report-subscriptions`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ user_id: parseInt(selectedUserId), project_id: parseInt(selectedProjectId) })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to create subscription');
      }
      setSelectedUserId('');
      setSelectedProjectId('');
      fetchAll();
      showSuccess('Digest subscription created.');
    } catch (err) {
      showError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (sub) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/report-subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ is_active: !sub.is_active })
      });
      if (!response.ok) throw new Error('Failed to update subscription');
      fetchAll();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleDelete = async (subId) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/report-subscriptions/${subId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (!response.ok) throw new Error('Failed to remove subscription');
      fetchAll();
      showSuccess('Subscription removed.');
    } catch (err) {
      showError(err.message);
    }
  };

  return (
    <div className="glass-panel" style={styles.panel}>
      <h3 style={styles.title}>
        <Mail size={16} style={{ marginRight: '8px' }} />
        Scheduled Weekly Digests
      </h3>
      <p style={styles.helpText}>
        Subscribed users get a weekly email summarizing bug activity for the selected project (new bugs, resolved,
        blockers, MTTR). Delivery runs on a schedule server-side — this panel just manages who's subscribed.
      </p>

      <form onSubmit={handleCreate} style={styles.form}>
        <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} style={styles.select}>
          <option value="">Select user...</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
        </select>
        <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} style={styles.select}>
          <option value="">Select project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="submit" className="btn-secondary" style={styles.addBtn} disabled={!selectedUserId || !selectedProjectId || creating}>
          <Plus size={14} /> Subscribe
        </button>
      </form>

      {loading ? (
        <p style={styles.emptyText}>Loading subscriptions...</p>
      ) : subscriptions.length === 0 ? (
        <p style={styles.emptyText}>No digest subscriptions yet.</p>
      ) : (
        <div style={styles.list}>
          {subscriptions.map(sub => (
            <div key={sub.id} style={styles.row}>
              <div style={styles.rowInfo}>
                <span style={styles.rowUser}>{sub.user.full_name}</span>
                <span style={styles.rowProject}>{sub.project.name}</span>
                <span style={styles.rowMeta}>
                  {sub.last_sent_at ? `Last sent ${formatDateTimeWAT(sub.last_sent_at)}` : 'Not sent yet'}
                </span>
              </div>
              <button style={styles.iconBtn} onClick={() => handleToggle(sub)} title={sub.is_active ? 'Pause' : 'Resume'}>
                {sub.is_active ? <ToggleRight size={20} color="var(--primary-neon)" /> : <ToggleLeft size={20} color="var(--text-subtle)" />}
              </button>
              <button style={styles.iconBtn} onClick={() => handleDelete(sub.id)} title="Remove subscription">
                <Trash2 size={14} color="var(--text-muted)" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles = {
  panel: {
    padding: '20px 24px',
  },
  title: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
    display: 'flex',
    alignItems: 'center',
    marginBottom: '8px',
  },
  helpText: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  form: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  },
  select: {
    flex: '1 1 200px',
    padding: '8px 10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    fontSize: '13px',
    outline: 'none',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },
  emptyText: {
    color: 'var(--text-subtle)',
    fontSize: '13px',
    textAlign: 'center',
    padding: '10px 0',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  rowInfo: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    minWidth: 0,
  },
  rowUser: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-strong)',
  },
  rowProject: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--primary-neon)',
    background: 'var(--primary-soft)',
    padding: '2px 8px',
    borderRadius: 'var(--border-radius-sm)',
  },
  rowMeta: {
    fontSize: '11px',
    color: 'var(--text-subtle)',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
};
