import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './utils/auth';
import { AuthPages } from './components/AuthPages';
import { ProjectTracker } from './components/ProjectTracker';
import { BugTracker } from './components/BugTracker';
import { ReportsDashboard } from './components/ReportsDashboard';
import { AdminPanel } from './components/AdminPanel';
import {
  FolderKanban, Bug as BugIcon, FileText, Shield,
  LogOut, Terminal, Menu, X, Moon, Sun, ChevronLeft, ChevronRight
} from 'lucide-react';

const AppContent = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('projects');
  const [selectedProject, setSelectedProject] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('tb_sidebar_collapsed') === 'true');
  const [theme, setTheme] = useState(() => localStorage.getItem('tb_theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('tb_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('tb_sidebar_collapsed', collapsed);
  }, [collapsed]);

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
        style={{ ...styles.sidebar, width: collapsed ? '76px' : '260px' }}
        className={`glass-panel no-print ${sidebarOpen ? 'sidebar-open' : ''}`}
      >
        <div style={styles.sidebarHeader}>
          <div style={styles.logoSec}>
            <div style={styles.logoMark}>
              <Terminal size={18} color="var(--ink)" />
            </div>
            {!collapsed && <h1 style={styles.logoText}>TestBoard</h1>}
          </div>
          <button
            style={styles.collapseBtn}
            className="collapse-toggle-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
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
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: selected ? 'var(--primary-soft)' : 'transparent',
                borderColor: selected ? 'var(--primary-border)' : 'transparent',
                color: selected ? 'var(--text-strong)' : 'var(--text-muted)',
              }}
              onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} />
              {!collapsed && item.label}
            </button>
            );
          })}
        </nav>

        {/* User profile section at the bottom of the sidebar */}
        <div style={styles.sidebarFooter}>
          <button style={styles.themeBtn} onClick={toggleTheme} title={collapsed ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {!collapsed && (theme === 'dark' ? 'Light mode' : 'Dark mode')}
          </button>
          <div style={{ ...styles.userSection, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <div style={styles.avatar}>{user.full_name[0].toUpperCase()}</div>
            {!collapsed && (
              <div style={styles.userDetails}>
                <h3 style={styles.userName}>{user.full_name}</h3>
                <span style={styles.userRole}>{user.role}</span>
              </div>
            )}
          </div>
          <button style={styles.logoutBtn} onClick={logout} title={collapsed ? 'Logout' : undefined}>
            <LogOut size={16} /> {!collapsed && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div style={{ ...styles.mainContainer, marginLeft: collapsed ? '76px' : '260px' }} className="main-container-desktop">
        {/* Top Navbar for Mobile/Tablet */}
        <header style={styles.mobileHeader} className="no-print">
          <button style={styles.menuBtn} onClick={() => setSidebarOpen(true)}>
            <Menu size={22} color="var(--text-main)" />
          </button>
          <div style={styles.mobileLogo}>
            <div style={{ ...styles.logoMark, width: '26px', height: '26px' }}>
              <Terminal size={15} color="var(--ink)" />
            </div>
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
    background: 'var(--sidebar-bg)',
    borderRight: '2px solid var(--sidebar-border)',
    borderLeft: 'none',
    borderTop: 'none',
    borderBottom: 'none',
    padding: '24px 16px',
    overflowX: 'hidden',
    transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.25s ease',
    '@media (max-width: 768px)': {
      left: '-260px',
    }
  },
  sidebarHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '32px',
    gap: '8px',
  },
  collapseBtn: {
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    width: '26px',
    height: '26px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  logoSec: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoMark: {
    width: '32px',
    height: '32px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--primary-neon)',
    border: '2px solid var(--ink)',
    borderRadius: 'var(--border-radius-sm)',
  },
  logoText: {
    fontSize: '20px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-strong)',
    letterSpacing: '-0.01em',
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
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s ease',
  },
  sidebarFooter: {
    borderTop: '2px solid var(--sidebar-border)',
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
    background: 'var(--primary-neon)',
    border: '2px solid var(--ink)',
    color: 'var(--text-inverse)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '15px',
    fontFamily: 'var(--font-display)',
    flexShrink: 0,
  },
  userDetails: {
    display: 'flex',
    flexDirection: 'column',
  },
  userName: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-strong)',
  },
  userRole: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  logoutBtn: {
    background: 'transparent',
    border: '2px solid var(--danger-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--danger-text)',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background 0.2s',
  },
  mainContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    marginLeft: '260px', // Matches sidebar width; overridden inline when collapsed
    minWidth: 0,
    transition: 'margin-left 0.25s ease',
    '@media (max-width: 768px)': {
      marginLeft: '0',
    }
  },
  mobileHeader: {
    display: 'none', // Shown in CSS media queries on mobile
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '2px solid var(--sidebar-border)',
    background: 'var(--topbar-bg)',
  },
  menuBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  iconBtn: {
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    padding: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  themeBtn: {
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    padding: '10px 12px',
    fontSize: '13px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
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
    .collapse-toggle-btn {
      display: flex;
    }
    @media (max-width: 768px) {
      aside {
        left: -260px !important;
        width: 260px !important;
      }
      aside.sidebar-open {
        left: 0 !important;
      }
      .collapse-toggle-btn {
        display: none !important;
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
