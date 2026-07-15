import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import { Shield, Check, X, AlertCircle, Users } from 'lucide-react';

export const AdminPanel = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { token, API_URL } = useAuth();

  useEffect(() => {
    fetchPendingUsers();
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
    try {
      const response = await fetch(`${API_URL}/api/admin/users/${userId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
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

  if (loading) return <div style={styles.loading}>Loading pending access requests...</div>;

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.header}>
        <Shield size={24} color="#6366f1" />
        <h2 style={styles.title}>Admin Settings</h2>
      </div>
      <p style={styles.subtitle}>Review and approve user requests to join the QA TestBoard workspace.</p>

      {error && (
        <div style={styles.errorAlert}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="glass-panel" style={styles.panel}>
        <div style={styles.panelHeader}>
          <Users size={18} color="#9ca3af" />
          <h3 style={styles.panelTitle}>Pending Access Requests ({pendingUsers.length})</h3>
        </div>

        {pendingUsers.length === 0 ? (
          <div style={styles.emptyState}>
            <Check size={36} color="#10b981" style={{ marginBottom: '8px' }} />
            <p style={{ color: '#9ca3af' }}>All clear! No pending access requests.</p>
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
    fontWeight: '600',
    fontFamily: "'Outfit', sans-serif",
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: '14px',
    marginBottom: '24px',
  },
  errorAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    padding: '12px',
    color: '#fca5a5',
    marginBottom: '20px',
  },
  panel: {
    padding: '24px',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    paddingBottom: '16px',
    marginBottom: '16px',
  },
  panelTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#f3f4f6',
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
    background: 'rgba(30, 41, 59, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: '8px',
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
    background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '16px',
  },
  name: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#f3f4f6',
  },
  email: {
    fontSize: '13px',
    color: '#9ca3af',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
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
    color: '#9ca3af',
  }
};
