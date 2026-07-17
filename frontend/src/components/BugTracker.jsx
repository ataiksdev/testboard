import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import {
  Bug as BugIcon, MessageSquare, User as UserIcon,
  AlertTriangle, CheckCircle, Clock, X, Eye, FileText, ImagePlus, Clipboard, Search
} from 'lucide-react';
import { canManageBugs, canEditBugFields } from '../utils/roles';

const BUG_STATUSES = ["Open", "In Progress", "Resolved", "In QA", "Closed"];
const DEV_ALLOWED_BUG_STATUSES = ["Open", "In Progress", "Resolved"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const BUG_TYPES = ["Functional", "Security", "Usability", "Regression", "Performance", "Other"];
const PRIORITY_COLOR_VAR = { Low: '--text-subtle', Medium: '--primary-neon', High: '--accent-mustard', Urgent: '--accent-rust' };

export const BugTracker = ({ selectedProject, onClearProjectFilter }) => {
  const [bugs, setBugs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [versions, setVersions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [filterProjectId, setFilterProjectId] = useState(selectedProject ? selectedProject.id : '');
  const [filterVersionId, setFilterVersionId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterOwnerId, setFilterOwnerId] = useState('');

  // Drag and drop
  const [draggedBugId, setDraggedBugId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeBug, setActiveBug] = useState(null);
  const [bugComments, setBugComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');

  // Bug Create Form States
  const [bugTitle, setBugTitle] = useState('');
  const [bugDesc, setBugDesc] = useState('');
  const [bugExpectedBehavior, setBugExpectedBehavior] = useState('');
  const [bugProjId, setBugProjId] = useState(selectedProject ? selectedProject.id : '');
  const [bugVerId, setBugVerId] = useState('');
  const [bugStatus, setBugStatus] = useState('Open');
  const [bugSeverity, setBugSeverity] = useState('Medium');
  const [bugPriority, setBugPriority] = useState('Medium');
  const [bugType, setBugType] = useState('Functional');
  const [bugOwnerId, setBugOwnerId] = useState('');
  const [bugIsBlocker, setBugIsBlocker] = useState(false);
  const [bugScreenshotData, setBugScreenshotData] = useState('');
  const [bugScreenshotName, setBugScreenshotName] = useState('');

  const { token, API_URL, user } = useAuth();
  const canEdit = canManageBugs(user.role);
  const isDev = user.role === 'Dev';
  const bugStatusOptions = isDev ? DEV_ALLOWED_BUG_STATUSES : BUG_STATUSES;
  const canEditFields = canEditBugFields(user.role);

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

  const formatBugKey = (bug) => {
    if (!bug.project) return `BUG-${bug.id}`;
    const seq = bug.project_sequence != null ? bug.project_sequence : bug.id;
    return `${bug.project.key}-${String(seq).padStart(3, '0')}`;
  };

  const readScreenshotFile = (file, onLoaded) => {
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
    reader.onload = () => onLoaded(reader.result, file.name || 'Pasted screenshot');
    reader.readAsDataURL(file);
  };

  const setScreenshotFile = (file) => {
    readScreenshotFile(file, (dataUrl, name) => {
      setBugScreenshotData(dataUrl);
      setBugScreenshotName(name);
    });
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

  const uploadDetailScreenshot = (file) => {
    if (!activeBug) return;
    readScreenshotFile(file, (dataUrl) => {
      handleBugFieldUpdate(activeBug.id, { screenshot_data: dataUrl });
    });
  };

  const handleDetailScreenshotPaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;

    e.preventDefault();
    uploadDetailScreenshot(imageItem.getAsFile());
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
          expected_behavior: bugExpectedBehavior,
          project_id: parseInt(bugProjId),
          version_id: bugVerId ? parseInt(bugVerId) : null,
          status: bugStatus,
          severity: bugSeverity,
          priority: bugPriority,
          bug_type: bugType,
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
        setBugExpectedBehavior('');
        setBugVerId('');
        setBugStatus('Open');
        setBugSeverity('Medium');
        setBugPriority('Medium');
        setBugType('Functional');
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

  const handleBugDrop = (bugId, newStatus) => {
    const bug = bugs.find(b => b.id === bugId);
    if (!bug || bug.status === newStatus) return;
    handleBugFieldUpdate(bugId, { status: newStatus });
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

  // Apply version, search, and metadata filters on top of the project-scoped fetch
  const filteredBugs = bugs.filter(b => {
    if (filterVersionId && b.version_id !== parseInt(filterVersionId)) return false;
    if (searchQuery.trim() && !b.title.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
    if (filterSeverity && b.severity !== filterSeverity) return false;
    if (filterPriority && b.priority !== filterPriority) return false;
    if (filterType && b.bug_type !== filterType) return false;
    if (filterOwnerId && String(b.owner_id || '') !== filterOwnerId) return false;
    return true;
  });

  if (loading && bugs.length === 0) return <div style={styles.loading}>Loading Kanban board...</div>;

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.headerBanner}>
        {/* Header Filters */}
        <div style={styles.header}>
          <div style={styles.headerTitleSec}>
            <BugIcon size={24} color="var(--header-banner-icon)" />
            <h2 style={styles.title}>Bugs Kanban Board</h2>
          </div>
          {canEdit && (
            <button
              className="btn-primary"
              style={styles.addBtn}
              onClick={() => setShowCreateModal(true)}
              title="Log a Bug"
              aria-label="Log a Bug"
            >
              <BugIcon size={22} />
            </button>
          )}
        </div>

        <div style={styles.searchRow}>
          <div style={styles.searchBox}>
            <Search size={16} color="var(--text-subtle)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bugs by title..."
              style={styles.searchInput}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={styles.searchClearBtn}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
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

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Severity</label>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Severities</option>
              {SEVERITIES.map(sev => <option key={sev} value={sev}>{sev}</option>)}
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Priority</label>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Types</option>
              {BUG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Owner</label>
            <select
              value={filterOwnerId}
              onChange={(e) => setFilterOwnerId(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="">All Owners</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>

          {(searchQuery || filterSeverity || filterPriority || filterType || filterOwnerId || filterVersionId) && (
            <button
              type="button"
              className="btn-secondary"
              style={styles.clearFiltersBtn}
              onClick={() => {
                setSearchQuery('');
                setFilterSeverity('');
                setFilterPriority('');
                setFilterType('');
                setFilterOwnerId('');
                setFilterVersionId('');
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <div style={styles.boardScrollContainer}>
        <div style={styles.board}>
          {BUG_STATUSES.map(status => {
            const statusBugs = filteredBugs.filter(b => b.status === status);
            const isDroppable = canEditFields && bugStatusOptions.includes(status);
            return (
              <div
                key={status}
                style={{
                  ...styles.column,
                  ...(dragOverStatus === status ? styles.columnDragOver : {}),
                }}
                className="glass-panel"
                onDragOver={(e) => {
                  if (!isDroppable) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverStatus(status);
                }}
                onDragLeave={() => setDragOverStatus(current => current === status ? null : current)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStatus(null);
                  if (!isDroppable) return;
                  const bugId = parseInt(e.dataTransfer.getData('text/plain'), 10) || draggedBugId;
                  if (bugId) handleBugDrop(bugId, status);
                }}
              >
                <div style={styles.columnHeader}>
                  <h3 style={styles.columnTitle}>{status}</h3>
                  <span style={styles.columnCount}>{statusBugs.length}</span>
                </div>

                <div style={styles.columnContent}>
                  {statusBugs.map(bug => (
                    <div
                      key={bug.id}
                      style={{
                        ...styles.card,
                        ...(canEditFields ? styles.cardDraggable : {}),
                        opacity: draggedBugId === bug.id ? 0.4 : 1,
                      }}
                      draggable={canEditFields}
                      onDragStart={(e) => {
                        setDraggedBugId(bug.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(bug.id));
                      }}
                      onDragEnd={() => { setDraggedBugId(null); setDragOverStatus(null); }}
                      onClick={() => handleOpenDetail(bug)}
                      className="animate-slide-up"
                    >
                      <div style={styles.cardHeader}>
                        <span style={styles.cardKey}>
                          {formatBugKey(bug)}
                        </span>
                        <div style={styles.cardBadgeGroup}>
                          <span style={{
                            ...styles.sevBadge,
                            background: `var(--sev-${bug.severity.toLowerCase()})`,
                            color: '#12100d'
                          }}>
                            {bug.severity}
                          </span>
                          {bug.priority && (
                            <span style={{
                              ...styles.sevBadge,
                              background: `var(${PRIORITY_COLOR_VAR[bug.priority] || '--text-subtle'})`,
                              color: '#12100d'
                            }}>
                              {bug.priority}
                            </span>
                          )}
                        </div>
                      </div>

                      <h4 style={styles.cardTitle}>{bug.title}</h4>
                      {bug.bug_type && (
                        <span style={styles.bugTypeTag}>{bug.bug_type}</span>
                      )}

                      <div style={styles.cardFooter}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <UserIcon size={12} color="var(--text-muted)" />
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
          <div className="modal-content glass-panel" style={{ maxWidth: '560px' }}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Log a QA Bug Ticket</h3>
              <button style={styles.closeBtn} onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateBug} style={styles.modalForm}>
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
                <label style={styles.modalLabel}>Expectations</label>
                <textarea
                  value={bugExpectedBehavior}
                  onChange={(e) => setBugExpectedBehavior(e.target.value)}
                  placeholder="What should have happened instead?"
                  rows={3}
                  style={styles.modalTextarea}
                />
              </div>

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
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Priority</label>
                  <select
                    value={bugPriority}
                    onChange={(e) => setBugPriority(e.target.value)}
                    style={styles.modalSelect}
                  >
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Type</label>
                  <select
                    value={bugType}
                    onChange={(e) => setBugType(e.target.value)}
                    style={styles.modalSelect}
                  >
                    {BUG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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
                <label style={styles.modalLabel}>Screenshot</label>
                <div
                  style={styles.screenshotDropZone}
                  onPaste={handleScreenshotPaste}
                  tabIndex={0}
                >
                  <div style={styles.screenshotDropHeader}>
                    <ImagePlus size={18} color="var(--primary-neon)" />
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
                  <AlertTriangle size={14} color="var(--accent-rust)" style={{ marginRight: '4px' }} />
                  Flag this bug as a <strong>Blocker</strong>
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
                  {activeBug.project ? activeBug.project.name : 'Unknown Project'} • {formatBugKey(activeBug)}
                </span>
                <h3 style={styles.modalTitle}>{activeBug.title}</h3>
              </div>
              <button style={styles.closeBtn} onClick={() => setShowDetailModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.detailSection}>
                <h4 style={styles.detailTitle}>Steps to Reproduce / Description</h4>
                <p style={styles.detailDescText}>{activeBug.description || "No description provided."}</p>
              </div>

              <div style={styles.detailSection}>
                <h4 style={styles.detailTitle}>Expectations</h4>
                <p style={styles.detailDescText}>{activeBug.expected_behavior || "No expectations noted."}</p>
              </div>

              <div style={styles.row}>
                {/* Status Dropdown */}
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Status</label>
                  <select
                    value={activeBug.status}
                    disabled={!canEditFields}
                    onChange={(e) => handleBugFieldUpdate(activeBug.id, { status: e.target.value })}
                    style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
                  >
                    {bugStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {/* Severity Dropdown */}
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Severity</label>
                  <select
                    value={activeBug.severity}
                    disabled={!canEditFields}
                    onChange={(e) => handleBugFieldUpdate(activeBug.id, { severity: e.target.value })}
                    style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
                  >
                    {SEVERITIES.map(sev => <option key={sev} value={sev}>{sev}</option>)}
                  </select>
                </div>
                {/* Priority Dropdown */}
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Priority</label>
                  <select
                    value={activeBug.priority}
                    disabled={!canEditFields}
                    onChange={(e) => handleBugFieldUpdate(activeBug.id, { priority: e.target.value })}
                    style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
                  >
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                {/* Type Dropdown */}
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Type</label>
                  <select
                    value={activeBug.bug_type}
                    disabled={!canEditFields}
                    onChange={(e) => handleBugFieldUpdate(activeBug.id, { bug_type: e.target.value })}
                    style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
                  >
                    {BUG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div style={styles.row}>
                {/* Owner Dropdown */}
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.modalLabel}>Owner</label>
                  <select
                    value={activeBug.owner_id || ''}
                    disabled={!canEditFields}
                    onChange={(e) => handleBugFieldUpdate(activeBug.id, { owner_id: e.target.value ? parseInt(e.target.value) : -1 })}
                    style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
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
                      disabled={!canEditFields}
                      onChange={(e) => handleBugFieldUpdate(activeBug.id, { is_blocker: e.target.checked })}
                      style={styles.checkbox}
                    />
                    <label htmlFor="detail-is-blocker" style={styles.checkboxLabel}>
                      Blocker Ticket
                    </label>
                  </div>
                </div>
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

              {canEdit && (
                <div style={styles.detailSection}>
                  <h4 style={styles.detailTitle}>{activeBug.screenshot_url ? 'Replace Screenshot' : 'Add Screenshot'}</h4>
                  <div
                    style={styles.screenshotDropZone}
                    onPaste={handleDetailScreenshotPaste}
                    tabIndex={0}
                  >
                    <div style={styles.screenshotDropHeader}>
                      <ImagePlus size={18} color="var(--primary-neon)" />
                      <span>Paste an image here or choose a file</span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => uploadDetailScreenshot(e.target.files?.[0])}
                      style={styles.fileInput}
                    />
                    <div style={styles.pasteHint}>
                      <Clipboard size={12} />
                      Ctrl+V supports copied screenshots from your clipboard.
                    </div>
                  </div>
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
  addBtn: {
    width: '48px',
    height: '48px',
    padding: 0,
    background: 'var(--header-banner-cta-bg)',
    color: 'var(--header-banner-cta-color)',
    borderRadius: 'var(--border-radius-sm)',
    flexShrink: 0,
  },
  filtersRow: {
    display: 'flex',
    gap: '16px',
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
    fontWeight: '700',
    color: 'var(--header-banner-label)',
  },
  filterSelect: {
    padding: '8px 12px',
    background: 'var(--header-banner-input-bg)',
    border: '2px solid var(--header-banner-input-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--header-banner-input-color)',
    outline: 'none',
    fontSize: '14px',
  },
  searchRow: {
    marginBottom: '14px',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'var(--header-banner-input-bg)',
    border: '2px solid var(--header-banner-input-border)',
    borderRadius: 'var(--border-radius-sm)',
    maxWidth: '420px',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--header-banner-input-color)',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  searchClearBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: 'var(--header-banner-input-color)',
    cursor: 'pointer',
    padding: '2px',
  },
  clearFiltersBtn: {
    alignSelf: 'flex-end',
    fontSize: '13px',
    padding: '8px 14px',
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
    minWidth: '1100px',
    width: '100%',
  },
  column: {
    flex: 1,
    padding: '16px',
    minWidth: '200px',
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
    borderBottom: '2px solid var(--glass-border)',
    paddingBottom: '10px',
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
    fontSize: '12px',
    padding: '20px 0',
    border: '2px dashed var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  card: {
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  cardDraggable: {
    cursor: 'grab',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardKey: {
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--text-muted)',
  },
  cardBadgeGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  sevBadge: {
    fontSize: '9px',
    padding: '2px 6px',
    borderRadius: 'var(--border-radius-sm)',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-strong)',
    lineHeight: '1.4',
  },
  bugTypeTag: {
    fontSize: '9px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '1px 5px',
    display: 'inline-block',
    width: 'fit-content',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTop: '2px solid var(--glass-border)',
    paddingTop: '8px',
  },
  ownerText: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  blockerTag: {
    background: 'var(--danger-bg)',
    color: 'var(--danger-text)',
    border: '2px solid var(--danger-border)',
    padding: '1px 4px',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '9px',
    fontWeight: '700',
    display: 'inline-flex',
    alignItems: 'center',
  },
  loading: {
    textAlign: 'center',
    padding: '100px 0',
    color: 'var(--text-muted)',
  },

  // Modals
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
  modalSubheading: {
    fontSize: '12px',
    color: 'var(--primary-neon)',
    fontWeight: '700',
    textTransform: 'uppercase',
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
  screenshotDropZone: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    background: 'var(--bg-tertiary)',
    border: '2px dashed var(--primary-border)',
    borderRadius: 'var(--border-radius-sm)',
    outline: 'none',
  },
  screenshotDropHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontWeight: '600',
  },
  fileInput: {
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  pasteHint: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: 'var(--text-subtle)',
    fontSize: '12px',
  },
  screenshotPreviewWrap: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    padding: '10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  screenshotPreview: {
    width: '92px',
    height: '60px',
    objectFit: 'cover',
    borderRadius: 'var(--border-radius-sm)',
    border: '2px solid var(--glass-border)',
  },
  screenshotPreviewMeta: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    color: 'var(--text-muted)',
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
    accentColor: 'var(--primary-neon)',
    cursor: 'pointer',
  },
  checkboxLabel: {
    fontSize: '14px',
    color: 'var(--text-main)',
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
    fontWeight: '700',
    color: 'var(--text-strong)',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'var(--font-display)',
  },
  detailDescText: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    lineHeight: '1.6',
    background: 'var(--bg-tertiary)',
    padding: '12px',
    borderRadius: 'var(--border-radius-sm)',
    border: '2px solid var(--glass-border)',
    whiteSpace: 'pre-wrap',
  },
  screenshotLink: {
    display: 'block',
  },
  detailScreenshot: {
    width: '100%',
    maxHeight: '320px',
    objectFit: 'contain',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--text-subtle)',
    borderBottom: '2px solid var(--glass-border)',
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
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
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
    borderTop: '2px solid var(--glass-border)',
    paddingTop: '16px',
  },
  noComments: {
    color: 'var(--text-subtle)',
    fontSize: '13px',
    textAlign: 'center',
    padding: '10px 0',
  },
  commentRow: {
    background: 'var(--bg-tertiary)',
    padding: '10px 12px',
    borderRadius: 'var(--border-radius-sm)',
    border: '2px solid var(--glass-border)',
  },
  commentMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginBottom: '4px',
  },
  commentTime: {
    color: 'var(--text-subtle)',
  },
  commentText: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: '1.4',
  }
};
