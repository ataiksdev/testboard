import React, { useEffect, useState } from 'react';
import { X, Download, Pencil, History, MessageSquare, FileWarning } from 'lucide-react';
import { useToast } from './Toast';
import { formatDateTimeWAT } from '../utils/datetime';

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const DocumentPreviewModal = ({
  document: doc,
  documents,
  versions,
  documentTypes,
  projectMembers,
  canEdit,
  token,
  API_URL,
  onClose,
  onUpdated,
}) => {
  const { showSuccess, showError } = useToast();
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const jsonHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(doc.title);
  const [editDocType, setEditDocType] = useState(doc.doc_type);
  const [editVersionId, setEditVersionId] = useState(doc.version_id || '');
  const [saving, setSaving] = useState(false);

  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [newCommentText, setNewCommentText] = useState('');
  const [mentionedUserIds, setMentionedUserIds] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);

  const getFileUrl = (fileUrl) => (!fileUrl ? '' : fileUrl.startsWith('http') ? fileUrl : `${API_URL}${fileUrl}`);

  useEffect(() => {
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  const fetchComments = async () => {
    try {
      setCommentsLoading(true);
      const response = await fetch(`${API_URL}/api/comments?document_id=${doc.id}`, { headers: authHeaders });
      if (response.ok) setComments(await response.json());
    } catch (err) {
      console.error(err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const response = await fetch(`${API_URL}/api/projects/${doc.project_id}/documents/${doc.id}`, {
        method: 'PUT',
        headers: jsonHeaders,
        body: JSON.stringify({
          title: editTitle.trim(),
          doc_type: editDocType,
          version_id: editVersionId ? parseInt(editVersionId) : undefined,
          clear_version: !editVersionId,
        })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to update document');
      }
      const updated = await response.json();
      onUpdated(updated);
      setIsEditing(false);
      showSuccess('Document updated.');
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    try {
      const response = await fetch(`${API_URL}/api/comments`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ document_id: doc.id, text: newCommentText, mentioned_user_ids: mentionedUserIds })
      });
      if (!response.ok) throw new Error('Failed to post comment');
      setNewCommentText('');
      setMentionedUserIds([]);
      fetchComments();
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

  // Revision history: walk the replaces_document_id chain backward from this doc
  const byId = Object.fromEntries(documents.map(d => [d.id, d]));
  const history = [];
  let cursor = doc;
  while (cursor.replaces_document_id && byId[cursor.replaces_document_id]) {
    cursor = byId[cursor.replaces_document_id];
    history.push(cursor);
  }

  const isImage = (doc.content_type || '').startsWith('image/');
  const isPdf = doc.content_type === 'application/pdf';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          {isEditing ? (
            <form onSubmit={handleSaveEdit} style={styles.editForm}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
                style={styles.editTitleInput}
              />
              <div style={styles.editRow}>
                <select value={editDocType} onChange={(e) => setEditDocType(e.target.value)} style={styles.editSelect}>
                  {documentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {versions.length > 0 && (
                  <select value={editVersionId} onChange={(e) => setEditVersionId(e.target.value)} style={styles.editSelect}>
                    <option value="">No specific version</option>
                    {versions.map(v => <option key={v.id} value={v.id}>{v.version_name}</option>)}
                  </select>
                )}
              </div>
              <div style={styles.editActions}>
                <button type="button" className="btn-secondary" style={styles.smallBtn} onClick={() => setIsEditing(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={styles.smallBtn} disabled={saving || !editTitle.trim()}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          ) : (
            <div style={styles.titleRow}>
              <span style={styles.docTypeBadge}>{doc.doc_type}</span>
              <h3 style={styles.title}>{doc.title}</h3>
              {canEdit && (
                <button style={styles.iconBtn} onClick={() => setIsEditing(true)} title="Rename / re-file">
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}
          <button style={styles.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        <div style={styles.meta}>
          {doc.original_filename} · {formatFileSize(doc.file_size)} · {doc.uploaded_by.full_name} · {formatDateTimeWAT(doc.created_at)}
        </div>

        <div style={styles.previewArea}>
          {isImage ? (
            <img src={getFileUrl(doc.file_url)} alt={doc.title} style={styles.previewImage} />
          ) : isPdf ? (
            <iframe title={doc.title} src={getFileUrl(doc.file_url)} style={styles.previewFrame} />
          ) : (
            <div style={styles.noPreview}>
              <FileWarning size={28} color="var(--text-subtle)" />
              <span>Preview isn't available for this file type.</span>
            </div>
          )}
        </div>
        <a href={getFileUrl(doc.file_url)} target="_blank" rel="noreferrer" className="btn-secondary" style={styles.downloadBtn}>
          <Download size={14} /> Download
        </a>

        {history.length > 0 && (
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>
              <History size={14} style={{ marginRight: '6px' }} />
              Revision History ({history.length})
            </h4>
            <div style={styles.historyList}>
              {history.map(h => (
                <div key={h.id} style={styles.historyRow}>
                  <span style={styles.historyTitle}>{h.title}</span>
                  <span style={styles.historyMeta}>
                    {h.uploaded_by.full_name} · {formatDateTimeWAT(h.created_at)}
                  </span>
                  <a href={getFileUrl(h.file_url)} target="_blank" rel="noreferrer" style={styles.iconBtn} title="Download this revision">
                    <Download size={13} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>
            <MessageSquare size={14} style={{ marginRight: '6px' }} />
            Comments ({comments.length})
          </h4>
          <form onSubmit={handlePostComment} style={styles.commentForm}>
            <div style={{ position: 'relative' }}>
              <textarea
                value={newCommentText}
                onChange={handleCommentChange}
                placeholder="Leave feedback on this document... use @ to mention someone"
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
            <button type="submit" className="btn-primary" style={styles.postBtn}>Post</button>
          </form>
          <div style={styles.commentsList}>
            {commentsLoading ? (
              <p style={styles.noComments}>Loading comments...</p>
            ) : comments.length === 0 ? (
              <p style={styles.noComments}>No comments yet.</p>
            ) : (
              comments.map(comment => (
                <div key={comment.id} style={styles.commentRow}>
                  <div style={styles.commentMeta}>
                    <strong>{comment.user.full_name}</strong>
                    <span style={styles.commentTime}>{formatDateTimeWAT(comment.created_at)}</span>
                  </div>
                  <p style={styles.commentText}>{comment.text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    borderBottom: '2px solid var(--glass-border)',
    paddingBottom: '16px',
    marginBottom: '12px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
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
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  editForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1,
  },
  editTitleInput: {
    padding: '8px 10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    fontSize: '15px',
    fontWeight: '600',
    outline: 'none',
  },
  editRow: {
    display: 'flex',
    gap: '8px',
  },
  editSelect: {
    flex: 1,
    padding: '8px 10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    fontSize: '13px',
    outline: 'none',
  },
  editActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  smallBtn: {
    padding: '6px 12px',
    fontSize: '12px',
  },
  meta: {
    fontSize: '12px',
    color: 'var(--text-subtle)',
    marginBottom: '14px',
  },
  previewArea: {
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    minHeight: '220px',
    maxHeight: '420px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: '10px',
  },
  previewImage: {
    maxWidth: '100%',
    maxHeight: '420px',
    objectFit: 'contain',
  },
  previewFrame: {
    width: '100%',
    height: '420px',
    border: 'none',
  },
  noPreview: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    color: 'var(--text-subtle)',
    fontSize: '13px',
    padding: '30px',
  },
  downloadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    marginBottom: '20px',
  },
  section: {
    borderTop: '2px solid var(--glass-border)',
    paddingTop: '16px',
    marginTop: '4px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'var(--font-display)',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '16px',
  },
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
  },
  historyTitle: {
    flex: 1,
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  historyMeta: {
    fontSize: '11px',
    color: 'var(--text-subtle)',
  },
  commentForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '14px',
  },
  commentInput: {
    padding: '10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    outline: 'none',
    fontSize: '13px',
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
};
