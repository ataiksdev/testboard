import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import { 
  Bug as BugIcon, Plus, MessageSquare, User as UserIcon, 
  AlertTriangle, CheckCircle, Clock, X, Eye, FileText, ImagePlus, Clipboard
} from 'lucide-react';

const BUG_STATUSES = ["Open", "In Progress", "In QA", "Resolved", "Closed"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];

export const BugTracker = ({ selectedProject, onClearProjectFilter }) => {
  const [bugs, setBugs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [versions, setVersions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter States
  const [filterProjectId, setFilterProjectId] = useState(selectedProject ? selectedProject.id : '');
  const [filterVersionId, setFilterVersionId] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeBug, setActiveBug] = useState(null);
  const [bugComments, setBugComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');

  // Bug Create Form States
  const [bugTitle, setBugTitle] = useState('');
  const [bugDesc, setBugDesc] = useState('');
  const [bugProjId, setBugProjId] = useState(selectedProject ? selectedProject.id : '');
  const [bugVerId, setBugVerId] = useState('');
  const [bugStatus, setBugStatus] = useState('Open');
  const [bugSeverity, setBugSeverity] = useState('Medium');
  const [bugOwnerId, setBugOwnerId] = useState('');
  const [bugIsBlocker, setBugIsBlocker] = useState(false);
  const [bugScreenshotData, setBugScreenshotData] = useState('');
  const [bugScreenshotName, setBugScreenshotName] = useState('');

  const { token, API_URL } = useAuth();

  useEffect(() => {
    if (selectedProject) {
      setFilterProjectId(selectedProject.id);
      setBugProjId(selectedProject.id);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchCoreData();
  }, []);

  useEffect(() => {
    fetchBugs();
  }, [filterProjectId]);

  useEffect(() => {
    if (filterProjectId) {
      fetchVersions(filterProjectId);
    } else {
      setVersions([]);
      setFilterVersionId('');
    }
  }, [filterProjectId]);

  useEffect(() => {
    if (bugProjId) {
      fetchVersions(bugProjId);
    }
  }, [bugProjId]);

  const fetchCoreData = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${token}` };
      const [projRes, userRes] = await Promise.all([
        fetch(`${API_URL}/api/projects`, { headers }),
        fetch(`${API_URL}/api/users`, { headers })
      ]);
      if (projRes.ok && userRes.ok) {
        const projData = await projRes.json();
        const userData = await userRes.json();
        setProjects(projData);
        setUsers(userData);
        if (projData.length > 0 && !bugProjId) {
          setBugProjId(projData[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBugs = async () => {
    try {
      setLoading(true);
      const url = filterProjectId 
        ? `${API_URL}/api/bugs?project_id=${filterProjectId}`
        : `${API_URL}/api/bugs`;
        
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setBugs(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async (projId) => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${projId}/versions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setVersions(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getScreenshotUrl = (screenshotUrl) => {
    if (!screenshotUrl) return '';
    return screenshotUrl.startsWith('http') ? screenshotUrl : `${API_URL}${screenshotUrl}`;
  };

  const setScreenshotFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert("Screenshot must be an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Screenshot must be 5 MB or smaller");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setBugScreenshotData(reader.result);
      setBugScreenshotName(file.name || 'Pasted screenshot');
    };
    reader.readAsDataURL(file);
  };

  const handleScreenshotPaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;

    e.preventDefault();
    const file = imageItem.getAsFile();
    setScreenshotFile(file);
  };

  const clearScreenshot = () => {
    setBugScreenshotData('');
    setBugScreenshotName('');
  };

  const handleCreateBug = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/bugs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: bugTitle,
          description: bugDesc,
          project_id: parseInt(bugProjId),
          version_id: bugVerId ? parseInt(bugVerId) : null,
          status: bugStatus,
          severity: bugSeverity,
          is_blocker: bugIsBlocker,
          owner_id: bugOwnerId ? parseInt(bugOwnerId) : null,
          screenshot_data: bugScreenshotData || null
        })
      });

      if (response.ok) {
        setShowCreateModal(false);
        // Clear
        setBugTitle('');
        setBugDesc('');
        setBugVerId('');
        setBugStatus('Open');
        setBugSeverity('Medium');
        setBugOwnerId('');
        setBugIsBlocker(false);
        clearScreenshot();
        
        fetchBugs();
      } else {
        const data = await response.json();
        throw new Error(data.detail || "Failed to log bug");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBugFieldUpdate = async (bugId, fields) => {
    try {
      const response = await fetch(`${API_URL}/api/bugs/${bugId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(fields)
      });

      if (!response.ok) throw new Error("Failed to update bug");
      
      const updatedBug = await response.json();
      
      // Update local state lists
      setBugs(bugs.map(b => b.id === bugId ? updatedBug : b));
      if (activeBug && activeBug.id === bugId) {
        setActiveBug(updatedBug);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenDetail = (bug) => {
    setActiveBug(bug);
    setShowDetailModal(true);
    fetchBugComments(bug.id);
  };

  const fetchBugComments = async (bugId) => {
    try {
      const response = await fetch(`${API_URL}/api/comments?bug_id=${bugId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setBugComments(data);
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
          bug_id: activeBug.id,
          text: newCommentText
        })
      });

      if (response.ok) {
        setNewCommentText('');
        fetchBugComments(activeBug.id);
      } else {
        throw new Error("Failed to post update comment");
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Filter bugs by version if selected
  const filteredBugs = filterVersionId 
    ? bugs.filter(b => b.version_id === parseInt(filterVersionId))
    : bugs;

  if (loading && bugs.length === 0) return <div style={styles.loading}>Loading Kanban board...</div>;

  return (
    <div style={styles.container} className="animate-fade-in">
      {/* Header Filters */}
      <div style={styles.header}>
        <div style={styles.headerTitleSec}>
          <BugIcon size={24} color="#6366f1" />
          <h2 style={styles.title}>Bugs Kanban Board</h2>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> Log a Bug
        </button>
      </div>

      <div style={styles.filtersRow}>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Project</label>
          <select 
            value={filterProjectId} 
            onChange={(e) => {
              setFilterProjectId(e.target.value);
              if (onClearProjectFilter && e.target.value === '') {
                onClearProjectFilter();
              }
            }}
            style={styles.filterSelect}
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
          </select>
        </div>

        {filterProjectId && (
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Version</label>
            <select 
              value={filterVersionId} 
              onChange={(e) => setFilterVersionId(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Versions</option>
              {versions.map(v => <option key={v.id} value={v.id}>{v.version_name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Board */}
      <div style={styles.boardScrollContainer}>
        <div style={styles.board}>
          {BUG_STATUSES.map(status => {
            const statusBugs = filteredBugs.filter(b => b.status === status);
            return (
              <div key={status} style={styles.column} className="glass-panel">
                <div style={styles.columnHeader}>
                  <h3 style={styles.columnTitle}>{status}</h3>
                  <span style={styles.columnCount}>{statusBugs.length}</span>
                </div>

                <div style={styles.columnContent}>
                  {statusBugs.map(bug => (
                    <div 
                      key={bug.id} 
                      style={styles.card} 
                      onClick={() => handleOpenDetail(bug)}
                      className="animate-slide-up"
                    >
                      <div style={styles.cardHeader}>
                        <span style={styles.cardKey}>
                          {bug.project ? bug.project.key : 'BUG'}-{bug.id}
                        </span>
                        <span style={{
                          ...styles.sevBadge,
                          background: `var(--sev-${bug.severity.toLowerCase()})`,
                          color: '#fff'
                        }}>
                          {bug.severity}
                        </span>
                      </div>
                      
                      <h4 style={styles.cardTitle}>{bug.title}</h4>
                      
                      <div style={styles.cardFooter}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <UserIcon size={12} color="#9ca3af" />
                          <span style={styles.ownerText}>
                            {bug.owner ? bug.owner.full_name : 'Unassigned'}
                          </span>
                        </div>
                        {bug.is_blocker && (
                          <span style={styles.blockerTag} className="animate-blink-red">
                            <AlertTriangle size={10} style={{ marginRight: '2px' }} />
                            BLOCKER
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {statusBugs.length === 0 && (
                    <div style={styles.emptyColumnText}>No bugs in {status}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CREATE BUG MODAL */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '500px' }}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Log a QA Bug Ticket</h3>
              <button style={styles.closeBtn} onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateBug} style={styles.modalForm}>
              <div style={styles.inputGroup}>
                <label style={styles.modalLabel}>Select Project</label>
                <select 
                  value={bugProjId} 
                  onChange={(e) => setBugProjId(e.target.value)}
                  required
                  style={styles.modalSelect}
                >
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div style={styles.row}>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Target Version</label>
                  <select 
                    value={bugVerId} 
                    onChange={(e) => setBugVerId(e.target.value)}
                    style={styles.modalSelect}
                  >
                    <option value="">No Version</option>
                    {versions.map(v => <option key={v.id} value={v.id}>{v.version_name}</option>)}
                  </select>
                </div>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Severity</label>
                  <select 
                    value={bugSeverity} 
                    onChange={(e) => setBugSeverity(e.target.value)}
                    style={styles.modalSelect}
                  >
                    {SEVERITIES.map(sev => <option key={sev} value={sev}>{sev}</option>)}
                  </select>
                </div>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.modalLabel}>Assign Owner</label>
                <select 
                  value={bugOwnerId} 
                  onChange={(e) => setBugOwnerId(e.target.value)}
                  style={styles.modalSelect}
                >
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.modalLabel}>Bug Title</label>
                <input 
                  type="text" 
                  value={bugTitle} 
                  onChange={(e) => setBugTitle(e.target.value)}
                  placeholder="e.g. CORS error on /api/reports endpoint"
                  required
                  style={styles.modalInput}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.modalLabel}>Steps to Reproduce & Description</label>
                <textarea 
                  value={bugDesc} 
                  onChange={(e) => setBugDesc(e.target.value)}
                  placeholder="1. Go to Reports tab.&#10;2. Select Date range.&#10;3. Observe console error..."
                  rows={4}
                  style={styles.modalTextarea}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.modalLabel}>Screenshot</label>
                <div
                  style={styles.screenshotDropZone}
                  onPaste={handleScreenshotPaste}
                  tabIndex={0}
                >
                  <div style={styles.screenshotDropHeader}>
                    <ImagePlus size={18} color="#818cf8" />
                    <span>Paste an image here or choose a file</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setScreenshotFile(e.target.files?.[0])}
                    style={styles.fileInput}
                  />
                  <div style={styles.pasteHint}>
                    <Clipboard size={12} />
                    Ctrl+V supports copied screenshots from your clipboard.
                  </div>
                </div>
                {bugScreenshotData && (
                  <div style={styles.screenshotPreviewWrap}>
                    <img
                      src={bugScreenshotData}
                      alt="Screenshot preview"
                      style={styles.screenshotPreview}
                    />
                    <div style={styles.screenshotPreviewMeta}>
                      <span>{bugScreenshotName}</span>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={clearScreenshot}
                        style={styles.clearScreenshotBtn}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={styles.checkboxGroup}>
                <input 
                  type="checkbox" 
                  id="create-is-blocker"
                  checked={bugIsBlocker}
                  onChange={(e) => setBugIsBlocker(e.target.checked)}
                  style={styles.checkbox}
                />
                <label htmlFor="create-is-blocker" style={styles.checkboxLabel}>
                  <AlertTriangle size={14} color="#ef4444" style={{ marginRight: '4px' }} />
                  Flag this bug as a **Blocker**
                </label>
              </div>

              <div style={styles.modalActions}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)} style={{ padding: '10px 20px' }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }}>Log Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BUG DETAILS & ACTIVITY MODAL */}
      {showDetailModal && activeBug && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '600px' }}>
            <div style={styles.modalHeader}>
              <div>
                <span style={styles.modalSubheading}>
                  {activeBug.project ? activeBug.project.name : 'Unknown Project'} • {activeBug.project ? activeBug.project.key : 'BUG'}-{activeBug.id}
                </span>
                <h3 style={styles.modalTitle}>{activeBug.title}</h3>
              </div>
              <button style={styles.closeBtn} onClick={() => setShowDetailModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.row}>
                {/* Status Dropdown */}
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Status</label>
                  <select 
                    value={activeBug.status} 
                    onChange={(e) => handleBugFieldUpdate(activeBug.id, { status: e.target.value })}
                    style={styles.modalSelect}
                  >
                    {BUG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {/* Severity Dropdown */}
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Severity</label>
                  <select 
                    value={activeBug.severity} 
                    onChange={(e) => handleBugFieldUpdate(activeBug.id, { severity: e.target.value })}
                    style={styles.modalSelect}
                  >
                    {SEVERITIES.map(sev => <option key={sev} value={sev}>{sev}</option>)}
                  </select>
                </div>
              </div>

              <div style={styles.row}>
                {/* Owner Dropdown */}
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Owner</label>
                  <select 
                    value={activeBug.owner_id || ''} 
                    onChange={(e) => handleBugFieldUpdate(activeBug.id, { owner_id: e.target.value ? parseInt(e.target.value) : -1 })}
                    style={styles.modalSelect}
                  >
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                {/* Blocker Flag */}
                <div style={{ ...styles.inputGroup, flex: 1, justifyContent: 'center' }}>
                  <div style={styles.checkboxGroup}>
                    <input 
                      type="checkbox" 
                      id="detail-is-blocker"
                      checked={activeBug.is_blocker}
                      onChange={(e) => handleBugFieldUpdate(activeBug.id, { is_blocker: e.target.checked })}
                      style={styles.checkbox}
                    />
                    <label htmlFor="detail-is-blocker" style={styles.checkboxLabel}>
                      Blocker Ticket
                    </label>
                  </div>
                </div>
              </div>

              <div style={styles.detailSection}>
                <h4 style={styles.detailTitle}>Steps to Reproduce / Description</h4>
                <p style={styles.detailDescText}>{activeBug.description || "No description provided."}</p>
              </div>

              {activeBug.screenshot_url && (
                <div style={styles.detailSection}>
                  <h4 style={styles.detailTitle}>Screenshot</h4>
                  <a
                    href={getScreenshotUrl(activeBug.screenshot_url)}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.screenshotLink}
                  >
                    <img
                      src={getScreenshotUrl(activeBug.screenshot_url)}
                      alt="Bug screenshot"
                      style={styles.detailScreenshot}
                    />
                  </a>
                </div>
              )}

              <div style={styles.metaRow}>
                <span>Reported by: <strong>{activeBug.reporter.full_name}</strong></span>
                <span>Logged: {new Date(activeBug.created_at).toLocaleDateString()}</span>
              </div>

              {/* Bug Comments / Status Updates */}
              <div style={styles.detailSection}>
                <h4 style={styles.detailTitle}>
                  <MessageSquare size={16} style={{ marginRight: '6px' }} />
                  Daily Bug Updates & Comments
                </h4>

                <form onSubmit={handlePostComment} style={styles.commentForm}>
                  <textarea 
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Log status update or diagnostic details for this bug..."
                    rows={2}
                    required
                    style={styles.commentInput}
                  />
                  <button type="submit" className="btn-primary" style={styles.postBtn}>
                    Post Update
                  </button>
                </form>

                <div style={styles.commentsList}>
                  {bugComments.length === 0 ? (
                    <p style={styles.noComments}>No updates posted yet.</p>
                  ) : (
                    bugComments.map(comment => (
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
  filtersRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '180px',
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#9ca3af',
  },
  filterSelect: {
    padding: '8px 12px',
    background: 'rgba(30, 41, 59, 0.4)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    color: '#f3f4f6',
    outline: 'none',
    fontSize: '14px',
  },
  boardScrollContainer: {
    overflowX: 'auto',
    paddingBottom: '16px',
    width: '100%',
  },
  board: {
    display: 'flex',
    gap: '16px',
    minWidth: '1100px',
  },
  column: {
    flex: 1,
    padding: '16px',
    minWidth: '200px',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '70vh',
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    paddingBottom: '10px',
  },
  columnTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#cbd5e1',
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
    fontSize: '12px',
    padding: '20px 0',
    border: '1px dashed rgba(255, 255, 255, 0.03)',
    borderRadius: '6px',
  },
  card: {
    background: 'rgba(30, 41, 59, 0.25)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: '8px',
    padding: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    '&:hover': {
      borderColor: 'rgba(99, 102, 241, 0.4)',
      transform: 'translateY(-2px)',
    }
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardKey: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#94a3b8',
  },
  sevBadge: {
    fontSize: '9px',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#f3f4f6',
    lineHeight: '1.4',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '1px solid rgba(255, 255, 255, 0.03)',
    paddingTop: '8px',
  },
  ownerText: {
    fontSize: '11px',
    color: '#9ca3af',
  },
  blockerTag: {
    background: 'rgba(239, 68, 68, 0.15)',
    color: '#fca5a5',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    padding: '1px 4px',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: '700',
    display: 'inline-flex',
    alignItems: 'center',
  },
  loading: {
    textAlign: 'center',
    padding: '100px 0',
    color: '#9ca3af',
  },
  
  // Modals
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
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
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
  screenshotDropZone: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    background: 'rgba(30, 41, 59, 0.22)',
    border: '1px dashed rgba(129, 140, 248, 0.35)',
    borderRadius: '6px',
    outline: 'none',
  },
  screenshotDropHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#cbd5e1',
    fontSize: '13px',
    fontWeight: '500',
  },
  fileInput: {
    color: '#9ca3af',
    fontSize: '13px',
  },
  pasteHint: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#64748b',
    fontSize: '12px',
  },
  screenshotPreviewWrap: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    padding: '10px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '6px',
  },
  screenshotPreview: {
    width: '92px',
    height: '60px',
    objectFit: 'cover',
    borderRadius: '4px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  screenshotPreviewMeta: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    color: '#cbd5e1',
    fontSize: '12px',
  },
  clearScreenshotBtn: {
    padding: '4px 8px',
    fontSize: '11px',
  },
  row: {
    display: 'flex',
    gap: '16px',
  },
  checkboxGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: '#6366f1',
    cursor: 'pointer',
  },
  checkboxLabel: {
    fontSize: '14px',
    color: '#cbd5e1',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '10px',
  },
  
  // Bug details modal styles
  modalBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
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
  detailDescText: {
    fontSize: '14px',
    color: '#94a3b8',
    lineHeight: '1.6',
    background: 'rgba(255, 255, 255, 0.02)',
    padding: '12px',
    borderRadius: '6px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    whiteSpace: 'pre-wrap',
  },
  screenshotLink: {
    display: 'block',
  },
  detailScreenshot: {
    width: '100%',
    maxHeight: '320px',
    objectFit: 'contain',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '6px',
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#6b7280',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
    paddingBottom: '12px',
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
