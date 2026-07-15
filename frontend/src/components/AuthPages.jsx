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
  const { login, register, error, isLoading } = useAuth();

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

  return (
    <div style={styles.container}>
      <div style={styles.radialGlow} />
      
      <div className="glass-panel" style={styles.card}>
        <div style={styles.logoSection}>
          <Terminal size={32} color="#6366f1" style={{ marginRight: '8px' }} />
          <h1 style={styles.title}>TestBoard</h1>
        </div>
        <p style={styles.subtitle}>QA Project Tracker & Status Reporting</p>

        {accessPending ? (
          <div style={styles.pendingContainer} className="animate-slide-up">
            <CheckCircle size={48} color="#10b981" style={{ marginBottom: '16px' }} />
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
            </div>

            <button 
              type="submit" 
              className="btn-primary animate-pulse-glow" 
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
    background: '#080b11',
    padding: '20px',
  },
  radialGlow: {
    position: 'absolute',
    width: '600px',
    height: '600px',
    background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(6,182,212,0.05) 50%, rgba(0,0,0,0) 100%)',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    zIndex: 1,
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
    marginBottom: '8px',
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '28px',
    fontWeight: '700',
    background: 'linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    textAlign: 'center',
    color: '#9ca3af',
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
    fontWeight: '600',
    color: '#f3f4f6',
    marginBottom: '8px',
    fontFamily: "'Outfit', sans-serif",
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#9ca3af',
  },
  inputWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  inputIcon: {
    position: 'absolute',
    left: '12px',
    color: '#6b7280',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    padding: '12px 12px 12px 40px',
    background: 'rgba(30, 41, 59, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    color: '#f3f4f6',
    fontSize: '15px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  errorAlert: {
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    padding: '12px',
    color: '#fca5a5',
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
    color: '#818cf8',
    fontSize: '14px',
    fontWeight: '600',
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
    color: '#f3f4f6',
    marginBottom: '8px',
  },
  pendingText: {
    color: '#9ca3af',
    fontSize: '14px',
    lineHeight: '1.6',
    marginBottom: '24px',
  }
};
