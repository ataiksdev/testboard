import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import { Shield, Check, X, AlertCircle, Users as UsersIcon, UserCog, KeyRound } from 'lucide-react';
import { ROLES } from '../utils/roles';
import { UserManagement } from './UserManagement';

export const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('pending');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [approvalRoles, setApprovalRoles] = useState({});
  const [pendingResets, setPendingResets] = useState([]);
  const [resetInputs, setResetInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { token, API_URL } = useAuth();

  useEffect(() => {
    fetchPendingUsers();
    fetchPendingResets();
  }, []);

  const fetchPendingUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/admin/users/pending`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to fetch pending users");
      const data = await response.json();
      setPendingUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    const role = approvalRoles[userId] || 'QA';
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role })
      });
      if (response.ok) {
        setPendingUsers(pendingUsers.filter(u => u.id !== userId));
      } else {
        const data = await response.json();
        throw new Error(data.detail || "Approval failed");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReject = async (userId) => {
    if (!confirm("Are you sure you want to decline and delete this access request?")) return;
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        setPendingUsers(pendingUsers.filter(u => u.id !== userId));
      } else {
        const data = await response.json();
        throw new Error(data.detail || "Rejection failed");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const fetchPendingResets = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/password-resets/pending`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error("Failed to fetch password reset requests");
      const data = await response.json();
      setPendingResets(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResolveReset = async (requestId) => {
    const newPassword = resetInputs[requestId] || '';
    if (newPassword.length < 8) {
      alert("New password must be at least 8 characters");
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/admin/password-resets/${requestId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ new_password: newPassword })
      });
      if (response.ok) {
        setPendingResets(pendingResets.filter(r => r.id !== requestId));
        setResetInputs(inputs => {
          const { [requestId]: _removed, ...rest } = inputs;
          return rest;
        });
      } else {
        const data = await response.json();
        throw new Error(data.detail || "Failed to reset password");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDismissReset = async (requestId) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/password-resets/${requestId}/dismiss`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        setPendingResets(pendingResets.filter(r => r.id !== requestId));
      } else {
        const data = await response.json();
        throw new Error(data.detail || "Failed to dismiss request");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.header}>
        <Shield size={24} color="var(--primary-neon)" />
        <h2 style={styles.title}>Admin Settings</h2>
      </div>
      <p style={styles.subtitle}>Review access requests and manage roles for the QA TestBoard workspace.</p>

      {error && (
        <div style={styles.errorAlert}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div style={styles.tabRow}>
        <button
          style={{ ...styles.tabBtn, ...(activeTab === 'pending' ? styles.tabBtnActive : {}) }}
          onClick={() => setActiveTab('pending')}
        >
          <UsersIcon size={15} /> Pending Requests {pendingUsers.length > 0 && `(${pendingUsers.length})`}
        </button>
        <button
          style={{ ...styles.tabBtn, ...(activeTab === 'resets' ? styles.tabBtnActive : {}) }}
          onClick={() => setActiveTab('resets')}
        >
          <KeyRound size={15} /> Password Resets {pendingResets.length > 0 && `(${pendingResets.length})`}
        </button>
        <button
          style={{ ...styles.tabBtn, ...(activeTab === 'users' ? styles.tabBtnActive : {}) }}
          onClick={() => setActiveTab('users')}
        >
          <UserCog size={15} /> All Users
        </button>
      </div>

      {activeTab === 'pending' && (
        loading ? (
          <div style={styles.loading}>Loading pending access requests...</div>
        ) : (
          <div className="glass-panel" style={styles.panel}>
            <div style={styles.panelHeader}>
              <UsersIcon size={18} color="var(--text-muted)" />
              <h3 style={styles.panelTitle}>Pending Access Requests ({pendingUsers.length})</h3>
            </div>

            {pendingUsers.length === 0 ? (
              <div style={styles.emptyState}>
                <Check size={36} color="var(--primary-neon)" style={{ marginBottom: '8px' }} />
                <p style={{ color: 'var(--text-muted)' }}>All clear! No pending access requests.</p>
              </div>
            ) : (
              <div style={styles.list}>
                {pendingUsers.map(user => (
                  <div key={user.id} style={styles.userRow} className="animate-slide-up">
                    <div style={styles.userInfo}>
                      <div style={styles.avatar}>{user.full_name[0].toUpperCase()}</div>
                      <div>
                        <h4 style={styles.name}>{user.full_name}</h4>
                        <span style={styles.email}>{user.email}</span>
                      </div>
                    </div>
                    <div style={styles.actions}>
                      <select
                        value={approvalRoles[user.id] || 'QA'}
                        onChange={(e) => setApprovalRoles(r => ({ ...r, [user.id]: e.target.value }))}
                        style={styles.roleSelect}
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button
                        onClick={() => handleApprove(user.id)}
                        className="btn-primary"
                        style={styles.approveBtn}
                      >
                        <Check size={16} />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(user.id)}
                        className="btn-danger"
                        style={styles.rejectBtn}
                      >
                        <X size={16} />
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {activeTab === 'resets' && (
        <div className="glass-panel" style={styles.panel}>
          <div style={styles.panelHeader}>
            <KeyRound size={18} color="var(--text-muted)" />
            <h3 style={styles.panelTitle}>Password Reset Requests ({pendingResets.length})</h3>
          </div>

          {pendingResets.length === 0 ? (
            <div style={styles.emptyState}>
              <Check size={36} color="var(--primary-neon)" style={{ marginBottom: '8px' }} />
              <p style={{ color: 'var(--text-muted)' }}>No pending password reset requests.</p>
            </div>
          ) : (
            <div style={styles.list}>
              {pendingResets.map(reset => (
                <div key={reset.id} style={styles.userRow} className="animate-slide-up">
                  <div style={styles.userInfo}>
                    <div style={styles.avatar}>{reset.user.full_name[0].toUpperCase()}</div>
                    <div>
                      <h4 style={styles.name}>{reset.user.full_name}</h4>
                      <span style={styles.email}>{reset.user.email}</span>
                    </div>
                  </div>
                  <div style={styles.actions}>
                    <input
                      type="text"
                      placeholder="New password (min 8 chars)"
                      value={resetInputs[reset.id] || ''}
                      onChange={(e) => setResetInputs(inputs => ({ ...inputs, [reset.id]: e.target.value }))}
                      style={styles.roleSelect}
                    />
                    <button
                      onClick={() => handleResolveReset(reset.id)}
                      className="btn-primary"
                      style={styles.approveBtn}
                    >
                      <Check size={16} />
                      Set Password
                    </button>
                    <button
                      onClick={() => handleDismissReset(reset.id)}
                      className="btn-danger"
                      style={styles.rejectBtn}
                    >
                      <X size={16} />
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'users' && <UserManagement />}
    </div>
  );
};

const styles = {
  container: {
    padding: '10px 0',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-strong)',
  },
  subtitle: {
    color: 'var(--text-muted)',
    fontSize: '14px',
    marginBottom: '24px',
  },
  errorAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--danger-bg)',
    border: '2px solid var(--danger-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '12px',
    color: 'var(--danger-text)',
    marginBottom: '20px',
  },
  tabRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '20px',
    borderBottom: '2px solid var(--glass-border)',
    paddingBottom: '12px',
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'transparent',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  tabBtnActive: {
    background: 'var(--primary-soft)',
    borderColor: 'var(--primary-border)',
    color: 'var(--text-strong)',
  },
  panel: {
    padding: '24px',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: '2px solid var(--glass-border)',
    paddingBottom: '16px',
    marginBottom: '16px',
  },
  panelTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 0',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    flexWrap: 'wrap',
    gap: '16px',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'var(--primary-neon)',
    border: '2px solid var(--ink)',
    color: 'var(--text-inverse)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '16px',
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
  },
  name: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-strong)',
  },
  email: {
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  roleSelect: {
    padding: '8px 10px',
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    fontSize: '13px',
    fontWeight: '600',
    outline: 'none',
  },
  approveBtn: {
    padding: '8px 14px',
    fontSize: '13px',
  },
  rejectBtn: {
    padding: '8px 14px',
    fontSize: '13px',
  },
  loading: {
    textAlign: 'center',
    padding: '50px 0',
    color: 'var(--text-muted)',
  }
};
