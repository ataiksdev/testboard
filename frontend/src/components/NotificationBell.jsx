import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../utils/auth';
import { Bell, Check } from 'lucide-react';

export const NotificationBell = ({ collapsed, variant = 'sidebar' }) => {
  const { token, API_URL } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const authHeaders = { 'Authorization': `Bearer ${token}` };

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/unread-count`, { headers: authHeaders });
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/notifications`, { headers: authHeaders });
      if (response.ok) {
        setNotifications(await response.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) fetchNotifications();
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      try {
        const response = await fetch(`${API_URL}/api/notifications/${notification.id}/read`, {
          method: 'POST',
          headers: authHeaders
        });
        if (response.ok) {
          setNotifications(list => list.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
          setUnreadCount(c => Math.max(0, c - 1));
        }
      } catch (err) {
        console.error(err);
      }
    }
    if (notification.link) {
      window.location.hash = notification.link.replace('#', '');
    }
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'POST',
        headers: authHeaders
      });
      if (response.ok) {
        setNotifications(list => list.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const isCompact = variant === 'compact';

  return (
    <div style={styles.wrap} ref={panelRef}>
      <button
        style={isCompact
          ? styles.compactBtn
          : { ...styles.bellBtn, justifyContent: collapsed ? 'center' : 'flex-start' }}
        onClick={handleToggle}
        title="Notifications"
      >
        <span style={styles.bellIconWrap}>
          <Bell size={isCompact ? 18 : 16} />
          {unreadCount > 0 && (
            <span style={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </span>
        {!isCompact && !collapsed && <span>Notifications</span>}
      </button>

      {open && (
        <div
          style={{ ...styles.panel, ...(isCompact ? styles.panelBelow : styles.panelAbove) }}
          className="glass-panel"
        >
          <div style={styles.panelHeader}>
            <h4 style={styles.panelTitle}>Notifications</h4>
            {unreadCount > 0 && (
              <button style={styles.markAllBtn} onClick={handleMarkAllRead}>
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          <div style={styles.panelList}>
            {loading ? (
              <p style={styles.emptyText}>Loading...</p>
            ) : notifications.length === 0 ? (
              <p style={styles.emptyText}>No notifications yet.</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  style={{ ...styles.notifRow, background: n.is_read ? 'transparent' : 'var(--surface-hover)' }}
                  onClick={() => handleNotificationClick(n)}
                >
                  {!n.is_read && <span style={styles.unreadDot} />}
                  <div style={styles.notifBody}>
                    <span style={styles.notifTitle}>{n.title}</span>
                    {n.body && <span style={styles.notifText}>{n.body}</span>}
                    <span style={styles.notifTime}>
                      {new Date(n.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  wrap: {
    position: 'relative',
  },
  bellBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    background: 'var(--bg-tertiary)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    padding: '10px 12px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  compactBtn: {
    background: 'var(--bg-tertiary)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  bellIconWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  badge: {
    position: 'absolute',
    top: '-8px',
    right: '-10px',
    background: 'var(--accent-rust)',
    color: '#f2eee2',
    border: '2px solid var(--ink)',
    borderRadius: '999px',
    fontSize: '9px',
    fontWeight: '700',
    lineHeight: 1,
    padding: '2px 4px',
    minWidth: '14px',
    textAlign: 'center',
  },
  panel: {
    position: 'absolute',
    width: '320px',
    maxWidth: '90vw',
    maxHeight: '400px',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 200,
    padding: '0',
    overflow: 'hidden',
  },
  panelAbove: {
    bottom: 'calc(100% + 8px)',
    left: 0,
  },
  panelBelow: {
    top: 'calc(100% + 8px)',
    right: 0,
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: '2px solid var(--glass-border)',
    flexShrink: 0,
  },
  panelTitle: {
    fontSize: '13px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-strong)',
  },
  markAllBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'none',
    border: 'none',
    color: 'var(--primary-neon)',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  panelList: {
    overflowY: 'auto',
    flex: 1,
  },
  emptyText: {
    color: 'var(--text-subtle)',
    fontSize: '13px',
    textAlign: 'center',
    padding: '24px 12px',
  },
  notifRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: '1px solid var(--glass-border)',
    cursor: 'pointer',
  },
  unreadDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--primary-neon)',
    marginTop: '5px',
    flexShrink: 0,
  },
  notifBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  notifTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  notifText: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  notifTime: {
    fontSize: '11px',
    color: 'var(--text-subtle)',
    marginTop: '2px',
  },
};
