import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

let idCounter = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    const id = ++idCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    timers.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timers.current[id];
    }, 4500);
  }, []);

  const value = {
    showToast,
    showSuccess: (message) => showToast(message, 'success'),
    showError: (message) => showToast(message, 'error'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div style={styles.container} className="no-print">
        {toasts.map(t => (
          <div
            key={t.id}
            style={{ ...styles.toast, ...(t.type === 'error' ? styles.toastError : styles.toastSuccess) }}
            className="animate-slide-up"
          >
            {t.type === 'error' ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
            <span style={styles.toastText}>{t.message}</span>
            <button style={styles.toastCloseBtn} onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};

const styles = {
  container: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    zIndex: 1000,
    maxWidth: '360px',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    borderRadius: 'var(--border-radius-sm)',
    border: '2px solid var(--glass-border)',
    boxShadow: 'var(--hard-shadow-sm)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-main)',
    fontSize: '13px',
    fontWeight: '600',
  },
  toastSuccess: {
    borderColor: 'var(--primary-neon)',
    color: 'var(--text-strong)',
  },
  toastError: {
    borderColor: 'var(--danger-border)',
    color: 'var(--danger-text)',
    background: 'var(--danger-bg)',
  },
  toastText: {
    flex: 1,
    lineHeight: '1.4',
  },
  toastCloseBtn: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    opacity: 0.7,
  },
};
