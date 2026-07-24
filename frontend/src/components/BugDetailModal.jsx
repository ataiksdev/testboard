import React, { useState, useEffect } from 'react';
import {
  MessageSquare, X, Eye, ImagePlus, Clipboard, Link as LinkIcon, RotateCcw, Tags, ChevronDown, History as HistoryIcon
} from 'lucide-react';
import { useToast } from './Toast';

const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const BUG_TYPES = ["Functional", "Security", "Usability", "Regression", "Performance", "Other"];
const ENVIRONMENTS = ["Live", "Test", "Staging"];
const LINK_TYPES = [
  { value: 'relates_to', label: 'Relates to' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'duplicate_of', label: 'Duplicate of' },
];
const LINK_TYPE_LABELS = {
  relates_to: { outgoing: 'Relates to', incoming: 'Related from' },
  blocks: { outgoing: 'Blocks', incoming: 'Blocked by' },
  duplicate_of: { outgoing: 'Duplicate of', incoming: 'Duplicated by' },
};

const ACTIVITY_FIELD_LABELS = {
  title: 'title',
  description: 'description',
  expected_behavior: 'expected behavior',
  environment: 'environment',
  environment_details: 'environment details',
  severity: 'severity',
  priority: 'priority',
  bug_type: 'type',
  is_blocker: 'blocker flag',
  version: 'target version',
  owner: 'owner',
  components: 'components',
};

const readImageFile = (file, onLoaded) => {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert("Attachment must be an image file");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("Attachment must be 5 MB or smaller");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onLoaded(reader.result, file.name || 'Pasted screenshot');
  reader.readAsDataURL(file);
};

