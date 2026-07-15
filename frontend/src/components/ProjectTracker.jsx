import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import { 
  FolderKanban, Plus, MessageSquare, Clock, User as UserIcon, 
  ArrowRight, FileText, CheckCircle2, ChevronRight, X
} from 'lucide-react';

const PROJECT_STATUSES = ["Intake", "Reviewing", "Testing", "Blocked", "Completed", "Archived"];

export const ProjectTracker = ({ onSelectProject }) => {
  const [projects, setProjects] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [projectComments, setProjectComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  
  // Form fields
  const [projName, setProjName] = useState('');
  const [projKey, setProjKey] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projStatus, setProjStatus] = useState('Intake');
  const [projLead, setProjLead] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('new');
  const [versionName, setVersionName] = useState('');

  const { token, API_URL, user } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [projRes, bugRes, userRes] = await Promise.all([
        fetch(`${API_URL}/api/projects`, { headers }),
        fetch(`${API_URL}/api/bugs`, { headers }),
        fetch(`${API_URL}/api/users`, { headers })
      ]);

      if (!projRes.ok || !bugRes.ok || !userRes.ok) throw new Error("Failed to load tracker data");

      const [projData, bugData, userData] = await Promise.all([
        projRes.json(),
        bugRes.json(),
        userRes.json()
      ]);

      setProjects(projData);
      setBugs(bugData);
      setUsers(userData);
      
      if (userData.length > 0) {
        setProjLead(userData[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetProjectForm = () => {
    setSelectedProjectId('new');
    setProjName('');
    setProjKey('');
    setProjDesc('');
    setProjStatus('Intake');
    setVersionName('');
    if (users.length > 0) {
      setProjLead(users[0].id);
    }
  };

  const createProjectVersion = async (projectId) => {
    const response = await fetch(`${API_URL}/api/projects/${projectId}/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        version_name: versionName.trim(),
        status: 'Planning'
      })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "Failed to add project version");
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      if (!versionName.trim()) {
        throw new Error("Version number is required");
      }

      let projectId = selectedProjectId;

      if (selectedProjectId === 'new') {
        const response = await fetch(`${API_URL}/api/projects`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: projName,
            key: projKey.toUpperCase(),
            description: projDesc,
            status: projStatus,
            lead_id: parseInt(projLead)
          })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.detail || "Failed to create project");
        }

        const project = await response.json();
        projectId = project.id;
      }

      await createProjectVersion(projectId);

      setShowCreateModal(false);
      resetProjectForm();
      
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStatusChange = async (projectId, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) throw new Error("Failed to update status");
      
      // Update local state
      setProjects(projects.map(p => p.id === projectId ? { ...p, status: newStatus } : p));
      
      if (activeProject && activeProject.id === projectId) {
        setActiveProject({ ...activeProject, status: newStatus });
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenDetail = async (project) => {
    setActiveProject(project);
    setShowDetailModal(true);
    fetchProjectComments(project.id);
  };

  const fetchProjectComments = async (projectId) => {
    try {
      const response = await fetch(`${API_URL}/api/comments?project_id=${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProjectComments(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    try {
      const response = await fetch(`${API_URL}/api/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          project_id: activeProject.id,
          text: newCommentText
        })
      });

      if (response.ok) {
        setNewCommentText('');
        fetchProjectComments(activeProject.id);
      } else {
        throw new Error("Failed to post update comment");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Helper: get stats for a project
  const getProjectStats = (projectId) => {
    const projBugs = bugs.filter(b => b.project_id === projectId);
    const openBugs = projBugs.filter(b => b.status !== 'Resolved' && b.status !== 'Closed');
    const blockers = projBugs.filter(b => b.is_blocker && b.status !== 'Resolved' && b.status !== 'Closed');
    return {
      total: projBugs.length,
      open: openBugs.length,
      blockers: blockers.length
    };
  };

  if (loading) return <div style={styles.loading}>Loading projects status tracker...</div>;

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.header}>
        <div style={styles.headerTitleSec}>
          <FolderKanban size={24} color="#6366f1" />
          <h2 style={styles.title}>QA Project Tracker</h2>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> Add QA Project
        </button>
      </div>
      <p style={styles.subtitle}>Track high-level QA stages of all ongoing software projects.</p>

      {/* Board Layout */}
      <div style={styles.boardScrollContainer}>
        <div style={styles.board}>
          {PROJECT_STATUSES.map(status => {
            const statusProjects = projects.filter(p => p.status === status);
            return (
              <div key={status} style={styles.column} className="glass-panel">
                <div style={styles.columnHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ ...styles.columnDot, background: `var(--status-${status.toLowerCase()})` }} />
                    <h3 style={styles.columnTitle}>{status}</h3>
                  </div>
                  <span style={styles.columnCount}>{statusProjects.length}</span>
                </div>

                <div style={styles.columnContent}>
                  {statusProjects.map(project => {
                    const stats = getProjectStats(project.id);
                    return (
                      <div 
                        key={project.id} 
                        style={styles.card} 
                        onClick={() => handleOpenDetail(project)}
                        className="animate-slide-up"
                      >
                        <div style={styles.cardHeader}>
                          <span style={styles.cardKey}>{project.key}</span>
                          <span style={styles.cardLead}>
                            <UserIcon size={12} style={{ marginRight: '4px' }} />
                            {project.lead ? project.lead.full_name : 'Unassigned'}
                          </span>
                        </div>
                        <h4 style={styles.cardName}>{project.name}</h4>
                        <p style={styles.cardDesc}>
                          {project.description && project.description.length > 60 
                            ? project.description.slice(0, 60) + '...' 
                            : project.description || 'No description provided.'}
                        </p>
                        
                        <div style={styles.cardFooter}>
                          <div style={styles.cardStat}>
                            <span style={{ color: stats.open > 0 ? '#3b82f6' : '#9ca3af' }}>
                              Bugs: <strong>{stats.open}</strong>/{stats.total}
                            </span>
                          </div>
                          {stats.blockers > 0 && (
                            <span style={styles.blockerBadge} className="animate-blink-red">
                              {stats.blockers} Blocker{stats.blockers > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>

                        <div style={styles.quickActions} onClick={(e) => e.stopPropagation()}>
                          <button 
                            className="btn-secondary"
                            style={styles.quickGoBtn}
                            onClick={() => onSelectProject(project)}
                          >
                            Bugs Board <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {statusProjects.length === 0 && (
                    <div style={styles.emptyColumnText}>No projects in this stage</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CREATE PROJECT MODAL */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '500px' }}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Add New QA Project</h3>
              <button style={styles.closeBtn} onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateProject} style={styles.modalForm}>
              {projects.length > 0 && (
                <div style={styles.inputGroup}>
                  <label style={styles.modalLabel}>Project</label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    required
                    style={styles.modalSelect}
                  >
                    <option value="new">Create new project</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name} ({project.key})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={styles.inputGroup}>
                <label style={styles.modalLabel}>Version Number</label>
                <input
                  type="text"
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="e.g. v1.0, 2026.06, build 42"
                  required
                  style={styles.modalInput}
                />
              </div>

              {selectedProjectId === 'new' && (
                <>
                  <div style={styles.inputGroup}>
                    <label style={styles.modalLabel}>Project Name</label>
                    <input 
                      type="text" 
                      value={projName} 
                      onChange={(e) => setProjName(e.target.value)}
                      placeholder="e.g. Mobile E-commerce Redesign"
                      required
                      style={styles.modalInput}
                    />
                  </div>

                  <div style={styles.row}>
                    <div style={{ ...styles.inputGroup, flex: 1 }}>
                      <label style={styles.modalLabel}>Project Key (e.g. MOB)</label>
                      <input 
                        type="text" 
                        value={projKey} 
                        onChange={(e) => setProjKey(e.target.value)}
                        maxLength={5}
                        placeholder="e.g. SHOP"
                        required
                        style={styles.modalInput}
                      />
                    </div>
                    <div style={{ ...styles.inputGroup, flex: 1 }}>
                      <label style={styles.modalLabel}>Initial Status</label>
                      <select 
                        value={projStatus} 
                        onChange={(e) => setProjStatus(e.target.value)}
                        style={styles.modalSelect}
                      >
                        {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={styles.inputGroup}>
                    <label style={styles.modalLabel}>QA Lead</label>
                    <select 
                      value={projLead} 
                      onChange={(e) => setProjLead(e.target.value)}
                      style={styles.modalSelect}
                    >
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>

                  <div style={styles.inputGroup}>
                    <label style={styles.modalLabel}>Description</label>
                    <textarea 
                      value={projDesc} 
                      onChange={(e) => setProjDesc(e.target.value)}
                      placeholder="Project goals, QA scope, and testing pipelines..."
                      rows={4}
                      style={styles.modalTextarea}
                    />
                  </div>
                </>
              )}

              {selectedProjectId !== 'new' && (
                <div style={styles.existingProjectNote}>
                  A new version will be added to the selected project.
                </div>
              )}

              <div style={styles.modalActions}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)} style={{ padding: '10px 20px' }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }}>
                  {selectedProjectId === 'new' ? 'Create Project' : 'Add Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROJECT DETAILS & STATUS UPDATES MODAL */}
      {showDetailModal && activeProject && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '600px' }}>
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.modalSubheading}>Project Details • {activeProject.key}</span>
                <h3 style={styles.modalTitle}>{activeProject.name}</h3>
              </div>
              <button style={styles.closeBtn} onClick={() => setShowDetailModal(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div style={styles.modalBody}>
              {/* Status Tracker Control */}
              <div style={styles.detailSection}>
                <h4 style={styles.detailTitle}>QA status</h4>
                <div style={styles.statusButtonsGroup}>
                  {PROJECT_STATUSES.map(s => (
                    <button 
                      key={s}
                      onClick={() => handleStatusChange(activeProject.id, s)}
                      style={{
                        ...styles.statusSelectorBtn,
                        borderColor: activeProject.status === s ? `var(--status-${s.toLowerCase()})` : 'rgba(255, 255, 255, 0.08)',
                        background: activeProject.status === s ? `rgba(255, 255, 255, 0.04)` : 'transparent',
                        color: activeProject.status === s ? '#fff' : '#9ca3af'
                      }}
                    >
                      <span style={{
                        ...styles.statusDot, 
                        background: `var(--status-${s.toLowerCase()})`
                      }} />
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.detailSection}>
                <h4 style={styles.detailTitle}>QA Project Scope</h4>
                <p style={styles.detailDescText}>{activeProject.description || "No description provided."}</p>
              </div>

              {/* Status Comments / Daily Updates Section */}
              <div style={styles.detailSection}>
                <h4 style={styles.detailTitle}>
                  <MessageSquare size={16} style={{ marginRight: '6px' }} />
                  End of Day & Status Updates
                </h4>
                
                {/* Form to Post Update */}
                <form onSubmit={handlePostComment} style={styles.commentForm}>
                  <textarea 
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Log status update, blocker warnings, or EOD notes..."
                    rows={2}
                    required
                    style={styles.commentInput}
                  />
                  <button type="submit" className="btn-primary" style={styles.postBtn}>
                    Post Update
                  </button>
                </form>

                {/* List of Comments */}
                <div style={styles.commentsList}>
                  {projectComments.length === 0 ? (
                    <p style={styles.noComments}>No status updates posted yet for today.</p>
                  ) : (
                    projectComments.map(comment => (
                      <div key={comment.id} style={styles.commentRow}>
                        <div style={styles.commentMeta}>
                          <strong>{comment.user.full_name}</strong>
                          <span style={styles.commentTime}>
                            {new Date(comment.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                        <p style={styles.commentText}>{comment.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  headerTitleSec: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
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
  boardScrollContainer: {
    overflowX: 'auto',
    paddingBottom: '16px',
    width: '100%',
  },
  board: {
    display: 'flex',
    gap: '16px',
    minWidth: '1200px', // Ensures all 6 columns fit and scroll horizontally
  },
  column: {
    flex: 1,
    padding: '16px',
    minWidth: '220px',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '75vh',
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  columnDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  columnTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#e2e8f0',
    fontFamily: "'Outfit', sans-serif",
  },
  columnCount: {
    fontSize: '12px',
    background: 'rgba(255, 255, 255, 0.06)',
    padding: '2px 8px',
    borderRadius: '9999px',
    color: '#94a3b8',
    fontWeight: '500',
  },
  columnContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto',
    flex: 1,
  },
  emptyColumnText: {
    textAlign: 'center',
    color: '#475569',
    fontSize: '13px',
    padding: '20px 0',
    border: '1px dashed rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
  },
  card: {
    background: 'rgba(30, 41, 59, 0.25)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: '8px',
    padding: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
    '&:hover': {
      borderColor: 'rgba(99, 102, 241, 0.4)',
      transform: 'translateY(-2px)',
    }
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  cardKey: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#818cf8',
    background: 'rgba(129, 140, 248, 0.1)',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  cardLead: {
    fontSize: '11px',
    color: '#9ca3af',
    display: 'flex',
    alignItems: 'center',
  },
  cardName: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#f3f4f6',
    marginBottom: '6px',
  },
  cardDesc: {
    fontSize: '13px',
    color: '#9ca3af',
    lineHeight: '1.4',
    marginBottom: '12px',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
    paddingTop: '10px',
    marginBottom: '10px',
  },
  cardStat: {
    fontSize: '12px',
  },
  blockerBadge: {
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#fca5a5',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
  },
  quickActions: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  quickGoBtn: {
    padding: '4px 8px',
    fontSize: '11px',
    borderRadius: '4px',
  },
  loading: {
    textAlign: 'center',
    padding: '100px 0',
    color: '#9ca3af',
  },
  
  // Modal Styles
  modalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
    paddingBottom: '16px',
    marginBottom: '20px',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#f3f4f6',
    fontFamily: "'Outfit', sans-serif",
  },
  modalSubheading: {
    fontSize: '12px',
    color: '#818cf8',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    '&:hover': { color: '#f3f4f6' }
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  modalLabel: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#9ca3af',
    marginBottom: '6px',
  },
  modalInput: {
    padding: '10px',
    background: 'rgba(30, 41, 59, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    color: '#f3f4f6',
    outline: 'none',
    fontSize: '14px',
  },
  modalSelect: {
    padding: '10px',
    background: 'rgba(30, 41, 59, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    color: '#f3f4f6',
    outline: 'none',
    fontSize: '14px',
  },
  modalTextarea: {
    padding: '10px',
    background: 'rgba(30, 41, 59, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    color: '#f3f4f6',
    outline: 'none',
    resize: 'vertical',
    fontSize: '14px',
  },
  existingProjectNote: {
    padding: '10px 12px',
    border: '1px solid rgba(99, 102, 241, 0.18)',
    borderRadius: '6px',
    background: 'rgba(99, 102, 241, 0.08)',
    color: '#cbd5e1',
    fontSize: '13px',
  },
  row: {
    display: 'flex',
    gap: '16px',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '10px',
  },
  
  // Project detail modal styles
  modalBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  detailTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    fontFamily: "'Outfit', sans-serif",
  },
  statusButtonsGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  statusSelectorBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    border: '1px solid',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  detailDescText: {
    fontSize: '14px',
    color: '#94a3b8',
    lineHeight: '1.6',
    background: 'rgba(255, 255, 255, 0.02)',
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
  },
  commentForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '16px',
  },
  commentInput: {
    padding: '10px',
    background: 'rgba(30, 41, 59, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    color: '#f3f4f6',
    outline: 'none',
    fontSize: '14px',
    resize: 'none',
  },
  postBtn: {
    alignSelf: 'flex-end',
    padding: '6px 14px',
    fontSize: '13px',
  },
  commentsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '200px',
    overflowY: 'auto',
    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
    paddingTop: '16px',
  },
  noComments: {
    color: '#475569',
    fontSize: '13px',
    textAlign: 'center',
    padding: '10px 0',
  },
  commentRow: {
    background: 'rgba(255, 255, 255, 0.02)',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.02)',
  },
  commentMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#94a3b8',
    marginBottom: '4px',
  },
  commentTime: {
    color: '#475569',
  },
  commentText: {
    fontSize: '13px',
    color: '#cbd5e1',
    lineHeight: '1.4',
  }
};
