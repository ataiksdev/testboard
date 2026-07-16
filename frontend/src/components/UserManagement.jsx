import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import { Search, X, FolderKanban, Activity, ShieldOff, ShieldCheck } from 'lucide-react';
import { ROLES, ROLE_COLOR_VAR } from '../utils/roles';

const formatActivity = (a) => {
  switch (a.activity_type) {
    case 'project_created':
      return `Created project "${a.project_name || 'Unknown'}"`;
    case 'project_status_change':
      return `Changed project "${a.project_name || 'Unknown'}" status: ${a.old_value} → ${a.new_value}`;
    case 'bug_created':
      return `Logged bug "${a.bug_title || 'Unknown'}"`;
    case 'bug_status_change':
      return `Updated bug "${a.bug_title || 'Unknown'}" status: ${a.old_value} → ${a.new_value}`;
    case 'bug_resolved':
      return `Resolved bug "${a.bug_title || 'Unknown'}"`;
    case 'comment_added':
      return a.bug_title
        ? `Commented on bug "${a.bug_title}"`
        : a.project_name
        ? `Commented on project "${a.project_name}"`
        : 'Posted a comment';
    default:
      return a.activity_type;
  }
};

export const UserManagement = () => {
  const { token, API_URL } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const [detailUser, setDetailUser] = useState(null);
  const [detailProjects, setDetailProjects] = useState([]);
  const [detailActivity, setDetailActivity] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [search, roleFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      const response = await fetch(`${API_URL}/api/admin/users?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.filter(u => u.role !== 'Pending'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, role) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ role })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to update role');
      }
      fetchUsers();
      if (detailUser?.id === userId) setDetailUser(u => ({ ...u, role }));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleToggleActive = async (targetUser) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${targetUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ is_active: !targetUser.is_active })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to update status');
      }
      fetchUsers();
      if (detailUser?.id === targetUser.id) setDetailUser(u => ({ ...u, is_active: !targetUser.is_active }));
    } catch (err) {
      alert(err.message);
    }
  };

  const openDetail = async (targetUser) => {
    setDetailUser(targetUser);
    setDetailLoading(true);
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [projRes, actRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/users/${targetUser.id}/projects`, { headers }),
        fetch(`${API_URL}/api/admin/users/${targetUser.id}/activity`, { headers })
      ]);
      setDetailProjects(projRes.ok ? await projRes.json() : []);
      setDetailActivity(actRes.ok ? await actRes.json() : []);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailUser(null);
    setDetailProjects([]);
    setDetailActivity([]);
  };

  if (loading && users.length === 0) return <div style={styles.loading}>Loading users...</div>;

  return (
    <div>
      <div style={styles.toolbar}>
        <div style={styles.searchWrap}>
          <Search size={16} color="var(--text-muted)" />
          <input
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={styles.roleFilterSelect}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="glass-panel" style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>User</th>
              <th style={styles.th}>Role</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={styles.tr}>
                <td style={styles.tdUser} onClick={() => openDetail(u)}>
                  <div style={styles.miniAvatar}>{u.full_name[0].toUpperCase()}</div>
                  <div>
                    <div style={styles.userNameCell}>{u.full_name}</div>
                    <div style={styles.userEmailCell}>{u.email}</div>
                  </div>
                </td>
                <td style={styles.td}>
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    style={{
                      ...styles.roleSelect,
                      borderColor: `var(${ROLE_COLOR_VAR[u.role] || '--glass-border'})`,
                      color: `var(${ROLE_COLOR_VAR[u.role] || '--text-main'})`,
                    }}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={styles.td}>
                  <span
                    className="badge"
                    style={{
                      borderColor: u.is_active ? 'var(--status-completed)' : 'var(--danger-border)',
                      color: u.is_active ? 'var(--status-completed)' : 'var(--danger-text)',
                      background: u.is_active ? 'rgba(82, 183, 136, 0.14)' : 'var(--danger-bg)',
                    }}
                  >
                    {u.is_active ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td style={styles.td}>
                  <button
                    className={u.is_active ? 'btn-danger' : 'btn-secondary'}
                    style={styles.actionBtn}
                    onClick={() => handleToggleActive(u)}
                  >
                    {u.is_active ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                    {u.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} style={styles.emptyRow}>No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detailUser && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-content glass-panel" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalHeaderUser}>
                <div style={styles.avatar}>{detailUser.full_name[0].toUpperCase()}</div>
                <div>
                  <h3 style={styles.modalTitle}>{detailUser.full_name}</h3>
                  <span style={styles.modalSubtext}>{detailUser.email}</span>
                </div>
              </div>
              <button style={styles.closeBtn} onClick={closeDetail}>
                <X size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div style={styles.loading}>Loading details...</div>
            ) : (
              <div style={styles.modalBody}>
                <div style={styles.detailSection}>
                  <h4 style={styles.detailTitle}>
                    <FolderKanban size={15} style={{ marginRight: '6px' }} />
                    Assigned Projects ({detailProjects.length})
                  </h4>
                  {detailProjects.length === 0 ? (
                    <p style={styles.emptyText}>Not assigned to any projects.</p>
                  ) : (
                    <div style={styles.projectsList}>
                      {detailProjects.map(p => (
                        <div key={p.id} style={styles.projectRow}>
                          <span style={styles.projectKey}>{p.key}</span>
                          <span style={styles.projectName}>{p.name}</span>
                          <span className={`badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={styles.detailSection}>
                  <h4 style={styles.detailTitle}>
                    <Activity size={15} style={{ marginRight: '6px' }} />
                    Recent Activity
                  </h4>
                  {detailActivity.length === 0 ? (
                    <p style={styles.emptyText}>No recorded activity yet.</p>
                  ) : (
                    <div style={styles.activityList}>
                      {detailActivity.map(a => (
                        <div key={a.id} style={styles.activityRow}>
                          <span style={styles.activityText}>{formatActivity(a)}</span>
                          <span style={styles.activityTime}>
                            {new Date(a.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  loading: {
    textAlign: 'center',
    padding: '60px 0',
    color: 'var(--text-muted)',
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '8px 12px',
    flex: '1 1 220px',
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-main)',
    fontSize: '14px',
    width: '100%',
  },
  roleFilterSelect: {
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    outline: 'none',
    fontSize: '14px',
  },
  tableWrap: {
    padding: '8px',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
    minWidth: '560px',
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '2px solid var(--glass-border)',
    color: 'var(--text-muted)',
    fontWeight: '700',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  tr: {
    borderBottom: '2px solid var(--glass-border)',
  },
  td: {
    padding: '10px 12px',
    color: 'var(--text-main)',
  },
  tdUser: {
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
  },
  miniAvatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'var(--primary-neon)',
    border: '2px solid var(--ink)',
    color: 'var(--text-inverse)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '13px',
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
  },
  userNameCell: {
    fontWeight: '600',
    color: 'var(--text-strong)',
  },
  userEmailCell: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  roleSelect: {
    padding: '6px 10px',
    background: 'var(--bg-tertiary)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    outline: 'none',
    fontSize: '13px',
    fontWeight: '700',
  },
  actionBtn: {
    padding: '6px 12px',
    fontSize: '12px',
  },
  emptyRow: {
    textAlign: 'center',
    padding: '30px 0',
    color: 'var(--text-subtle)',
  },

  // Detail modal
  modalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottom: '2px solid var(--glass-border)',
    paddingBottom: '16px',
    marginBottom: '20px',
  },
  modalHeaderUser: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatar: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: 'var(--primary-neon)',
    border: '2px solid var(--ink)',
    color: 'var(--text-inverse)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '17px',
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
  },
  modalSubtext: {
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  modalBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  detailTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'var(--font-display)',
  },
  emptyText: {
    color: 'var(--text-subtle)',
    fontSize: '13px',
    textAlign: 'center',
    padding: '10px 0',
  },
  projectsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  projectRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  projectKey: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--primary-neon)',
    background: 'var(--primary-soft)',
    padding: '2px 6px',
    borderRadius: 'var(--border-radius-sm)',
  },
  projectName: {
    flex: 1,
    fontSize: '13px',
    color: 'var(--text-main)',
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '220px',
    overflowY: 'auto',
  },
  activityRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  activityText: {
    fontSize: '13px',
    color: 'var(--text-main)',
  },
  activityTime: {
    fontSize: '11px',
    color: 'var(--text-subtle)',
    whiteSpace: 'nowrap',
  },
};
