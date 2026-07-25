import React, { useState } from 'react';
import { useAuth } from '../utils/auth';
import { Lock, Terminal, CheckCircle, AlertCircle } from 'lucide-react';

const getTokenFromHash = () => {
  const hash = window.location.hash; // "#accept-invite?token=xyz"
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return params.get('token');
};

export const AcceptInvitePage = () => {
  const { API_URL } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const token = getTokenFromHash();

  const backToLogin = () => {
    window.location.hash = '';
    window.location.reload();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_URL}/api/auth/accept-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not set your password.');
      setResult(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.shapeSquare} />
      <div style={styles.shapeCircle} />

      <div className="glass-panel" style={styles.card}>
        <div style={styles.logoSection}>
          <div style={styles.logoMark}>
            <Terminal size={20} color="var(--ink)" />
          </div>
          <h1 style={styles.title}>TestBoard</h1>
        </div>
        <p style={styles.subtitle}>QA Project Tracker & Status Reporting</p>

        {!token ? (
          <div style={styles.pendingContainer} className="animate-slide-up">
            <AlertCircle size={48} color="var(--danger-border)" style={{ marginBottom: '16px' }} />
            <h2 style={styles.pendingTitle}>Invalid Invite Link</h2>
            <p style={styles.pendingText}>This link is missing its invite token. Please use the link from your invite email.</p>
            <button className="btn-primary" style={{ width: '100%', padding: '12px' }} onClick={backToLogin}>
              Back to Login
            </button>
          </div>
        ) : result ? (
          <div style={styles.pendingContainer} className="animate-slide-up">
            <CheckCircle size={48} color="var(--primary-neon)" style={{ marginBottom: '16px' }} />
            <h2 style={styles.pendingTitle}>Password Set</h2>
            <p style={styles.pendingText}>{result}</p>
            <button className="btn-primary" style={{ width: '100%', padding: '12px' }} onClick={backToLogin}>
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form} className="animate-fade-in">
            <h2 style={styles.formTitle}>Set Your Password</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '-12px' }}>
              You've been invited to TestBoard. Choose a password to finish setting up your account.
            </p>

            {error && <div style={styles.errorAlert}>{error}</div>}

            <div style={styles.inputGroup}>
              <label style={styles.label}>New Password</label>
              <div style={styles.inputWrapper}>
                <Lock size={18} style={styles.inputIcon} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Confirm Password</label>
              <div style={styles.inputWrapper}>
                <Lock size={18} style={styles.inputIcon} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={styles.input}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={submitting} style={styles.submitBtn}>
              {submitting ? 'Submitting...' : 'Set Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    background: 'var(--bg-primary)',
    padding: '20px',
    overflow: 'hidden',
  },
  shapeSquare: {
    position: 'absolute',
    width: '220px',
    height: '220px',
    background: 'var(--primary-neon)',
    border: '2px solid var(--ink)',
    top: '-60px',
    left: '-60px',
    transform: 'rotate(12deg)',
    pointerEvents: 'none',
    zIndex: 1,
    opacity: 0.9,
  },
  shapeCircle: {
    position: 'absolute',
    width: '260px',
    height: '260px',
    borderRadius: '50%',
    background: 'var(--accent-mustard)',
    bottom: '-90px',
    right: '-90px',
    pointerEvents: 'none',
    zIndex: 1,
    opacity: 0.85,
  },
  card: {
    width: '100%',
    maxWidth: '440px',
    padding: '40px',
    zIndex: 2,
    position: 'relative',
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  logoMark: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--primary-neon)',
    border: '2px solid var(--ink)',
    borderRadius: 'var(--border-radius-sm)',
    flexShrink: 0,
  },
  title: {
    fontFamily: 'var(--font-display)',
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--text-strong)',
  },
  subtitle: {
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '14px',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    marginBottom: '8px',
    fontFamily: 'var(--font-display)',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-muted)',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '12px',
    color: 'var(--text-subtle)',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '12px 12px 12px 40px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  errorAlert: {
    background: 'var(--danger-bg)',
    border: '2px solid var(--danger-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '12px',
    color: 'var(--danger-text)',
    fontSize: '14px',
    lineHeight: '1.4',
  },
  submitBtn: {
    width: '100%',
    padding: '12px',
    fontSize: '16px',
    marginTop: '10px',
  },
  pendingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '10px 0',
  },
  pendingTitle: {
    fontSize: '20px',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-strong)',
    marginBottom: '8px',
  },
  pendingText: {
    color: 'var(--text-muted)',
    fontSize: '14px',
    lineHeight: '1.6',
    marginBottom: '24px',
  }
};