export const BugDetailModal = ({
  bug,
  onClose,
  onUpdated,
  onJumpToBug,
  canEditFields,
  canEdit,
  canDeleteAttachment,
  bugStatusOptions,
  components,
  users,
  currentUserId,
  token,
  API_URL,
  formatBugKey,
}) => {
  const [bugComments, setBugComments] = useState([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [mentionedUserIds, setMentionedUserIds] = useState([]);
  const [commentAttachment, setCommentAttachment] = useState(null); // {dataUrl, name}
  const [mentionQuery, setMentionQuery] = useState(null);

  const [attachments, setAttachments] = useState(bug.attachments || []);
  const [links, setLinks] = useState([]);
  const [watchers, setWatchers] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [projectBugs, setProjectBugs] = useState([]);

  const [linkSearch, setLinkSearch] = useState('');
  const [linkType, setLinkType] = useState('relates_to');
  const [selectedLinkBugId, setSelectedLinkBugId] = useState('');

  const [labels, setLabels] = useState([]);
  const [labelSuggestions, setLabelSuggestions] = useState([]);
  const [newLabelInput, setNewLabelInput] = useState('');
  const [showComponentDropdown, setShowComponentDropdown] = useState(false);
  const [showLabelSuggestions, setShowLabelSuggestions] = useState(false);
  const [activityTab, setActivityTab] = useState('comments'); // 'comments' | 'history'
  const [activityHistory, setActivityHistory] = useState([]);

  const { showError } = useToast();
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  useEffect(() => {
    setAttachments(bug.attachments || []);
    setActivityTab('comments');
    fetchComments();
    fetchLinks();
    fetchWatchers();
    fetchProjectMembers();
    fetchProjectBugs();
    fetchLabels();
    fetchLabelSuggestions();
    fetchActivityHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bug.id]);

  const fetchComments = async () => {
    try {
      const res = await fetch(`${API_URL}/api/comments?bug_id=${bug.id}`, { headers: authHeaders });
      if (res.ok) setBugComments(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchLinks = async () => {
    try {
      const res = await fetch(`${API_URL}/api/bugs/${bug.id}/links`, { headers: authHeaders });
      if (res.ok) setLinks(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchWatchers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/bugs/${bug.id}/watchers`, { headers: authHeaders });
      if (res.ok) setWatchers(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchProjectMembers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${bug.project_id}/members`, { headers: authHeaders });
      if (res.ok) setProjectMembers((await res.json()).map(m => m.user));
    } catch (err) { console.error(err); }
  };

  const fetchProjectBugs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/bugs?project_id=${bug.project_id}`, { headers: authHeaders });
      if (res.ok) setProjectBugs((await res.json()).filter(b => b.id !== bug.id));
    } catch (err) { console.error(err); }
  };

  const fetchLabels = async () => {
    try {
      const res = await fetch(`${API_URL}/api/bugs/${bug.id}/labels`, { headers: authHeaders });
      if (res.ok) setLabels(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchLabelSuggestions = async () => {
    try {
      const res = await fetch(`${API_URL}/api/projects/${bug.project_id}/labels/suggestions`, { headers: authHeaders });
      if (res.ok) setLabelSuggestions(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchActivityHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/api/bugs/${bug.id}/activity`, { headers: authHeaders });
      if (res.ok) setActivityHistory(await res.json());
    } catch (err) { console.error(err); }
  };

  const handleFieldUpdate = async (fields) => {
    try {
      const res = await fetch(`${API_URL}/api/bugs/${bug.id}`, {
        method: 'PUT', headers: jsonHeaders, body: JSON.stringify(fields)
      });
      if (!res.ok) throw new Error("Failed to update bug");
      onUpdated(await res.json());
      fetchActivityHistory();
    } catch (err) {
      showError(err.message);
    }
  };

  const projectComponents = (components || []).filter(c => c.project_id === bug.project_id);
  const selectedComponentIds = (bug.components || []).map(c => c.id);
  const toggleComponent = (id) => {
    const newIds = selectedComponentIds.includes(id)
      ? selectedComponentIds.filter(x => x !== id)
      : [...selectedComponentIds, id];
    handleFieldUpdate({ component_ids: newIds });
  };
  const selectedComponentNames = (bug.components || []).map(c => c.name);
  const componentButtonLabel = selectedComponentNames.length === 0
    ? 'None'
    : selectedComponentNames.length <= 2
      ? selectedComponentNames.join(', ')
      : `${selectedComponentNames.slice(0, 2).join(', ')} +${selectedComponentNames.length - 2} more`;

  const getFileUrl = (url) => url.startsWith('http') ? url : `${API_URL}${url}`;

  const stageCommentAttachment = (file) => {
    readImageFile(file, (dataUrl, name) => {
      setCommentAttachment({ dataUrl, name });
    });
  };

  const handleCommentAttachmentPaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    stageCommentAttachment(imageItem.getAsFile());
  };

  const deleteAttachment = async (attachmentId) => {
    try {
      const res = await fetch(`${API_URL}/api/bugs/${bug.id}/attachments/${attachmentId}`, {
        method: 'DELETE', headers: authHeaders
      });
      if (!res.ok) throw new Error("Failed to delete attachment");
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
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
    : projectMembers.filter(u => u.full_name.toLowerCase().includes(mentionQuery.toLowerCase()));

  const selectMention = (member) => {
    const atIndex = newCommentText.lastIndexOf('@');
    const newText = `${newCommentText.slice(0, atIndex)}@${member.full_name} `;
    setNewCommentText(newText);
    setMentionQuery(null);
    setMentionedUserIds(prev => prev.includes(member.id) ? prev : [...prev, member.id]);
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/comments`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ bug_id: bug.id, text: newCommentText, mentioned_user_ids: mentionedUserIds })
      });
      if (!res.ok) throw new Error("Failed to post update comment");
      const newComment = await res.json();

      if (commentAttachment) {
        try {
          const attRes = await fetch(`${API_URL}/api/comments/${newComment.id}/attachments`, {
            method: 'POST', headers: jsonHeaders,
            body: JSON.stringify({ screenshot_data: commentAttachment.dataUrl, filename: commentAttachment.name })
          });
          if (attRes.ok) {
            const newAttachment = await attRes.json();
            setAttachments(prev => [...prev, newAttachment]);
          }
        } catch (err) {
          console.error('Attachment upload failed', err);
        }
      }

      setNewCommentText('');
      setMentionedUserIds([]);
      setCommentAttachment(null);
      fetchComments();
    } catch (err) {
      showError(err.message);
    }
  };

  const isWatching = watchers.some(w => w.user.id === currentUserId);

  const toggleWatch = async () => {
    try {
      if (isWatching) {
        await fetch(`${API_URL}/api/bugs/${bug.id}/watch`, { method: 'DELETE', headers: authHeaders });
      } else {
        await fetch(`${API_URL}/api/bugs/${bug.id}/watch`, { method: 'POST', headers: authHeaders });
      }
      fetchWatchers();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleAddLink = async () => {
    if (!selectedLinkBugId) return;
    try {
      const res = await fetch(`${API_URL}/api/bugs/${bug.id}/links`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ related_bug_id: parseInt(selectedLinkBugId), link_type: linkType })
      });
      if (!res.ok) throw new Error("Failed to add link");
      setSelectedLinkBugId('');
      setLinkSearch('');
      fetchLinks();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleDeleteLink = async (linkId) => {
    try {
      const res = await fetch(`${API_URL}/api/bugs/${bug.id}/links/${linkId}`, { method: 'DELETE', headers: authHeaders });
      if (!res.ok) throw new Error("Failed to remove link");
      fetchLinks();
    } catch (err) {
      showError(err.message);
    }
  };

  const linkSearchMatches = linkSearch.trim()
    ? projectBugs.filter(b => b.title.toLowerCase().includes(linkSearch.trim().toLowerCase()))
    : [];

  const handleAddLabel = async (name) => {
    const trimmed = (name ?? newLabelInput).trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`${API_URL}/api/bugs/${bug.id}/labels`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ name: trimmed })
      });
      if (!res.ok) throw new Error("Failed to add label");
      setNewLabelInput('');
      setShowLabelSuggestions(false);
      fetchLabels();
      fetchLabelSuggestions();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleLabelKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddLabel();
    }
  };

  const handleDeleteLabel = async (labelId) => {
    try {
      const res = await fetch(`${API_URL}/api/bugs/${bug.id}/labels/${labelId}`, { method: 'DELETE', headers: authHeaders });
      if (!res.ok) throw new Error("Failed to remove label");
      setLabels(prev => prev.filter(l => l.id !== labelId));
    } catch (err) {
      showError(err.message);
    }
  };

  const canDeleteLabel = (label) => canEditFields || label.created_by_id === currentUserId;

  const labelMatches = newLabelInput.trim()
    ? labelSuggestions.filter(s =>
        s.toLowerCase().includes(newLabelInput.trim().toLowerCase()) &&
        !labels.some(l => l.name === s)
      )
    : [];

  const formatActivityEntry = (entry) => {
    const who = entry.user.full_name;
    switch (entry.activity_type) {
      case 'bug_created':
        return `${who} created this bug`;
      case 'bug_status_change':
        return `${who} changed status from ${entry.old_value} to ${entry.new_value}`;
      case 'bug_resolved':
        return `${who} resolved this bug (${entry.old_value} → ${entry.new_value})`;
      case 'bug_reopened':
        return `${who} reopened this bug (${entry.old_value} → ${entry.new_value})`;
      case 'comment_added':
        return `${who} added a comment: "${entry.new_value}"`;
      case 'bug_field_updated': {
        const label = ACTIVITY_FIELD_LABELS[entry.field_name] || entry.field_name;
        const oldVal = entry.old_value ?? 'None';
        const newVal = entry.new_value ?? 'None';
        return `${who} changed ${label} from "${oldVal}" to "${newVal}"`;
      }
      default:
        return `${who} ${entry.activity_type.replace(/_/g, ' ')}`;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ maxWidth: '600px' }}>
        <div style={styles.modalHeader}>
          <div>
            <span style={styles.modalSubheading}>
              {bug.project ? bug.project.name : 'Unknown Project'} • {formatBugKey(bug)}
              {bug.reopen_count > 0 && (
                <span style={styles.reopenedBadge}>
                  <RotateCcw size={10} style={{ marginRight: '3px' }} />
                  Reopened ×{bug.reopen_count}
                </span>
              )}
            </span>
            <input
              type="text"
              defaultValue={bug.title}
              disabled={!canEditFields}
              onBlur={(e) => {
                const trimmed = e.target.value.trim();
                if (trimmed && trimmed !== bug.title) handleFieldUpdate({ title: trimmed });
                else e.target.value = bug.title;
              }}
              style={{ ...styles.titleInput, opacity: canEditFields ? 1 : 0.7 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button type="button" onClick={toggleWatch} style={styles.watchBtn} title={isWatching ? 'Unwatch this bug' : 'Watch this bug'}>
              <Eye size={16} color={isWatching ? 'var(--primary-neon)' : 'var(--text-muted)'} />
              <span>{isWatching ? 'Watching' : 'Watch'}{watchers.length > 0 ? ` (${watchers.length})` : ''}</span>
            </button>
            <button style={styles.closeBtn} onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={styles.modalBody}>
          <div style={styles.detailSection}>
            <h4 style={styles.detailTitle}>Steps to Reproduce / Description</h4>
            <textarea
              defaultValue={bug.description || ''}
              disabled={!canEditFields}
              onBlur={(e) => { if (e.target.value !== (bug.description || '')) handleFieldUpdate({ description: e.target.value }); }}
              placeholder="No description provided."
              rows={3}
              style={{ ...styles.detailDescTextarea, opacity: canEditFields ? 1 : 0.7 }}
            />
          </div>

          <div style={styles.detailSection}>
            <h4 style={styles.detailTitle}>Expectations</h4>
            <textarea
              defaultValue={bug.expected_behavior || ''}
              disabled={!canEditFields}
              onBlur={(e) => { if (e.target.value !== (bug.expected_behavior || '')) handleFieldUpdate({ expected_behavior: e.target.value }); }}
              placeholder="No expectations noted."
              rows={2}
              style={{ ...styles.detailDescTextarea, opacity: canEditFields ? 1 : 0.7 }}
            />
          </div>

          <div style={styles.row}>
            <div style={{ ...styles.inputGroup, flex: 1 }}>
              <label style={styles.modalLabel}>Status</label>
              <select
                value={bug.status}
                disabled={!canEditFields}
                onChange={(e) => handleFieldUpdate({ status: e.target.value })}
                style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
              >
                {bugStatusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ ...styles.inputGroup, flex: 1 }}>
              <label style={styles.modalLabel}>Severity</label>
              <select
                value={bug.severity}
                disabled={!canEditFields}
                onChange={(e) => handleFieldUpdate({ severity: e.target.value })}
                style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
              >
                {SEVERITIES.map(sev => <option key={sev} value={sev}>{sev}</option>)}
              </select>
            </div>
            <div style={{ ...styles.inputGroup, flex: 1 }}>
              <label style={styles.modalLabel}>Priority</label>
              <select
                value={bug.priority}
                disabled={!canEditFields}
                onChange={(e) => handleFieldUpdate({ priority: e.target.value })}
                style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ ...styles.inputGroup, flex: 1 }}>
              <label style={styles.modalLabel}>Type</label>
              <select
                value={bug.bug_type}
                disabled={!canEditFields}
                onChange={(e) => handleFieldUpdate({ bug_type: e.target.value })}
                style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
              >
                {BUG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ ...styles.inputGroup, flex: 1, position: 'relative' }}>
              <label style={styles.modalLabel}>Features</label>
              <button
                type="button"
                disabled={!canEditFields}
                onClick={() => setShowComponentDropdown(v => !v)}
                onBlur={() => setTimeout(() => setShowComponentDropdown(false), 150)}
                style={{ ...styles.componentDropdownToggle, opacity: canEditFields ? 1 : 0.7 }}
              >
                <span style={styles.componentDropdownToggleLabel}>{componentButtonLabel}</span>
                <ChevronDown size={14} />
              </button>
              {showComponentDropdown && canEditFields && (
                <div style={styles.componentDropdownPanel} onMouseDown={(e) => e.preventDefault()}>
                  {projectComponents.length === 0 ? (
                    <div style={styles.componentDropdownEmpty}>No features for this project yet.</div>
                  ) : (
                    projectComponents.map(c => (
                      <label key={c.id} style={styles.componentDropdownItem}>
                        <input
                          type="checkbox"
                          checked={selectedComponentIds.includes(c.id)}
                          onChange={() => toggleComponent(c.id)}
                        />
                        {c.name}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={styles.row}>
            <div style={{ ...styles.inputGroup, flex: 1 }}>
              <label style={styles.modalLabel}>Environment</label>
              <select
                value={bug.environment || ''}
                disabled={!canEditFields}
                onChange={(e) => handleFieldUpdate({ environment: e.target.value })}
                style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
              >
                <option value="">Not specified</option>
                {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
              </select>
            </div>
            <div style={{ ...styles.inputGroup, flex: 2 }}>
              <label style={styles.modalLabel}>Environment Details</label>
              <input
                type="text"
                defaultValue={bug.environment_details || ''}
                disabled={!canEditFields}
                onBlur={(e) => { if (e.target.value !== (bug.environment_details || '')) handleFieldUpdate({ environment_details: e.target.value }); }}
                placeholder="e.g. Chrome 126 on Windows 11"
                style={{ ...styles.modalInput, opacity: canEditFields ? 1 : 0.7 }}
              />
            </div>
          </div>

          <div style={styles.row}>
            <div style={{ ...styles.inputGroup, flex: 1 }}>
              <label style={styles.modalLabel}>Owner</label>
              <select
                value={bug.owner_id || ''}
                disabled={!canEditFields}
                onChange={(e) => handleFieldUpdate({ owner_id: e.target.value ? parseInt(e.target.value) : -1 })}
                style={{ ...styles.modalSelect, opacity: canEditFields ? 1 : 0.7 }}
              >
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div style={{ ...styles.inputGroup, flex: 1, justifyContent: 'center' }}>
              <div style={styles.checkboxGroup}>
                <input
                  type="checkbox"
                  id="detail-is-blocker"
                  checked={bug.is_blocker}
                  disabled={!canEditFields}
                  onChange={(e) => handleFieldUpdate({ is_blocker: e.target.checked })}
                  style={styles.checkbox}
                />
                <label htmlFor="detail-is-blocker" style={styles.checkboxLabel}>
                  Blocker Ticket
                </label>
              </div>
            </div>
          </div>

          {attachments.length > 0 && (
            <div style={styles.detailSection}>
              <h4 style={styles.detailTitle}>Attachments ({attachments.length})</h4>
              <div style={styles.attachmentGrid}>
                {attachments.map(att => (
                  <div key={att.id} style={styles.attachmentTile}>
                    <a href={getFileUrl(att.file_url)} target="_blank" rel="noreferrer">
                      <img src={getFileUrl(att.file_url)} alt={att.original_filename} style={styles.attachmentThumb} />
                    </a>
                    {canDeleteAttachment && (
                      <button
                        type="button"
                        onClick={() => deleteAttachment(att.id)}
                        style={styles.attachmentDeleteBtn}
                        title="Delete attachment"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={styles.detailSection}>
            <h4 style={styles.detailTitle}>
              <LinkIcon size={16} style={{ marginRight: '6px' }} />
              Linked Bugs
            </h4>
            {links.length === 0 ? (
              <p style={styles.noComments}>No linked bugs yet.</p>
            ) : (
              <div style={styles.linksList}>
                {links.map(l => (
                  <div key={l.id} style={styles.linkRow}>
                    <span style={styles.linkTypeTag}>{LINK_TYPE_LABELS[l.link_type][l.direction]}</span>
                    <button
                      type="button"
                      style={styles.linkBugBtn}
                      onClick={() => onJumpToBug && onJumpToBug(l.related_bug)}
                    >
                      {l.related_bug.project ? `${l.related_bug.project.key}-${String(l.related_bug.project_sequence).padStart(3, '0')}` : `#${l.related_bug.id}`} {l.related_bug.title}
                    </button>
                    {canEdit && (
                      <button type="button" onClick={() => handleDeleteLink(l.id)} style={styles.linkRemoveBtn} title="Remove link">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canEdit && (
              <div style={styles.linkAddRow}>
                <input
                  type="text"
                  value={linkSearch}
                  onChange={(e) => { setLinkSearch(e.target.value); setSelectedLinkBugId(''); }}
                  placeholder="Search bugs in this project by title..."
                  style={styles.modalInput}
                />
                {linkSearchMatches.length > 0 && !selectedLinkBugId && (
                  <div style={styles.linkSuggestions}>
                    {linkSearchMatches.slice(0, 6).map(b => (
                      <div
                        key={b.id}
                        style={styles.linkSuggestionItem}
                        onClick={() => { setSelectedLinkBugId(String(b.id)); setLinkSearch(b.title); }}
                      >
                        {b.title}
                      </div>
                    ))}
                  </div>
                )}
                <div style={styles.row}>
                  <select value={linkType} onChange={(e) => setLinkType(e.target.value)} style={{ ...styles.modalSelect, flex: 1 }}>
                    {LINK_TYPES.map(lt => <option key={lt.value} value={lt.value}>{lt.label}</option>)}
                  </select>
                  <button type="button" className="btn-secondary" onClick={handleAddLink} disabled={!selectedLinkBugId} style={{ padding: '10px 16px' }}>
                    Add Link
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={styles.detailSection}>
            <h4 style={styles.detailTitle}>
              <Tags size={16} style={{ marginRight: '6px' }} />
              Labels
            </h4>
            <div style={styles.labelChipRow}>
              {labels.length === 0 && <p style={styles.noComments}>No labels yet.</p>}
              {labels.map(label => (
                <span key={label.id} style={styles.labelChip}>
                  {label.name}
                  {canDeleteLabel(label) && (
                    <button type="button" onClick={() => handleDeleteLabel(label.id)} style={styles.labelChipRemove} title="Remove label">
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {canEdit && (
              <div style={{ position: 'relative', maxWidth: '260px' }}>
                <input
                  type="text"
                  value={newLabelInput}
                  onChange={(e) => { setNewLabelInput(e.target.value); setShowLabelSuggestions(true); }}
                  onKeyDown={handleLabelKeyDown}
                  onFocus={() => setShowLabelSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowLabelSuggestions(false), 150)}
                  placeholder="Add label, press Enter"
                  style={styles.modalInput}
                />
                {showLabelSuggestions && labelMatches.length > 0 && (
                  <div style={styles.linkSuggestions}>
                    {labelMatches.slice(0, 6).map(name => (
                      <div key={name} style={styles.linkSuggestionItem} onClick={() => handleAddLabel(name)}>
                        {name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={styles.metaRow}>
            <span>Reported by: <strong>{bug.reporter.full_name}</strong></span>
            <span>Logged: {new Date(bug.created_at).toLocaleDateString()}</span>
          </div>

          <div style={styles.detailSection}>
            <div style={styles.activityTabRow}>
              <button
                type="button"
                style={{ ...styles.activityTabBtn, ...(activityTab === 'comments' ? styles.activityTabBtnActive : {}) }}
                onClick={() => setActivityTab('comments')}
              >
                <MessageSquare size={14} style={{ marginRight: '6px' }} />
                Comments
              </button>
              <button
                type="button"
                style={{ ...styles.activityTabBtn, ...(activityTab === 'history' ? styles.activityTabBtnActive : {}) }}
                onClick={() => setActivityTab('history')}
              >
                <HistoryIcon size={14} style={{ marginRight: '6px' }} />
                History
              </button>
            </div>

            {activityTab === 'history' ? (
              <div style={styles.historyList}>
                {activityHistory.length === 0 ? (
                  <p style={styles.noComments}>No history recorded yet.</p>
                ) : (
                  activityHistory.map(entry => (
                    <div key={entry.id} style={styles.historyRow}>
                      <span style={styles.historyText}>{formatActivityEntry(entry)}</span>
                      <span style={styles.commentTime}>
                        {new Date(entry.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : (
            <>
            <form onSubmit={handlePostComment} style={styles.commentForm} onPaste={handleCommentAttachmentPaste}>
              <div style={{ position: 'relative' }}>
                <textarea
                  value={newCommentText}
                  onChange={handleCommentChange}
                  placeholder="Log status update or diagnostic details for this bug... use @ to mention someone"
                  rows={2}
                  required
                  style={styles.commentInput}
                />
                {mentionQuery !== null && mentionMatches.length > 0 && (
                  <div style={styles.mentionDropdown}>
                    {mentionMatches.slice(0, 6).map(m => (
                      <div key={m.id} style={styles.mentionItem} onClick={() => selectMention(m)}>
                        {m.full_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={styles.commentAttachRow}>
                <label style={styles.commentAttachLabel}>
                  <ImagePlus size={14} color="var(--text-muted)" />
                  <span>Attach image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => stageCommentAttachment(e.target.files?.[0])}
                    style={{ display: 'none' }}
                  />
                </label>
                <Clipboard size={12} color="var(--text-subtle)" />
                <span style={styles.pasteHintInline}>Ctrl+V also works</span>
                {commentAttachment && (
                  <div style={styles.commentAttachPreview}>
                    <img src={commentAttachment.dataUrl} alt={commentAttachment.name} style={styles.commentAttachThumb} />
                    <button type="button" onClick={() => setCommentAttachment(null)} style={styles.commentAttachRemove}>
                      <X size={10} />
                    </button>
                  </div>
                )}
              </div>

              <button type="submit" className="btn-primary" style={styles.postBtn}>
                Post Update
              </button>
            </form>

            <div style={styles.commentsList}>
              {bugComments.length === 0 ? (
                <p style={styles.noComments}>No updates posted yet.</p>
              ) : (
                bugComments.map(comment => {
                  const commentAttachments = attachments.filter(a => a.comment_id === comment.id);
                  return (
                    <div key={comment.id} style={styles.commentRow}>
                      <div style={styles.commentMeta}>
                        <strong>{comment.user.full_name}</strong>
                        <span style={styles.commentTime}>
                          {new Date(comment.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p style={styles.commentText}>{comment.text}</p>
                      {commentAttachments.length > 0 && (
                        <div style={styles.commentAttachmentGrid}>
                          {commentAttachments.map(att => (
                            <a key={att.id} href={getFileUrl(att.file_url)} target="_blank" rel="noreferrer">
                              <img src={getFileUrl(att.file_url)} alt={att.original_filename} style={styles.commentAttachmentThumb} />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
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
  titleInput: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
    background: 'transparent',
    border: '2px solid transparent',
    borderRadius: 'var(--border-radius-sm)',
    padding: '2px 4px',
    marginLeft: '-4px',
    outline: 'none',
    width: '100%',
  },
  modalSubheading: {
    fontSize: '12px',
    color: 'var(--primary-neon)',
    fontWeight: '700',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  reopenedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'var(--accent-mustard)',
    color: '#12100d',
    padding: '1px 6px',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: '10px',
    fontWeight: '700',
    textTransform: 'none',
  },
  watchBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
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
  detailDescTextarea: {
    fontSize: '14px',
    color: 'var(--text-main)',
    lineHeight: '1.6',
    background: 'var(--bg-tertiary)',
    padding: '12px',
    borderRadius: 'var(--border-radius-sm)',
    border: '2px solid var(--glass-border)',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  },
  row: {
    display: 'flex',
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
  componentDropdownToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    padding: '10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    fontSize: '14px',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  },
  componentDropdownToggleLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  componentDropdownPanel: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    zIndex: 5,
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    maxHeight: '180px',
    overflowY: 'auto',
    padding: '4px',
  },
  componentDropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 8px',
    fontSize: '13px',
    color: 'var(--text-main)',
    cursor: 'pointer',
    borderRadius: 'var(--border-radius-sm)',
  },
  componentDropdownEmpty: {
    padding: '10px 8px',
    fontSize: '12px',
    color: 'var(--text-subtle)',
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
  attachmentGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
  },
  attachmentTile: {
    position: 'relative',
    width: '100px',
    height: '72px',
  },
  attachmentThumb: {
    width: '100px',
    height: '72px',
    objectFit: 'cover',
    borderRadius: 'var(--border-radius-sm)',
    border: '2px solid var(--glass-border)',
  },
  attachmentDeleteBtn: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    background: 'var(--danger-bg)',
    color: 'var(--danger-text)',
    border: '2px solid var(--danger-border)',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
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
  linksList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '12px',
  },
  linkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '6px 10px',
  },
  linkTypeTag: {
    fontSize: '10px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--primary-neon)',
    whiteSpace: 'nowrap',
  },
  linkBugBtn: {
    flex: 1,
    textAlign: 'left',
    background: 'none',
    border: 'none',
    color: 'var(--text-main)',
    fontSize: '13px',
    cursor: 'pointer',
    padding: 0,
  },
  linkRemoveBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  linkAddRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    position: 'relative',
  },
  linkSuggestions: {
    position: 'absolute',
    top: '46px',
    left: 0,
    right: 0,
    zIndex: 5,
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    maxHeight: '160px',
    overflowY: 'auto',
  },
  linkSuggestionItem: {
    padding: '8px 10px',
    fontSize: '13px',
    color: 'var(--text-main)',
    cursor: 'pointer',
    borderBottom: '1px solid var(--glass-border)',
  },
  labelChipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '10px',
  },
  labelChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--primary-neon)',
    textTransform: 'lowercase',
  },
  labelChipRemove: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: 0,
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
    width: '100%',
    padding: '10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    outline: 'none',
    fontSize: '14px',
    resize: 'none',
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
  commentAttachRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  commentAttachLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontWeight: '600',
  },
  pasteHintInline: {
    fontSize: '11px',
    color: 'var(--text-subtle)',
  },
  commentAttachPreview: {
    position: 'relative',
    marginLeft: '8px',
  },
  commentAttachThumb: {
    width: '40px',
    height: '30px',
    objectFit: 'cover',
    borderRadius: 'var(--border-radius-sm)',
    border: '2px solid var(--glass-border)',
  },
  commentAttachRemove: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    background: 'var(--danger-bg)',
    color: 'var(--danger-text)',
    border: '2px solid var(--danger-border)',
    borderRadius: '50%',
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  },
  commentAttachmentGrid: {
    display: 'flex',
    gap: '6px',
    marginTop: '6px',
    flexWrap: 'wrap',
  },
  commentAttachmentThumb: {
    width: '70px',
    height: '50px',
    objectFit: 'cover',
    borderRadius: 'var(--border-radius-sm)',
    border: '2px solid var(--glass-border)',
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
  activityTabRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '14px',
    borderBottom: '2px solid var(--glass-border)',
  },
  activityTabBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 10px',
    fontSize: '13px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-muted)',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    cursor: 'pointer',
  },
  activityTabBtnActive: {
    color: 'var(--primary-neon)',
    borderBottom: '2px solid var(--primary-neon)',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '260px',
    overflowY: 'auto',
    paddingTop: '4px',
  },
  historyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px',
    background: 'var(--bg-tertiary)',
    padding: '10px 12px',
    borderRadius: '4px',
    fontSize: '13px',
  },
  historyText: {
    color: 'var(--text-muted)',
    lineHeight: '1.4',
  },
};
