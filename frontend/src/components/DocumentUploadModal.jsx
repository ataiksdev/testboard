import React, { useMemo, useState } from 'react';
import { useToast } from './Toast';
import { Upload, X } from 'lucide-react';

const deriveTitleFromFilename = (filename) => {
  const base = filename.replace(/\.[^/.]+$/, '');
  const spaced = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1));
};

/**
 * Shared upload modal for all document pages (DocumentsHub, ProjectDetailView's
 * Documents tab). Pass `fixedProjectId` to lock the target project (hides the
 * picker); omit it to show a project selector fed by `projects`.
 */
export const DocumentUploadModal = ({
  projects,
  fixedProjectId,
  versionsByProject,
  documentsByProject,
  documentTypes,
  token,
  API_URL,
  onClose,
  onUploaded,
}) => {
  const { showSuccess, showError } = useToast();
  const [projectId, setProjectId] = useState(fixedProjectId || '');
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState(documentTypes[0] || 'Other');
  const [docVersionId, setDocVersionId] = useState('');
  const [docReplacesId, setDocReplacesId] = useState('');
  const [docFile, setDocFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const versions = projectId ? (versionsByProject[projectId] || []) : [];
  const docsForProject = projectId ? (documentsByProject[projectId] || []) : [];
  const latestDocs = useMemo(() => {
    const superseded = new Set(docsForProject.filter(d => d.replaces_document_id).map(d => d.replaces_document_id));
    return docsForProject.filter(d => !superseded.has(d.id));
  }, [docsForProject]);

  const handleProjectChange = (e) => {
    setProjectId(e.target.value);
    setDocVersionId('');
    setDocReplacesId('');
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setDocFile(file);
    if (file && !docTitle.trim()) setDocTitle(deriveTitleFromFilename(file.name));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!projectId || !docFile || !docTitle.trim()) return;
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('title', docTitle.trim());
      formData.append('doc_type', docType);
      if (docVersionId) formData.append('version_id', docVersionId);
      if (docReplacesId) formData.append('replaces_document_id', docReplacesId);
      formData.append('file', docFile);

      const response = await fetch(`${API_URL}/api/projects/${projectId}/documents`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to upload document');
      }
      showSuccess('Document uploaded successfully.');
      onUploaded();
      onClose();
    } catch (err) {
      showError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-panel" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            <Upload size={16} style={{ marginRight: '8px' }} />
            Upload Document
          </h3>
          <button style={styles.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {!fixedProjectId && (
            <select value={projectId} onChange={handleProjectChange} required style={styles.input}>
              <option value="">Select project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <div style={styles.row}>
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="Document title, e.g. BRD v2"
              required
              style={{ ...styles.input, flex: 2 }}
            />
            <select value={docType} onChange={(e) => setDocType(e.target.value)} style={{ ...styles.input, flex: 1 }}>
              {documentTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {projectId && (versions.length > 0 || latestDocs.length > 0) && (
            <div style={styles.row}>
              {versions.length > 0 && (
                <select value={docVersionId} onChange={(e) => setDocVersionId(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                  <option value="">No specific version</option>
                  {versions.map(v => <option key={v.id} value={v.id}>{v.version_name}</option>)}
                </select>
              )}
              {latestDocs.length > 0 && (
                <select value={docReplacesId} onChange={(e) => setDocReplacesId(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                  <option value="">Replaces (optional)</option>
                  {latestDocs.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              )}
            </div>
          )}

          <input
            type="file"
            onChange={handleFileChange}
            style={styles.fileInput}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.webp"
          />

          <div style={styles.actions}>
            <button type="button" className="btn-secondary" onClick={onClose} style={styles.actionBtn}>Cancel</button>
            <button type="submit" className="btn-primary" style={styles.actionBtn} disabled={!projectId || !docFile || !docTitle.trim() || uploading}>
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '2px solid var(--glass-border)',
    paddingBottom: '16px',
    marginBottom: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
    display: 'flex',
    alignItems: 'center',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  row: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  input: {
    padding: '10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    fontSize: '14px',
    outline: 'none',
    minWidth: '160px',
  },
  fileInput: {
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '6px',
  },
  actionBtn: {
    padding: '10px 18px',
    fontSize: '13px',
  },
};
