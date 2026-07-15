import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './utils/auth';
import { AuthPages } from './components/AuthPages';
import { ProjectTracker } from './components/ProjectTracker';
import { BugTracker } from './components/BugTracker';
import { ReportsDashboard } from './components/ReportsDashboard';
import { AdminPanel } from './components/AdminPanel';
import { 
  FolderKanban, Bug as BugIcon, FileText, Shield, 
  LogOut, Terminal, Menu, X, Moon, Sun
} from 'lucide-react';

const AppContent = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('projects');
  const [selectedProject, setSelectedProject] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('tb_theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('tb_theme', theme);
  }, [theme]);

  // If not logged in, render Auth pages (Login/Request Access)
  if (!user) {
    return <AuthPages />;
  }

  const navigateToBugsForProject = (project) => {
    setSelectedProject(project);
    setActiveTab('bugs');
  };

  const handleClearProjectFilter = () => {
    setSelectedProject(null);
  };

  const navItems = [
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'bugs', label: 'Bugs', icon: BugIcon },
    { id: 'reports', label: 'Reports', icon: FileText },
    ...(user.role === 'Admin' ? [{ id: 'admin', label: 'Admin', icon: Shield }] : []),
  ];

  const toggleTheme = () => {
    setTheme(current => current === 'dark' ? 'light' : 'dark');
  };

  return (
    <div style={styles.layout} className={sidebarOpen ? 'nav-open' : ''}>
      {sidebarOpen && <div className="nav-scrim no-print" onClick={() => setSidebarOpen(false)} />}
      {/* Sidebar - Desktop & Tablet (Hidden when printing via no-print class) */}
      <aside 
        style={styles.sidebar}
        className={`glass-panel no-print ${sidebarOpen ? 'sidebar-open' : ''}`}
      >
        <div style={styles.sidebarHeader}>
          <div style={styles.logoSec}>
            <Terminal size={24} color="var(--primary-neon)" />
            <h1 style={styles.logoText}>TestBoard</h1>
          </div>
          <button style={styles.mobileCloseBtn} onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav style={styles.nav}>
          {navItems.map(item => {
            const Icon = item.icon;
            const selected = activeTab === item.id;
            return (
            <button 
              key={item.id}
              style={{
                ...styles.navItem,
                background: selected ? 'var(--primary-soft)' : 'transparent',
                borderColor: selected ? 'var(--primary-border)' : 'transparent',
                color: selected ? 'var(--text-strong)' : 'var(--text-muted)',
              }}
              onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
            >
              <Icon size={18} />
              {item.label}
            </button>
            );
          })}
        </nav>

        {/* User profile section at the bottom of the sidebar */}
        <div style={styles.sidebarFooter}>
          <button style={styles.themeBtn} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <div style={styles.userSection}>
            <div style={styles.avatar}>{user.full_name[0].toUpperCase()}</div>
            <div style={styles.userDetails}>
              <h3 style={styles.userName}>{user.full_name}</h3>
              <span style={styles.userRole}>
                {user.role === 'Admin' ? 'Administrator' : 'QA Member'}
              </span>
            </div>
          </div>
          <button style={styles.logoutBtn} onClick={logout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div style={styles.mainContainer}>
        {/* Top Navbar for Mobile/Tablet */}
        <header style={styles.mobileHeader} className="no-print">
          <button style={styles.menuBtn} onClick={() => setSidebarOpen(true)}>
            <Menu size={22} color="var(--text-main)" />
          </button>
          <div style={styles.mobileLogo}>
            <Terminal size={20} color="var(--primary-neon)" />
            <h1 style={{ ...styles.logoText, fontSize: '18px' }}>TestBoard</h1>
          </div>
          <button style={styles.iconBtn} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>

        {/* Main Section */}
        <main style={styles.content}>
          {activeTab === 'projects' && (
            <ProjectTracker onSelectProject={navigateToBugsForProject} />
          )}
          {activeTab === 'bugs' && (
            <BugTracker 
              selectedProject={selectedProject} 
              onClearProjectFilter={handleClearProjectFilter}
            />
          )}
          {activeTab === 'reports' && (
            <ReportsDashboard />
          )}
          {activeTab === 'admin' && user.role === 'Admin' && (
            <AdminPanel />
          )}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

const styles = {
  layout: {
    display: 'flex',
    minHeight: '100vh',
    position: 'relative',
    overflow: 'hidden',
  },
  sidebar: {
    width: '260px',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    bottom: 0,
    zIndex: 100,
    borderRadius: '0',
    borderRight: '1px solid rgba(255, 255, 255, 0.05)',
    borderLeft: 'none',
    borderTop: 'none',
    borderBottom: 'none',
    padding: '24px 16px',
    transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    '@media (max-width: 768px)': {
      left: '-260px',
    }
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '32px',
  },
  logoSec: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoText: {
    fontSize: '20px',
    fontWeight: '700',
    fontFamily: "'Outfit', sans-serif",
    background: 'linear-gradient(135deg, #f3f4f6 0%, #cbd5e1 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  mobileCloseBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    display: 'none', // Shown in CSS media queries on mobile
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    border: '1px solid transparent',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  },
  sidebarFooter: {
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    paddingTop: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '15px',
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#f3f4f6',
  },
  userRole: {
    fontSize: '11px',
    color: '#9ca3af',
  },
  logoutBtn: {
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '8px',
    color: '#fca5a5',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background 0.2s',
    '&:hover': {
      background: 'rgba(239, 68, 68, 0.1)',
    }
  },
  mainContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    marginLeft: '260px', // Matches sidebar width
    minWidth: 0,
    '@media (max-width: 768px)': {
      marginLeft: '0',
    }
  },
  mobileHeader: {
    display: 'none', // Shown in CSS media queries on mobile
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    background: '#080b11',
  },
  menuBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  mobileLogo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  content: {
    padding: '32px 40px',
    flex: 1,
    overflowY: 'auto',
    maxWidth: '1280px',
    width: '100%',
    margin: '0 auto',
    '@media (max-width: 768px)': {
      padding: '20px',
    }
  }
};

// Injection of responsive CSS for sidebar to override absolute inline styles on mobile sizes
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = `
    @media (max-width: 768px) {
      aside {
        left: -260px !important;
      }
      aside.sidebar-open {
        left: 0 !important;
      }
      header {
        display: flex !important;
      }
      main {
        margin-left: 0 !important;
        padding: 20px !important;
      }
      .mobile-close-btn-style {
        display: block !important;
      }
      #root > div > div {
        margin-left: 0 !important;
      }
    }
    @media print {
      aside {
        display: none !important;
      }
      #root > div > div {
        margin-left: 0 !important;
      }
      main {
        padding: 0 !important;
      }
    }
  `;
  document.head.appendChild(style);
}
