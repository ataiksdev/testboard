import React, { useState, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import {
  Bug as BugIcon, User as UserIcon, AlertTriangle, X, Search, RotateCcw, CheckSquare, Square,
  FolderKanban, GitBranch, Flame, Flag, Tag, Tags, Boxes, FilterX, Bookmark
} from 'lucide-react';
import { canManageBugs, canEditBugFields } from '../utils/roles';
import { BugCreateModal } from './BugCreateModal';
import { BugDetailModal } from './BugDetailModal';

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
  const [components, setComponents] = useState([]);
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
  const [filterComponentId, setFilterComponentId] = useState('');
  const [filterLabel, setFilterLabel] = useState('');

  // Saved filters
  const [savedFilters, setSavedFilters] = useState([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterShared, setNewFilterShared] = useState(false);

  // Bulk actions
  const [selectMode, setSelectMode] = useState(false);
  const [selectedBugIds, setSelectedBugIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkOwnerId, setBulkOwnerId] = useState('');

  // Drag and drop
  const [draggedBugId, setDraggedBugId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeBug, setActiveBug] = useState(null);
  const [bugProjId, setBugProjId] = useState(selectedProject ? selectedProject.id : '');

  const { token, API_URL, user } = useAuth();
  const canEdit = canManageBugs(user.role);
  const isDev = user.role === 'Dev';
  const bugStatusOptions = isDev ? DEV_ALLOWED_BUG_STATUSES : BUG_STATUSES;
  const canEditFields = canEditBugFields(user.role);
  const canDeleteAttachment = ['Admin', 'QA'].includes(user.role);

  useEffect(() => {
    if (selectedProject) {
      setFilterProjectId(selectedProject.id);
      setBugProjId(selectedProject.id);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchCoreData();
    fetchSavedFilters();
  }, []);

  useEffect(() => {
    fetchBugs();
  }, [filterProjectId]);

  useEffect(() => {
    if (filterProjectId) {
      fetchVersions(filterProjectId);
      fetchComponents(filterProjectId);
    } else {
      setVersions([]);
      setFilterVersionId('');
      setComponents([]);
      setFilterComponentId('');
    }
  }, [filterProjectId]);

  useEffect(() => {
    if (bugProjId) {
      fetchVersions(bugProjId);
      fetchComponents(bugProjId);
    }
  }, [bugProjId]);

  const authHeaders = { 'Authorization': `Bearer ${token}` };

  const fetchCoreData = async () => {
    try {
      const [projRes, userRes] = await Promise.all([
        fetch(`${API_URL}/api/projects`, { headers: authHeaders }),
        fetch(`${API_URL}/api/users`, { headers: authHeaders })
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

      const response = await fetch(url, { headers: authHeaders });
      if (response.ok) {
        setBugs(await response.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async (projId) => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${projId}/versions`, { headers: authHeaders });
      if (response.ok) setVersions(await response.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchComponents = async (projId) => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${projId}/components`, { headers: authHeaders });
      if (response.ok) setComponents(await response.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSavedFilters = async () => {
    try {
      const response = await fetch(`${API_URL}/api/bugs/saved-filters`, { headers: authHeaders });
      if (response.ok) setSavedFilters(await response.json());
    } catch (err) {
      console.error(err);
    }
  };

  const formatBugKey = (bug) => {
    if (!bug.project) return `BUG-${bug.id}`;
    const seq = bug.project_sequence != null ? bug.project_sequence : bug.id;
    return `${bug.project.key}-${String(seq).padStart(3, '0')}`;
  };

  const handleBugFieldUpdate = async (bugId, fields) => {
    try {
      const response = await fetch(`${API_URL}/api/bugs/${bugId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(fields)
      });
      if (!response.ok) throw new Error("Failed to update bug");
      const updatedBug = await response.json();
      setBugs(prev => prev.map(b => b.id === bugId ? updatedBug : b));
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
  };

  const handleBugUpdated = (updatedBug) => {
    setBugs(prev => prev.map(b => b.id === updatedBug.id ? updatedBug : b));
    setActiveBug(updatedBug);
  };

  const handleJumpToBug = async (bugSummary) => {
    try {
      const projId = bugSummary.project ? bugSummary.project.id : null;
      const url = projId ? `${API_URL}/api/bugs?project_id=${projId}` : `${API_URL}/api/bugs`;
      const res = await fetch(url, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        const found = data.find(b => b.id === bugSummary.id);
        if (found) {
          setActiveBug(found);
          setShowDetailModal(true);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveCurrentFilters = async () => {
    if (!newFilterName.trim()) return;
    try {
      const response = await fetch(`${API_URL}/api/bugs/saved-filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: newFilterName,
          is_shared: newFilterShared,
          filters: {
            project_id: filterProjectId || null,
            severity: filterSeverity || null,
            priority: filterPriority || null,
            bug_type: filterType || null,
            owner_id: filterOwnerId || null,
            component_id: filterComponentId || null,
            label: filterLabel || null,
            search: searchQuery || null,
          }
        })
      });
      if (!response.ok) throw new Error("Failed to save filter");
      setNewFilterName('');
      setNewFilterShared(false);
      setShowSaveForm(false);
      fetchSavedFilters();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleLoadFilter = (saved) => {
    const f = saved.filters || {};
    setFilterProjectId(f.project_id ? String(f.project_id) : '');
    setFilterSeverity(f.severity || '');
    setFilterPriority(f.priority || '');
    setFilterType(f.bug_type || '');
    setFilterOwnerId(f.owner_id ? String(f.owner_id) : '');
    setFilterComponentId(f.component_id ? String(f.component_id) : '');
    setFilterLabel(f.label || '');
    setSearchQuery(f.search || '');
  };

  const handleDeleteSavedFilter = async (id) => {
    try {
      await fetch(`${API_URL}/api/bugs/saved-filters/${id}`, { method: 'DELETE', headers: authHeaders });
      fetchSavedFilters();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleBugSelection = (bugId) => {
    setSelectedBugIds(prev => prev.includes(bugId) ? prev.filter(id => id !== bugId) : [...prev, bugId]);
  };

  const clearSelection = () => {
    setSelectedBugIds([]);
    setBulkStatus('');
    setBulkOwnerId('');
  };

  const handleBulkApply = async (fields) => {
    if (selectedBugIds.length === 0) return;
    try {
      const response = await fetch(`${API_URL}/api/bugs/bulk-update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ bug_ids: selectedBugIds, fields })
      });
      if (!response.ok) throw new Error("Bulk update failed");
      const result = await response.json();
      fetchBugs();
      clearSelection();
      if (result.failed && result.failed.length > 0) {
        alert(`${result.updated.length} bug(s) updated. ${result.failed.length} could not be updated:\n` +
          result.failed.map(f => `#${f.bug_id}: ${f.reason}`).join('\n'));
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
    if (filterComponentId && String(b.component_id || '') !== filterComponentId) return false;
    if (filterLabel.trim() && !(b.labels || []).some(l => l.toLowerCase().includes(filterLabel.trim().toLowerCase()))) return false;
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

        <div style={styles.toolbarRow}>
          <div style={styles.searchBox}>
            <Search size={15} color="var(--text-subtle)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search bugs..."
              style={styles.searchInput}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={styles.searchClearBtn}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div style={styles.iconFilterGroup} title="Filter by project">
            <FolderKanban size={14} color="var(--header-banner-label)" />
            <select
              value={filterProjectId}
              onChange={(e) => {
                setFilterProjectId(e.target.value);
                if (onClearProjectFilter && e.target.value === '') {
                  onClearProjectFilter();
                }
              }}
              style={styles.iconFilterSelect}
            >
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
            </select>
          </div>

          {filterProjectId && (
            <div style={styles.iconFilterGroup} title="Filter by version">
              <GitBranch size={14} color="var(--header-banner-label)" />
              <select
                value={filterVersionId}
                onChange={(e) => setFilterVersionId(e.target.value)}
                style={styles.iconFilterSelect}
              >
                <option value="">All Versions</option>
                {versions.map(v => <option key={v.id} value={v.id}>{v.version_name}</option>)}
              </select>
            </div>
          )}

          <div style={styles.iconFilterGroup} title="Filter by severity">
            <Flame size={14} color="var(--header-banner-label)" />
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              style={styles.iconFilterSelect}
            >
              <option value="">All Severities</option>
              {SEVERITIES.map(sev => <option key={sev} value={sev}>{sev}</option>)}
            </select>
          </div>

          <div style={styles.iconFilterGroup} title="Filter by priority">
            <Flag size={14} color="var(--header-banner-label)" />
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              style={styles.iconFilterSelect}
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={styles.iconFilterGroup} title="Filter by type">
            <Tag size={14} color="var(--header-banner-label)" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={styles.iconFilterSelect}
            >
              <option value="">All Types</option>
              {BUG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div style={styles.iconFilterGroup} title="Filter by owner">
            <UserIcon size={14} color="var(--header-banner-label)" />
            <select
              value={filterOwnerId}
              onChange={(e) => setFilterOwnerId(e.target.value)}
              style={styles.iconFilterSelect}
            >
              <option value="">All Owners</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>

          {filterProjectId && (
            <div style={styles.iconFilterGroup} title="Filter by component">
              <Boxes size={14} color="var(--header-banner-label)" />
              <select
                value={filterComponentId}
                onChange={(e) => setFilterComponentId(e.target.value)}
                style={styles.iconFilterSelect}
              >
                <option value="">All Components</option>
                {components.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div style={styles.iconFilterGroup} title="Filter by label">
            <Tags size={14} color="var(--header-banner-label)" />
            <input
              type="text"
              value={filterLabel}
              onChange={(e) => setFilterLabel(e.target.value)}
              placeholder="Label..."
              style={{ ...styles.iconFilterSelect, maxWidth: '80px' }}
            />
          </div>

          <div style={styles.toolbarActions}>
            {(searchQuery || filterSeverity || filterPriority || filterType || filterOwnerId || filterVersionId || filterComponentId || filterLabel) && (
              <button
                type="button"
                style={styles.iconActionBtn}
                title="Clear filters"
                aria-label="Clear filters"
                onClick={() => {
                  setSearchQuery('');
                  setFilterSeverity('');
                  setFilterPriority('');
                  setFilterType('');
                  setFilterOwnerId('');
                  setFilterVersionId('');
                  setFilterComponentId('');
                  setFilterLabel('');
                }}
              >
                <FilterX size={16} />
              </button>
            )}
            <button
              type="button"
              style={styles.iconActionBtn}
              title="Save current filters"
              aria-label="Save current filters"
              onClick={() => setShowSaveForm(!showSaveForm)}
            >
              <Bookmark size={16} />
            </button>
            {canEdit && (
              <button
                type="button"
                style={{ ...styles.iconActionBtn, ...(selectMode ? styles.iconActionBtnActive : {}) }}
                title={selectMode ? 'Exit select mode' : 'Select multiple bugs'}
                aria-label={selectMode ? 'Exit select mode' : 'Select multiple bugs'}
                onClick={() => { setSelectMode(!selectMode); clearSelection(); }}
              >
                {selectMode ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
            )}
          </div>
        </div>

        {(savedFilters.length > 0 || showSaveForm) && (
          <div style={styles.savedFiltersRow}>
            {savedFilters.map(sf => (
              <div key={sf.id} style={styles.savedFilterChip}>
                <button type="button" style={styles.savedFilterBtn} onClick={() => handleLoadFilter(sf)}>
                  {sf.name}{sf.is_shared ? ' (shared)' : ''}
                </button>
                <button type="button" style={styles.savedFilterRemove} onClick={() => handleDeleteSavedFilter(sf.id)}>
                  <X size={10} />
                </button>
              </div>
            ))}
            {showSaveForm && (
              <div style={styles.saveFilterForm}>
                <input
                  type="text"
                  value={newFilterName}
                  onChange={(e) => setNewFilterName(e.target.value)}
                  placeholder="View name..."
                  style={styles.saveFilterInput}
                  autoFocus
                />
                {user.role !== 'Guest' && (
                  <label style={styles.saveFilterSharedLabel}>
                    <input type="checkbox" checked={newFilterShared} onChange={(e) => setNewFilterShared(e.target.checked)} />
                    Shared
                  </label>
                )}
                <button type="button" className="btn-primary" style={styles.saveFilterSubmit} onClick={handleSaveCurrentFilters}>Save</button>
                <button type="button" className="btn-secondary" style={styles.saveFilterSubmit} onClick={() => setShowSaveForm(false)}>Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Board */}
      <div style={styles.boardScrollContainer}>
        <div style={styles.board}>
          {BUG_STATUSES.map(status => {
            const statusBugs = filteredBugs.filter(b => b.status === status);
            const isDroppable = canEditFields && !selectMode && bugStatusOptions.includes(status);
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
                        ...(canEditFields && !selectMode ? styles.cardDraggable : {}),
                        opacity: draggedBugId === bug.id ? 0.4 : 1,
                      }}
                      draggable={canEditFields && !selectMode}
                      onDragStart={(e) => {
                        setDraggedBugId(bug.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(bug.id));
                      }}
                      onDragEnd={() => { setDraggedBugId(null); setDragOverStatus(null); }}
                      onClick={() => selectMode ? toggleBugSelection(bug.id) : handleOpenDetail(bug)}
                      className="animate-slide-up"
                    >
                      <div style={styles.cardHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {selectMode && (
                            <input
                              type="checkbox"
                              checked={selectedBugIds.includes(bug.id)}
                              onChange={() => {}}
                              onClick={(e) => { e.stopPropagation(); toggleBugSelection(bug.id); }}
                              style={styles.selectCheckbox}
                            />
                          )}
                          <span style={styles.cardKey}>
                            {formatBugKey(bug)}
                          </span>
                        </div>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {bug.bug_type && (
                          <span style={styles.bugTypeTag}>{bug.bug_type}</span>
                        )}
                        {bug.reopen_count > 0 && (
                          <span style={styles.reopenedTag}>
                            <RotateCcw size={9} style={{ marginRight: '2px' }} />
                            Reopened ×{bug.reopen_count}
                          </span>
                        )}
                      </div>
                      {bug.labels && bug.labels.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          {bug.labels.map(name => (
                            <span key={name} style={styles.cardLabelChip}>{name}</span>
                          ))}
                        </div>
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

      {selectMode && selectedBugIds.length > 0 && (
        <div style={styles.bulkActionBar}>
          <span style={styles.bulkCount}>{selectedBugIds.length} selected</span>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} style={styles.bulkSelect}>
            <option value="">Set status...</option>
            {BUG_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="button"
            className="btn-secondary"
            disabled={!bulkStatus}
            onClick={() => handleBulkApply({ status: bulkStatus })}
            style={styles.bulkApplyBtn}
          >
            Apply Status
          </button>
          <select value={bulkOwnerId} onChange={(e) => setBulkOwnerId(e.target.value)} style={styles.bulkSelect}>
            <option value="">Set owner...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <button
            type="button"
            className="btn-secondary"
            disabled={!bulkOwnerId}
            onClick={() => handleBulkApply({ owner_id: parseInt(bulkOwnerId) })}
            style={styles.bulkApplyBtn}
          >
            Apply Owner
          </button>
          <button type="button" className="btn-secondary" onClick={clearSelection} style={styles.bulkApplyBtn}>
            Clear
          </button>
        </div>
      )}

      {showCreateModal && (
        <BugCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchBugs(); }}
          projects={projects}
          versions={versions}
          components={components}
          users={users}
          bugProjId={bugProjId}
          setBugProjId={setBugProjId}
          token={token}
          API_URL={API_URL}
        />
      )}

      {showDetailModal && activeBug && (
        <BugDetailModal
          bug={activeBug}
          onClose={() => setShowDetailModal(false)}
          onUpdated={handleBugUpdated}
          onJumpToBug={handleJumpToBug}
          canEditFields={canEditFields}
          canEdit={canEdit}
          canDeleteAttachment={canDeleteAttachment}
          bugStatusOptions={bugStatusOptions}
          components={components}
          users={users}
          currentUserId={user.id}
          token={token}
          API_URL={API_URL}
          formatBugKey={formatBugKey}
        />
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
  toolbarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 10px',
    background: 'var(--header-banner-input-bg)',
    border: '2px solid var(--header-banner-input-border)',
    borderRadius: 'var(--border-radius-sm)',
    width: '160px',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--header-banner-input-color)',
    fontSize: '13px',
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
    flexShrink: 0,
  },
  iconFilterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 10px',
    background: 'var(--header-banner-input-bg)',
    border: '2px solid var(--header-banner-input-border)',
    borderRadius: 'var(--border-radius-sm)',
    flexShrink: 0,
  },
  iconFilterSelect: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--header-banner-input-color)',
    fontSize: '13px',
    maxWidth: '110px',
  },
  toolbarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginLeft: 'auto',
  },
  iconActionBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
    background: 'var(--header-banner-input-bg)',
    border: '2px solid var(--header-banner-input-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--header-banner-input-color)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  iconActionBtnActive: {
    background: 'var(--primary-neon)',
    borderColor: 'var(--primary-neon)',
    color: '#12100d',
  },
  savedFiltersRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '12px',
  },
  savedFilterChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'var(--header-banner-input-bg)',
    border: '2px solid var(--header-banner-input-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '4px 4px 4px 10px',
  },
  savedFilterBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--header-banner-input-color)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '2px 0',
  },
  savedFilterRemove: {
    background: 'none',
    border: 'none',
    color: 'var(--header-banner-input-color)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    opacity: 0.7,
  },
  saveFilterForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  saveFilterInput: {
    padding: '6px 10px',
    background: 'var(--header-banner-input-bg)',
    border: '2px solid var(--header-banner-input-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--header-banner-input-color)',
    outline: 'none',
    fontSize: '12px',
  },
  saveFilterSharedLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: 'var(--header-banner-label)',
  },
  saveFilterSubmit: {
    fontSize: '12px',
    padding: '6px 10px',
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
  selectCheckbox: {
    width: '14px',
    height: '14px',
    accentColor: 'var(--primary-neon)',
    cursor: 'pointer',
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
  cardLabelChip: {
    fontSize: '9px',
    fontWeight: '600',
    color: 'var(--primary-neon)',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '1px 5px',
    textTransform: 'lowercase',
  },
  reopenedTag: {
    fontSize: '9px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#12100d',
    background: 'var(--accent-mustard)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '1px 5px',
    display: 'inline-flex',
    alignItems: 'center',
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
  bulkActionBar: {
    position: 'sticky',
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '12px 16px',
    marginTop: '12px',
    boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
    flexWrap: 'wrap',
  },
  bulkCount: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-strong)',
  },
  bulkSelect: {
    padding: '8px 10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    fontSize: '13px',
  },
  bulkApplyBtn: {
    fontSize: '12px',
    padding: '8px 12px',
  },
};
