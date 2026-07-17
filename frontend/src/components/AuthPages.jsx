import React, { useState } from 'react';
import { useAuth } from '../utils/auth';
import { Mail, Lock, User, Terminal, CheckCircle } from 'lucide-react';

export const AuthPages = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [accessPending, setAccessPending] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const { login, register, requestPasswordReset, error, isLoading } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLogin) {
      const success = await login(email, password);
      if (!success && error && error.includes('pending Admin approval')) {
        setAccessPending(true);
      }
    } else {
      const success = await register(email, password, fullName);
      if (success) {
        setRegSuccess(true);
        setAccessPending(true);
      }
    }
  };

  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    setAccessPending(false);
    setRegSuccess(false);
  };

  const openForgotPassword = () => {
    setResetEmail(email);
    setResetMessage(null);
    setShowForgotPassword(true);
  };

  const closeForgotPassword = () => {
    setShowForgotPassword(false);
    setResetMessage(null);
    setResetEmail('');
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setResetSubmitting(true);
    const result = await requestPasswordReset(resetEmail);
    setResetMessage(result.message || (result.success
      ? "If an account exists for this email, an admin has been notified and will be in touch to reset your password."
      : "Something went wrong. Please try again."));
    setResetSubmitting(false);
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

        {showForgotPassword ? (
          resetMessage ? (
            <div style={styles.pendingContainer} className="animate-slide-up">
              <CheckCircle size={48} color="var(--primary-neon)" style={{ marginBottom: '16px' }} />
              <h2 style={styles.pendingTitle}>Request Submitted</h2>
              <p style={styles.pendingText}>{resetMessage}</p>
              <button
                className="btn-primary"
                style={{ width: '100%', padding: '12px' }}
                onClick={closeForgotPassword}
              >
                Back to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPasswordSubmit} style={styles.form} className="animate-fade-in">
              <h2 style={styles.formTitle}>Reset Password</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '-12px' }}>
                Enter your account email. An administrator will be notified to reset your password for you.
              </p>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Email Address</label>
                <div style={styles.inputWrapper}>
                  <Mail size={18} style={styles.inputIcon} />
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    style={styles.input}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={resetSubmitting}
                style={styles.submitBtn}
              >
                {resetSubmitting ? "Submitting..." : "Notify Admin"}
              </button>

              <div style={styles.switchMode}>
                <button
                  type="button"
                  onClick={closeForgotPassword}
                  style={styles.switchBtn}
                >
                  Back to Login
                </button>
              </div>
            </form>
          )
        ) : accessPending ? (
          <div style={styles.pendingContainer} className="animate-slide-up">
            <CheckCircle size={48} color="var(--primary-neon)" style={{ marginBottom: '16px' }} />
            <h2 style={styles.pendingTitle}>
              {regSuccess ? "Access Request Submitted" : "Access Request Pending"}
            </h2>
            <p style={styles.pendingText}>
              Your account <strong>{email}</strong> has been registered. An administrator must approve your access request before you can log in.
            </p>
            <button 
              className="btn-primary" 
              style={{ width: '100%', padding: '12px' }}
              onClick={() => {
                setAccessPending(false);
                setRegSuccess(false);
                setIsLogin(true);
              }}
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form} className="animate-fade-in">
            <h2 style={styles.formTitle}>{isLogin ? "Sign In" : "Request Access"}</h2>
            
            {error && <div style={styles.errorAlert}>{error}</div>}

            {!isLogin && (
              <div style={styles.inputGroup}>
                <label style={styles.label}>Full Name</label>
                <div style={styles.inputWrapper}>
                  <User size={18} style={styles.inputIcon} />
                  <input 
                    type="text" 
                    placeholder="Jane Doe" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required 
                    style={styles.input}
                  />
                </div>
              </div>
            )}

            <div style={styles.inputGroup}>
              <label style={styles.label}>Email Address</label>
              <div style={styles.inputWrapper}>
                <Mail size={18} style={styles.inputIcon} />
                <input 
                  type="email" 
                  placeholder="name@company.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Password</label>
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
              {isLogin && (
                <button
                  type="button"
                  onClick={openForgotPassword}
                  style={styles.forgotPasswordBtn}
                >
                  Forgot password?
                </button>
              )}
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading}
              style={styles.submitBtn}
            >
              {isLoading ? "Processing..." : isLogin ? "Sign In" : "Submit Access Request"}
            </button>

            <div style={styles.switchMode}>
              <span style={{ color: '#9ca3af', fontSize: '14px' }}>
                {isLogin ? "Need access to the board?" : "Already have an account?"}
              </span>
              <button 
                type="button" 
                onClick={toggleAuthMode}
                style={styles.switchBtn}
              >
                {isLogin ? "Request Access" : "Sign In"}
              </button>
            </div>
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
  forgotPasswordBtn: {
    alignSelf: 'flex-end',
    background: 'none',
    border: 'none',
    color: 'var(--primary-neon)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'underline',
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
  switchMode: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '6px',
    marginTop: '15px',
  },
  switchBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--primary-neon)',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    textDecoration: 'underline',
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
