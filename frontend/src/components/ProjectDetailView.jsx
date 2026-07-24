import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Pencil, Users, UserPlus, X, GitBranch, Tag as TagIcon,
  FileText, Download, Trash2, Upload, MessageSquare, Building2, UserCheck,
  Briefcase, BarChart3, ChevronRight
} from 'lucide-react';
import { useToast } from './Toast';

const BUG_STATUSES = ["Open", "In Progress", "Resolved", "In QA", "Closed"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const BUG_STATUS_VAR = {
  "Open": "--bug-open",
  "In Progress": "--bug-inprogress",
  "In QA": "--bug-inqa",
  "Resolved": "--bug-resolved",
  "Closed": "--bug-closed",
};

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ProjectDetailView = ({
  project,
  users,
  bugs,
  qaLeadOptions,
  pmLeadOptions,
  canEdit,
  canEditMembers,
  token,
  API_URL,
  onBack,
  onProjectUpdated,
  onStatusChange,
  onSelectProject,
  uploadDocumentToProject,
  documentTypes,
  projectStatuses,
}) => {
  const [activeTab, setActiveTab] = useState('overview');

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editKey, setEditKey] = useState('');
  const [editVendor, setEditVendor] = useState('');
  const [editLeadId, setEditLeadId] = useState('');
  const [editPmLeadId, setEditPmLeadId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Team
  const [projectMembers, setProjectMembers] = useState([]);
  const [addMemberId, setAddMemberId] = useState('');

  // Versions
  const [projectVersions, setProjectVersions] = useState([]);
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionComponent, setNewVersionComponent] = useState('');
  const [newVersionChangelogFile, setNewVersionChangelogFile] = useState(null);
  const [addingVersion, setAddingVersion] = useState(false);

  // Documents
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState('BRD');
  const [docFile, setDocFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // EOD comments
  const [projectComments, setProjectComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [mentionedUserIds, setMentionedUserIds] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);

  const { showSuccess, showError } = useToast();
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  useEffect(() => {
    setActiveTab('overview');
    setEditMode(false);
    setAddMemberId('');
    setNewVersionName('');
    setNewVersionComponent('');
    setNewVersionChangelogFile(null);
    setDocTitle('');
    setDocType('BRD');
    setDocFile(null);
    setNewCommentText('');
    setMentionedUserIds([]);
    setMentionQuery(null);
    fetchProjectComments();
    fetchProjectMembers();
    fetchProjectDocuments();
    fetchProjectVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const getFileUrl = (fileUrl) => {
    if (!fileUrl) return '';
    return fileUrl.startsWith('http') ? fileUrl : `${API_URL}${fileUrl}`;
  };

  const fetchProjectVersions = async () => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/versions`, { headers: authHeaders });
      if (response.ok) setProjectVersions(await response.json());
    } catch (err) { console.error(err); }
  };

  const fetchProjectMembers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/members`, { headers: authHeaders });
      if (response.ok) setProjectMembers(await response.json());
    } catch (err) { console.error(err); }
  };

  const fetchProjectDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/documents`, { headers: authHeaders });
      if (response.ok) setProjectDocuments(await response.json());
    } catch (err) { console.error(err); }
  };

  const fetchProjectComments = async () => {
    try {
      const response = await fetch(`${API_URL}/api/comments?project_id=${project.id}`, { headers: authHeaders });
      if (response.ok) setProjectComments(await response.json());
    } catch (err) { console.error(err); }
  };

  const handleAddVersion = async (e) => {
    e.preventDefault();
    if (!newVersionName.trim()) return;
    try {
      setAddingVersion(true);
      const response = await fetch(`${API_URL}/api/projects/${project.id}/versions`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ version_name: newVersionName.trim(), status: 'Planning' })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to add version");
      }
      const version = await response.json();

      const componentNames = newVersionComponent.split(',').map(name => name.trim()).filter(Boolean);
      for (const name of componentNames) {
        await fetch(`${API_URL}/api/projects/${project.id}/components`, {
          method: 'POST', headers: jsonHeaders,
          body: JSON.stringify({ name })
        });
      }

      if (newVersionChangelogFile) {
        await uploadDocumentToProject(project.id, {
          file: newVersionChangelogFile,
          title: `${newVersionName.trim()} Changelog`,
          docType: 'Changelog',
          versionId: version.id
        });
      }

      setNewVersionName('');
      setNewVersionComponent('');
      setNewVersionChangelogFile(null);
      fetchProjectVersions();
      fetchProjectDocuments();
      showSuccess(`Version "${version.version_name}" added.`);
    } catch (err) {
      showError(err.message);
    } finally {
      setAddingVersion(false);
    }
  };

  const handleStartEdit = () => {
    setEditName(project.name);
    setEditKey(project.key);
    setEditVendor(project.vendor || '');
    setEditLeadId(project.lead_id || '');
    setEditPmLeadId(project.pm_lead_id || '');
    setEditDescription(project.description || '');
    setEditMode(true);
  };

  const handleSaveProjectEdit = async (e) => {
    e.preventDefault();
    try {
      setSavingEdit(true);
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, {
        method: 'PUT', headers: jsonHeaders,
        body: JSON.stringify({
          name: editName,
          key: editKey.toUpperCase(),
          vendor: editVendor.trim(),
          lead_id: editLeadId ? parseInt(editLeadId) : undefined,
          pm_lead_id: editPmLeadId ? parseInt(editPmLeadId) : undefined,
          description: editDescription
        })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to update project");
      }
      const updated = await response.json();
      onProjectUpdated(updated);
      setEditMode(false);
      showSuccess("Project updated successfully.");
    } catch (err) {
      showError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleUploadDocument = async (e) => {
    e.preventDefault();
    if (!docFile || !docTitle.trim()) return;
    try {
      setUploadingDoc(true);
      await uploadDocumentToProject(project.id, { file: docFile, title: docTitle.trim(), docType });
      setDocTitle('');
      setDocType('BRD');
      setDocFile(null);
      fetchProjectDocuments();
      showSuccess("Document uploaded successfully.");
    } catch (err) {
      showError(err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (documentId) => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/documents/${documentId}`, {
        method: 'DELETE', headers: authHeaders
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to delete document");
      }
      fetchProjectDocuments();
      showSuccess("Document deleted.");
    } catch (err) {
      showError(err.message);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!addMemberId) return;
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/members`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ user_id: parseInt(addMemberId) })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to add member");
      }
      setAddMemberId('');
      fetchProjectMembers();
      showSuccess("Team member added.");
    } catch (err) {
      showError(err.message);
    }
  };

  const handleRemoveMember = async (userId) => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}/members/${userId}`, {
        method: 'DELETE', headers: authHeaders
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to remove member");
      }
      fetchProjectMembers();
      showSuccess("Team member removed.");
    } catch (err) {
      showError(err.message);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      const response = await fetch(`${API_URL}/api/comments`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ project_id: project.id, text: newCommentText, mentioned_user_ids: mentionedUserIds })
      });
      if (response.ok) {
        setNewCommentText('');
        setMentionedUserIds([]);
        fetchProjectComments();
      } else {
        throw new Error("Failed to post update comment");
      }
    } catch (err) {
      showError(err.message);
    }
  };

  const handleCommentChange = (e) => {
    const value = e.target.value;
    setNewCommentText(value);
    const atIndex = value.lastIndexOf('@');
    if (atIndex === -1) {
      setMentionQuery(null);
      return;
    }
    const afterAt = value.slice(atIndex + 1);
    if (afterAt.includes('\n') || afterAt.length > 40) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(afterAt);
  };

  const mentionMatches = mentionQuery === null
    ? []
    : projectMembers.filter(m => m.user.full_name.toLowerCase().includes(mentionQuery.toLowerCase()));

  const selectMention = (member) => {
    const atIndex = newCommentText.lastIndexOf('@');
    const newText = `${newCommentText.slice(0, atIndex)}@${member.user.full_name} `;
    setNewCommentText(newText);
    setMentionQuery(null);
    setMentionedUserIds(prev => prev.includes(member.user.id) ? prev : [...prev, member.user.id]);
  };

  // Work metrics
  const projectBugs = bugs.filter(b => b.project_id === project.id);
  const openBugs = projectBugs.filter(b => !['Resolved', 'Closed'].includes(b.status));
  const resolvedBugs = projectBugs.filter(b => ['Resolved', 'Closed'].includes(b.status));
  const blockerBugs = openBugs.filter(b => b.is_blocker);
  const statusCounts = BUG_STATUSES.map(s => ({ status: s, count: projectBugs.filter(b => b.status === s).length }));
  const severityCounts = SEVERITIES.map(s => ({ severity: s, count: projectBugs.filter(b => b.severity === s).length }));
  const maxStatusCount = Math.max(1, ...statusCounts.map(s => s.count));
  const maxSeverityCount = Math.max(1, ...severityCounts.map(s => s.count));

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.headerBanner}>
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={onBack}>
            <ArrowLeft size={16} /> Back to Projects
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {canEdit && !editMode && (
              <button style={styles.editBtn} onClick={handleStartEdit} title="Edit project">
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>
        </div>
        <div style={styles.headerTitleSec}>
          <span style={styles.headerSubheading}>{project.key}</span>
          <h2 style={styles.title}>{project.name}</h2>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabRow}>
        <button
          style={{ ...styles.tabBtn, ...(activeTab === 'overview' ? styles.tabBtnActive : {}) }}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          style={{ ...styles.tabBtn, ...(activeTab === 'documents' ? styles.tabBtnActive : {}) }}
          onClick={() => setActiveTab('documents')}
        >
          <FileText size={13} style={{ marginRight: '5px' }} />
          Documents {projectDocuments.length > 0 ? `(${projectDocuments.length})` : ''}
        </button>
      </div>

      <div style={styles.body}>
        {activeTab === 'overview' && (
          <>
            {editMode ? (
              <form onSubmit={handleSaveProjectEdit} style={{ ...styles.modalForm, marginBottom: '24px' }}>
                <div style={styles.inputGroup}>
                  <label style={styles.modalLabel}>Project Name <span style={styles.requiredMark}>*</span></label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required style={styles.modalInput} />
                </div>
                <div style={styles.row}>
                  <div style={{ ...styles.inputGroup, flex: 1 }}>
                    <label style={styles.modalLabel}>Project Key</label>
                    <input type="text" value={editKey} onChange={(e) => setEditKey(e.target.value)} maxLength={5} required style={styles.modalInput} />
                  </div>
                  <div style={{ ...styles.inputGroup, flex: 1 }}>
                    <label style={styles.modalLabel}>Vendor/Developer</label>
                    <input type="text" value={editVendor} onChange={(e) => setEditVendor(e.target.value)} placeholder="e.g. Acme Software Inc." style={styles.modalInput} />
                  </div>
                </div>
                <div style={styles.row}>
                  <div style={{ ...styles.inputGroup, flex: 1 }}>
                    <label style={styles.modalLabel}>QA Lead</label>
                    <select value={editLeadId} onChange={(e) => setEditLeadId(e.target.value)} style={styles.modalSelect}>
                      <option value="">Unassigned</option>
                      {qaLeadOptions.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                  <div style={{ ...styles.inputGroup, flex: 1 }}>
                    <label style={styles.modalLabel}>PM Lead</label>
                    <select value={editPmLeadId} onChange={(e) => setEditPmLeadId(e.target.value)} style={styles.modalSelect}>
                      <option value="">Unassigned</option>
                      {pmLeadOptions.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                </div>
                <div style={styles.inputGroup}>
                  <label style={styles.modalLabel}>Description <span style={styles.requiredMark}>*</span></label>
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} required style={styles.modalTextarea} />
                </div>
                <div style={styles.modalActions}>
                  <button type="button" className="btn-secondary" onClick={() => setEditMode(false)} style={{ padding: '10px 20px' }}>Cancel</button>
                  <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }} disabled={savingEdit}>
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div style={styles.detailSection}>
                  <h4 style={styles.detailTitle}>QA status</h4>
                  <div style={styles.statusButtonsGroup}>
                    {projectStatuses.map(s => (
                      <button
                        key={s}
                        disabled={!canEdit}
                        onClick={() => canEdit && onStatusChange(project.id, s)}
                        style={{
                          ...styles.statusSelectorBtn,
                          borderColor: project.status === s ? `var(--status-${s.toLowerCase()})` : 'var(--glass-border)',
                          background: project.status === s ? 'var(--surface-hover)' : 'transparent',
                          color: project.status === s ? 'var(--text-strong)' : 'var(--text-muted)',
                          cursor: canEdit ? 'pointer' : 'default',
                          opacity: canEdit ? 1 : 0.7,
                        }}
                      >
                        <span style={{ ...styles.statusDot, background: `var(--status-${s.toLowerCase()})` }} />
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={styles.detailSection}>
                  <h4 style={styles.detailTitle}>QA Project Scope</h4>
                  <p style={styles.detailDescText}>{project.description || "No description provided."}</p>
                  <div style={styles.iconChipRow}>
                    <span style={styles.iconChip} title="Vendor/Developer">
                      <Building2 size={13} />
                      {project.vendor || 'No vendor specified'}
                    </span>
                    <span style={styles.iconChip} title="QA Lead">
                      <UserCheck size={13} />
                      {project.lead ? project.lead.full_name : 'No QA lead'}
                    </span>
                    <span style={styles.iconChip} title="PM Lead">
                      <Briefcase size={13} />
                      {project.pm_lead ? project.pm_lead.full_name : 'No PM lead'}
                    </span>
                  </div>
                </div>

                {/* Work Metrics */}
                <div style={styles.detailSection}>
                  <h4 style={styles.detailTitle}>
                    <BarChart3 size={16} style={{ marginRight: '6px' }} />
                    Work Metrics
                  </h4>
                  <div style={styles.metricsTileRow}>
                    <button
                      style={styles.metricsTileBtn}
                      onClick={() => onSelectProject(project)}
                      title="Go to Bugs Board"
                    >
                      <span style={styles.metricsTileValue}>{projectBugs.length}</span>
                      <span style={styles.metricsTileLabel}>Total Bugs <ChevronRight size={11} /></span>
                    </button>
                    <div style={styles.metricsTile}>
                      <span style={{ ...styles.metricsTileValue, color: openBugs.length > 0 ? 'var(--primary-neon)' : 'var(--text-strong)' }}>{openBugs.length}</span>
                      <span style={styles.metricsTileLabel}>Open</span>
                    </div>
                    <div style={styles.metricsTile}>
                      <span style={{ ...styles.metricsTileValue, color: blockerBugs.length > 0 ? 'var(--danger-text)' : 'var(--text-strong)' }}>{blockerBugs.length}</span>
                      <span style={styles.metricsTileLabel}>Blockers</span>
                    </div>
                    <div style={styles.metricsTile}>
                      <span style={styles.metricsTileValue}>{resolvedBugs.length}</span>
                      <span style={styles.metricsTileLabel}>Resolved</span>
                    </div>
                  </div>

                  {projectBugs.length > 0 && (
                    <div style={styles.metricsBreakdownRow}>
                      <div style={styles.metricsBreakdownCol}>
                        <span style={styles.metricsBreakdownTitle}>By Status</span>
                        {statusCounts.map(({ status, count }) => (
                          <div key={status} style={styles.metricsBarRow}>
                            <span style={styles.metricsBarLabel}>{status}</span>
                            <div style={styles.metricsBarTrack}>
                              <div style={{
                                ...styles.metricsBarFill,
                                width: `${(count / maxStatusCount) * 100}%`,
                                background: `var(${BUG_STATUS_VAR[status]})`
                              }} />
                            </div>
                            <span style={styles.metricsBarCount}>{count}</span>
                          </div>
                        ))}
                      </div>
                      <div style={styles.metricsBreakdownCol}>
                        <span style={styles.metricsBreakdownTitle}>By Severity</span>
                        {severityCounts.map(({ severity, count }) => (
                          <div key={severity} style={styles.metricsBarRow}>
                            <span style={styles.metricsBarLabel}>{severity}</span>
                            <div style={styles.metricsBarTrack}>
                              <div style={{
                                ...styles.metricsBarFill,
                                width: `${(count / maxSeverityCount) * 100}%`,
                                background: `var(--sev-${severity.toLowerCase()})`
                              }} />
                            </div>
                            <span style={styles.metricsBarCount}>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Team / Project Members Section */}
            <div style={styles.detailSection}>
              <h4 style={styles.detailTitle}>
                <Users size={16} style={{ marginRight: '6px' }} />
                Team ({projectMembers.length})
              </h4>
              <div style={styles.teamList}>
                {projectMembers.length === 0 ? (
                  <p style={styles.noComments}>No team members assigned yet.</p>
                ) : (
                  projectMembers.map(m => (
                    <div key={m.id} style={styles.teamRow}>
                      <span style={styles.teamName}>{m.user.full_name}</span>
                      <span style={styles.teamRole}>{m.user.role}</span>
                      {canEditMembers && (
                        <button style={styles.teamRemoveBtn} onClick={() => handleRemoveMember(m.user_id)} title="Remove from project">
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
              {canEditMembers && (
                <form onSubmit={handleAddMember} style={styles.addMemberForm}>
                  <select value={addMemberId} onChange={(e) => setAddMemberId(e.target.value)} style={{ ...styles.modalSelect, flex: 1 }}>
                    <option value="">Add a team member...</option>
                    {users.filter(u => !projectMembers.some(m => m.user_id === u.id)).map(u => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                    ))}
                  </select>
                  <button type="submit" className="btn-secondary" style={styles.addMemberBtn} disabled={!addMemberId}>
                    <UserPlus size={14} /> Add
                  </button>
                </form>
              )}
            </div>

            {/* Versions Section */}
            <div style={styles.detailSection}>
              <h4 style={styles.detailTitle}>
                <GitBranch size={16} style={{ marginRight: '6px' }} />
                Versions ({projectVersions.length})
              </h4>
              <div style={styles.teamList}>
                {projectVersions.length === 0 ? (
                  <p style={styles.noComments}>No versions added yet.</p>
                ) : (
                  projectVersions.map(v => (
                    <div key={v.id} style={styles.teamRow}>
                      <span style={styles.teamName}>{v.version_name}</span>
                      <span style={styles.teamRole}>{v.status}</span>
                    </div>
                  ))
                )}
              </div>
              {canEdit && (
                <form onSubmit={handleAddVersion} style={styles.docUploadForm}>
                  <div style={styles.row}>
                    <input
                      type="text"
                      value={newVersionName}
                      onChange={(e) => setNewVersionName(e.target.value)}
                      placeholder="Version number, e.g. v1.0, build 42"
                      style={{ ...styles.modalInput, flex: 1 }}
                    />
                    <input
                      type="text"
                      value={newVersionComponent}
                      onChange={(e) => setNewVersionComponent(e.target.value)}
                      placeholder="Feature(s), comma-separated (optional)"
                      style={{ ...styles.modalInput, flex: 1 }}
                    />
                  </div>
                  <div style={styles.row}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={styles.modalLabel}>
                        <TagIcon size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        Changelog document (optional)
                      </label>
                      <input
                        type="file"
                        onChange={(e) => setNewVersionChangelogFile(e.target.files?.[0] || null)}
                        style={styles.docFileInput}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp"
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn-secondary"
                      style={{ ...styles.addMemberBtn, alignSelf: 'flex-end' }}
                      disabled={!newVersionName.trim() || addingVersion}
                    >
                      {addingVersion ? 'Adding...' : 'Add Version'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Status Comments / Daily Updates Section */}
            <div style={styles.detailSection}>
              <h4 style={styles.detailTitle}>
                <MessageSquare size={16} style={{ marginRight: '6px' }} />
                End of Day & Status Updates
              </h4>
              <form onSubmit={handlePostComment} style={styles.commentForm}>
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={newCommentText}
                    onChange={handleCommentChange}
                    placeholder="Log status update, blocker warnings, or EOD notes... use @ to mention someone"
                    rows={2}
                    required
                    style={styles.commentInput}
                  />
                  {mentionQuery !== null && mentionMatches.length > 0 && (
                    <div style={styles.mentionDropdown}>
                      {mentionMatches.slice(0, 6).map(m => (
                        <div key={m.user.id} style={styles.mentionItem} onClick={() => selectMention(m)}>
                          {m.user.full_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button type="submit" className="btn-primary" style={styles.postBtn}>
                  Post Update
                </button>
              </form>
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
          </>
        )}

        {activeTab === 'documents' && (
          <div style={styles.detailSection}>
            <h4 style={styles.detailTitle}>
              <FileText size={16} style={{ marginRight: '6px' }} />
              Project Documents ({projectDocuments.length})
            </h4>
            <div style={styles.teamList}>
              {projectDocuments.length === 0 ? (
                <p style={styles.noComments}>No documents uploaded yet.</p>
              ) : (
                projectDocuments.map(doc => (
                  <div key={doc.id} style={styles.docRow}>
                    <span style={styles.docTypeBadge}>{doc.doc_type}</span>
                    <div style={styles.docInfo}>
                      <span style={styles.teamName}>{doc.title}</span>
                      <span style={styles.docMeta}>
                        {doc.original_filename} · {formatFileSize(doc.file_size)} · {doc.uploaded_by.full_name}
                        {doc.version_id && projectVersions.some(v => v.id === doc.version_id) && (
                          <> · {projectVersions.find(v => v.id === doc.version_id).version_name}</>
                        )}
                      </span>
                    </div>
                    <a href={getFileUrl(doc.file_url)} target="_blank" rel="noreferrer" style={styles.docActionBtn} title="Download">
                      <Download size={14} />
                    </a>
                    {canEdit && (
                      <button style={styles.teamRemoveBtn} onClick={() => handleDeleteDocument(doc.id)} title="Delete document">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            {canEdit && (
              <form onSubmit={handleUploadDocument} style={styles.docUploadForm}>
                <div style={styles.row}>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="Document title, e.g. BRD v2"
                    required
                    style={{ ...styles.modalInput, flex: 2 }}
                  />
                  <select value={docType} onChange={(e) => setDocType(e.target.value)} style={{ ...styles.modalSelect, flex: 1 }}>
                    {documentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={styles.row}>
                  <input
                    type="file"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    style={styles.docFileInput}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp"
                  />
                  <button type="submit" className="btn-secondary" style={styles.addMemberBtn} disabled={!docFile || !docTitle.trim() || uploadingDoc}>
                    <Upload size={14} /> {uploadingDoc ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '10px 0',
    display: 'flex',
    flexDirection: 'column',
  },
  headerBanner: {
    background: 'var(--header-banner-bg)',
    padding: 'var(--header-banner-padding)',
    borderRadius: 'var(--header-banner-radius)',
    marginBottom: '20px',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: 'none',
    color: 'var(--header-banner-subtitle)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: 0,
  },
  editBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--header-banner-input-bg)',
    border: '2px solid var(--header-banner-input-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--header-banner-input-color)',
    cursor: 'pointer',
  },
  headerTitleSec: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  headerSubheading: {
    fontSize: '12px',
    color: 'var(--header-banner-subtitle)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  title: {
    fontSize: '26px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: 'var(--header-banner-title)',
  },
  tabRow: {
    display: 'flex',
    gap: '6px',
    borderBottom: '2px solid var(--glass-border)',
    marginBottom: '24px',
    flexShrink: 0,
  },
  tabBtn: {
    display: 'flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    borderBottom: '3px solid transparent',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    marginBottom: '-2px',
  },
  tabBtnActive: {
    color: 'var(--text-strong)',
    borderBottomColor: 'var(--primary-neon)',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    maxWidth: '760px',
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
    borderWidth: '2px',
    borderStyle: 'solid',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  detailDescText: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    lineHeight: '1.6',
    background: 'var(--bg-tertiary)',
    padding: '12px',
    borderRadius: 'var(--border-radius-sm)',
    border: '2px solid var(--glass-border)',
    marginBottom: '10px',
  },
  iconChipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  iconChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
  },

  // Work metrics
  metricsTileRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
    marginBottom: '16px',
  },
  metricsTile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '14px 8px',
  },
  metricsTileBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '14px 8px',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
  },
  metricsTileValue: {
    fontSize: '22px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-strong)',
  },
  metricsTileLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  metricsBreakdownRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
  },
  metricsBreakdownCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  metricsBreakdownTitle: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: '4px',
  },
  metricsBarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  metricsBarLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    width: '72px',
    flexShrink: 0,
  },
  metricsBarTrack: {
    flex: 1,
    height: '8px',
    background: 'var(--bg-tertiary)',
    borderRadius: 'var(--border-radius-sm)',
    overflow: 'hidden',
  },
  metricsBarFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  metricsBarCount: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-main)',
    width: '18px',
    textAlign: 'right',
    flexShrink: 0,
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
    width: '100%',
    boxSizing: 'border-box',
  },
  mentionDropdown: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: '4px',
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    maxHeight: '160px',
    overflowY: 'auto',
    zIndex: 5,
    minWidth: '200px',
  },
  mentionItem: {
    padding: '8px 10px',
    fontSize: '13px',
    color: 'var(--text-main)',
    cursor: 'pointer',
    borderBottom: '1px solid var(--glass-border)',
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
  },

  // Team section
  teamList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '12px',
  },
  teamRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  teamName: {
    flex: 1,
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  teamRole: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
  },
  teamRemoveBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-subtle)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  addMemberForm: {
    display: 'flex',
    gap: '8px',
  },
  addMemberBtn: {
    padding: '8px 12px',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },

  // Documents section
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
  docActionBtn: {
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  docUploadForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '4px',
  },
  docFileInput: {
    flex: 1,
    fontSize: '13px',
    color: 'var(--text-muted)',
  },

  // Edit form (shared with ProjectTracker's create form look)
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
};
