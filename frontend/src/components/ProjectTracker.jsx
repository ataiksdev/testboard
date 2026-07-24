import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import {
  FolderKanban, Plus, User as UserIcon,
  ChevronRight, X, Upload, Archive, ArchiveRestore
} from 'lucide-react';
import { canManageProjects, canManageMembers } from '../utils/roles';
import { ProjectDetailView } from './ProjectDetailView';
import { useToast } from './Toast';

const PROJECT_STATUSES = ["Intake", "Reviewing", "Testing", "Blocked", "Completed", "Archived"];
const DOCUMENT_TYPES = ["BRD", "Report", "Test Plan", "Changelog", "Addendum", "Other"];

const deriveProjectKey = (name) => name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase();

export const ProjectTracker = ({ onSelectProject }) => {
  const [projects, setProjects] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draggedProjectId, setDraggedProjectId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const [viewMode, setViewMode] = useState('board'); // 'board' | 'detail'
  const [activeProject, setActiveProject] = useState(null);

  // Create-project form fields
  const [projName, setProjName] = useState('');
  const [projKey, setProjKey] = useState('');
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
  const [projDesc, setProjDesc] = useState('');
  const [projStatus, setProjStatus] = useState('Intake');
  const [projLead, setProjLead] = useState('');
  const [projPmLead, setProjPmLead] = useState('');
  const [projVendor, setProjVendor] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  // Staged documents to upload right after project creation
  const [stagedDocs, setStagedDocs] = useState([]);
  const [newDocFile, setNewDocFile] = useState(null);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState('BRD');

  const { token, API_URL, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const canEdit = canManageProjects(user.role);
  const canEditMembers = canManageMembers(user.role);
  const qaLeadOptions = users.filter(u => u.role === 'QA');
  const pmLeadOptions = users.filter(u => u.role === 'PM');

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

      const qaUsers = userData.filter(u => u.role === 'QA');
      if (qaUsers.length > 0) {
        setProjLead(qaUsers[0].id);
      }

      // Keep an open detail view in sync with freshly fetched data
      setActiveProject(prev => {
        if (!prev) return prev;
        const updated = projData.find(p => p.id === prev.id);
        return updated || prev;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const resetProjectForm = () => {
    setProjName('');
    setProjKey('');
    setKeyManuallyEdited(false);
    setProjDesc('');
    setProjStatus('Intake');
    setProjVendor('');
    setProjPmLead('');
    setStagedDocs([]);
    setNewDocFile(null);
    setNewDocTitle('');
    setNewDocType('BRD');
    const qaUsers = users.filter(u => u.role === 'QA');
    if (qaUsers.length > 0) {
      setProjLead(qaUsers[0].id);
    }
  };

  const stageDocument = () => {
    if (!newDocFile || !newDocTitle.trim()) return;
    setStagedDocs(prev => [...prev, { file: newDocFile, title: newDocTitle.trim(), docType: newDocType }]);
    setNewDocFile(null);
    setNewDocTitle('');
    setNewDocType('BRD');
  };

  const removeStagedDocument = (index) => {
    setStagedDocs(prev => prev.filter((_, i) => i !== index));
  };

  const uploadDocumentToProject = async (projectId, { file, title, docType, versionId }) => {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('doc_type', docType);
    if (versionId) formData.append('version_id', versionId);
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/projects/${projectId}/documents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || "Failed to upload document");
    }
    return response.json();
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      setCreatingProject(true);
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
          vendor: projVendor.trim() || null,
          lead_id: projLead ? parseInt(projLead) : undefined,
          pm_lead_id: projPmLead ? parseInt(projPmLead) : undefined
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to create project");
      }

      const project = await response.json();

      for (const doc of stagedDocs) {
        await uploadDocumentToProject(project.id, doc);
      }

      setShowCreateModal(false);
      resetProjectForm();

      fetchData();
      showSuccess(`Project "${project.name}" created successfully.`);
    } catch (err) {
      showError(err.message);
    } finally {
      setCreatingProject(false);
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

      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: newStatus } : p));

      if (activeProject && activeProject.id === projectId) {
        setActiveProject(prev => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      showError(err.message);
    }
  };

  const handleProjectDrop = (projectId, newStatus) => {
    const project = projects.find(p => p.id === projectId);
    if (!project || project.status === newStatus) return;
    handleStatusChange(projectId, newStatus);
  };

  const handleOpenDetail = (project) => {
    setActiveProject(project);
    setViewMode('detail');
  };

  const handleBackToBoard = () => {
    setViewMode('board');
    setActiveProject(null);
  };

  const handleProjectUpdated = (updated) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
    setActiveProject(updated);
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

  if (viewMode === 'detail' && activeProject) {
    return (
      <ProjectDetailView
        project={activeProject}
        users={users}
        bugs={bugs}
        qaLeadOptions={qaLeadOptions}
        pmLeadOptions={pmLeadOptions}
        canEdit={canEdit}
        canEditMembers={canEditMembers}
        token={token}
        API_URL={API_URL}
        onBack={handleBackToBoard}
        onProjectUpdated={handleProjectUpdated}
        onStatusChange={handleStatusChange}
        onSelectProject={onSelectProject}
        uploadDocumentToProject={uploadDocumentToProject}
        documentTypes={DOCUMENT_TYPES}
        projectStatuses={PROJECT_STATUSES}
      />
    );
  }

  const visibleStatuses = showArchived ? PROJECT_STATUSES : PROJECT_STATUSES.filter(s => s !== 'Archived');
  const archivedCount = projects.filter(p => p.status === 'Archived').length;

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.headerBanner}>
        <div style={styles.header}>
          <div style={styles.headerTitleSec}>
            <FolderKanban size={24} color="var(--header-banner-icon)" />
            <h2 style={styles.title}>QA Project Tracker</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              style={{ ...styles.archiveToggleBtn, ...(showArchived ? styles.archiveToggleBtnActive : {}) }}
              onClick={() => setShowArchived(v => !v)}
              title={showArchived ? 'Hide archived projects' : 'Show archived projects'}
              aria-label={showArchived ? 'Hide archived projects' : 'Show archived projects'}
            >
              {showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              {archivedCount > 0 && <span style={styles.archiveCount}>{archivedCount}</span>}
            </button>
            {canEdit && (
              <button
                className="btn-primary"
                style={styles.addBtn}
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={16} /> Add QA Project
              </button>
            )}
          </div>
        </div>
        <p style={styles.subtitle}>Track high-level QA stages of all ongoing software projects.</p>
      </div>

      {/* Board Layout */}
      <div style={styles.boardScrollContainer}>
        <div style={{ ...styles.board, minWidth: `${visibleStatuses.length * 220}px` }}>
          {visibleStatuses.map(status => {
            const statusProjects = projects.filter(p => p.status === status);
            return (
              <div
                key={status}
                style={{
                  ...styles.column,
                  ...(dragOverStatus === status ? styles.columnDragOver : {}),
                }}
                className="glass-panel"
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverStatus(status);
                }}
                onDragLeave={() => setDragOverStatus(current => current === status ? null : current)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStatus(null);
                  if (!canEdit) return;
                  const projectId = parseInt(e.dataTransfer.getData('text/plain'), 10) || draggedProjectId;
                  if (projectId) handleProjectDrop(projectId, status);
                }}
              >
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
                        style={{
                          ...styles.card,
                          ...(canEdit ? styles.cardDraggable : {}),
                          opacity: draggedProjectId === project.id ? 0.4 : 1,
                        }}
                        draggable={canEdit}
                        onDragStart={(e) => {
                          setDraggedProjectId(project.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(project.id));
                        }}
                        onDragEnd={() => { setDraggedProjectId(null); setDragOverStatus(null); }}
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
                          <button
                            style={{ ...styles.cardStatBtn, color: stats.open > 0 ? 'var(--primary-neon)' : 'var(--text-muted)' }}
                            onClick={(e) => { e.stopPropagation(); onSelectProject(project); }}
                            title="Go to Bugs Board"
                          >
                            Bugs: <strong>{stats.open}</strong>/{stats.total}
                            <ChevronRight size={12} />
                          </button>
                          {stats.blockers > 0 && (
                            <span style={styles.blockerBadge} className="animate-blink-red">
                              {stats.blockers} Blocker{stats.blockers > 1 ? 's' : ''}
                            </span>
                          )}
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
              <div style={styles.inputGroup}>
                <label style={styles.modalLabel}>Project Name <span style={styles.requiredMark}>*</span></label>
                <input
                  type="text"
                  value={projName}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setProjName(nextName);
                    if (!keyManuallyEdited) {
                      setProjKey(deriveProjectKey(nextName));
                    }
                  }}
                  placeholder="e.g. Mobile E-commerce Redesign"
                  required
                  autoFocus
                  style={styles.modalInput}
                />
              </div>

              <div style={styles.row}>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Project Key (e.g. MOB)</label>
                  <input
                    type="text"
                    value={projKey}
                    onChange={(e) => {
                      setKeyManuallyEdited(true);
                      setProjKey(e.target.value);
                    }}
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
                <label style={styles.modalLabel}>Vendor/Developer (optional)</label>
                <input
                  type="text"
                  value={projVendor}
                  onChange={(e) => setProjVendor(e.target.value)}
                  placeholder="e.g. Acme Software Inc."
                  style={styles.modalInput}
                />
              </div>

              <div style={styles.row}>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>QA Lead</label>
                  <select
                    value={projLead}
                    onChange={(e) => setProjLead(e.target.value)}
                    style={styles.modalSelect}
                  >
                    <option value="">Unassigned</option>
                    {qaLeadOptions.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>PM Lead</label>
                  <select
                    value={projPmLead}
                    onChange={(e) => setProjPmLead(e.target.value)}
                    style={styles.modalSelect}
                  >
                    <option value="">Unassigned</option>
                    {pmLeadOptions.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.modalLabel}>Description <span style={styles.requiredMark}>*</span></label>
                <textarea
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  placeholder="Project goals, QA scope, and testing pipelines..."
                  rows={4}
                  required
                  style={styles.modalTextarea}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.modalLabel}>Project Documents (optional)</label>
                {stagedDocs.length > 0 && (
                  <div style={styles.teamList}>
                    {stagedDocs.map((doc, i) => (
                      <div key={i} style={styles.docRow}>
                        <span style={styles.docTypeBadge}>{doc.docType}</span>
                        <div style={styles.docInfo}>
                          <span style={styles.teamName}>{doc.title}</span>
                          <span style={styles.docMeta}>{doc.file.name}</span>
                        </div>
                        <button type="button" style={styles.teamRemoveBtn} onClick={() => removeStagedDocument(i)} title="Remove">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={styles.row}>
                  <input
                    type="text"
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    placeholder="Document title, e.g. BRD v1"
                    style={{ ...styles.modalInput, flex: 2 }}
                  />
                  <select
                    value={newDocType}
                    onChange={(e) => setNewDocType(e.target.value)}
                    style={{ ...styles.modalSelect, flex: 1 }}
                  >
                    {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={styles.row}>
                  <input
                    type="file"
                    onChange={(e) => setNewDocFile(e.target.files?.[0] || null)}
                    style={styles.docFileInput}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    style={styles.addMemberBtn}
                    disabled={!newDocFile || !newDocTitle.trim()}
                    onClick={stageDocument}
                  >
                    <Upload size={14} /> Add
                  </button>
                </div>
              </div>

              <div style={styles.modalActions}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)} style={{ padding: '10px 20px' }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }} disabled={creatingProject}>
                  {creatingProject ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '10px 0',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  headerBanner: {
    background: 'var(--header-banner-bg)',
    padding: 'var(--header-banner-padding)',
    borderRadius: 'var(--header-banner-radius)',
    marginBottom: '24px',
    flexShrink: 0,
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
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: 'var(--header-banner-title)',
  },
  subtitle: {
    color: 'var(--header-banner-subtitle)',
    fontSize: '14px',
  },
  addBtn: {
    background: 'var(--header-banner-cta-bg)',
    color: 'var(--header-banner-cta-color)',
  },
  archiveToggleBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--header-banner-input-bg)',
    border: '2px solid var(--header-banner-input-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--header-banner-input-color)',
    padding: '10px',
    cursor: 'pointer',
  },
  archiveToggleBtnActive: {
    background: 'var(--primary-neon)',
    borderColor: 'var(--primary-neon)',
    color: 'var(--text-inverse)',
  },
  archiveCount: {
    fontSize: '11px',
    fontWeight: '700',
  },
  boardScrollContainer: {
    overflowX: 'auto',
    paddingBottom: '16px',
    width: '100%',
    flex: 1,
    minHeight: 0,
    display: 'flex',
  },
  board: {
    display: 'flex',
    gap: '16px',
    width: '100%',
  },
  column: {
    flex: 1,
    padding: '16px',
    minWidth: '220px',
    display: 'flex',
    flexDirection: 'column',
    transition: 'border-color 0.15s ease, background 0.15s ease',
  },
  columnDragOver: {
    borderColor: 'var(--primary-border)',
    background: 'var(--primary-soft)',
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
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
  },
  columnCount: {
    fontSize: '12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    padding: '1px 8px',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-muted)',
    fontWeight: '700',
  },
  columnContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
  },
  emptyColumnText: {
    textAlign: 'center',
    color: 'var(--text-subtle)',
    fontSize: '13px',
    padding: '20px 0',
    border: '2px dashed var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  card: {
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '16px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
  },
  cardDraggable: {
    cursor: 'grab',
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
    color: 'var(--primary-neon)',
    background: 'var(--primary-soft)',
    padding: '2px 6px',
    borderRadius: 'var(--border-radius-sm)',
  },
  cardLead: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
  },
  cardName: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    marginBottom: '6px',
  },
  cardDesc: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: '1.4',
    marginBottom: '12px',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '2px solid var(--glass-border)',
    paddingTop: '10px',
    marginBottom: '10px',
  },
  cardStat: {
    fontSize: '12px',
  },
  cardStatBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '12px',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  blockerBadge: {
    background: 'var(--danger-bg)',
    color: 'var(--danger-text)',
    border: '2px solid var(--danger-border)',
    padding: '2px 6px',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '11px',
    fontWeight: '700',
  },
  loading: {
    textAlign: 'center',
    padding: '100px 0',
    color: 'var(--text-muted)',
  },

  // Modal Styles
  modalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottom: '2px solid var(--glass-border)',
    paddingBottom: '16px',
    marginBottom: '20px',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  modalLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-muted)',
  },
  requiredMark: {
    color: 'var(--danger-text, #e5484d)',
    fontWeight: '700',
  },
  modalInput: {
    padding: '10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    outline: 'none',
    fontSize: '14px',
  },
  modalSelect: {
    padding: '10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    outline: 'none',
    fontSize: '14px',
  },
  modalTextarea: {
    padding: '10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    outline: 'none',
    resize: 'vertical',
    fontSize: '14px',
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

  // Staged-document list (reused styling from the old detail-modal doc rows)
  teamList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px',
  },
  teamName: {
    flex: 1,
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  teamRemoveBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-subtle)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  addMemberBtn: {
    padding: '8px 12px',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },
  docRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  docTypeBadge: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--primary-neon)',
    background: 'var(--primary-soft)',
    padding: '3px 7px',
    borderRadius: 'var(--border-radius-sm)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    flexShrink: 0,
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  docMeta: {
    fontSize: '11px',
    color: 'var(--text-subtle)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  docFileInput: {
    flex: 1,
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
};
