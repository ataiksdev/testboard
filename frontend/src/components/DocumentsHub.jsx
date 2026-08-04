import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../utils/auth';
import { useToast } from './Toast';
import { canManageProjects } from '../utils/roles';
import {
  Files, Search, Upload, Trash2, Download, GitBranch, History, FolderKanban,
  FileType2
} from 'lucide-react';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { DocumentUploadModal } from './DocumentUploadModal';

const DOCUMENT_TYPES = ["BRD", "Report", "Test Plan", "Changelog", "Addendum", "Other"];

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatTotalSize = (bytes) => {
  if (!bytes) return '0 KB';
  return formatFileSize(bytes);
};

const deriveTitleFromFilename = (filename) => {
  const base = filename.replace(/\.[^/.]+$/, '');
  const spaced = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1));
};

const StatBar = ({ label, count, total, color }) => {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={styles.statBarRow}>
      <span style={styles.statBarLabel}>{label}</span>
      <div style={styles.statBarTrack}>
        <div style={{ ...styles.statBarFill, width: `${pct}%`, background: color }} />
      </div>
      <span style={styles.statBarCount}>{count}</span>
    </div>
  );
};

export const DocumentsHub = () => {
  const { token, API_URL, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const canEdit = canManageProjects(user.role);

  const [projects, setProjects] = useState([]);
  const [documentsByProject, setDocumentsByProject] = useState({});
  const [versionsByProject, setVersionsByProject] = useState({});
  const [membersByProject, setMembersByProject] = useState({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [previewDoc, setPreviewDoc] = useState(null); // { doc, projectId }
  const [showUploadModal, setShowUploadModal] = useState(false);

  const authHeaders = { 'Authorization': `Bearer ${token}` };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const projRes = await fetch(`${API_URL}/api/projects`, { headers: authHeaders });
      const projList = projRes.ok ? await projRes.json() : [];
      setProjects(projList);

      const docsMap = {};
      const versionsMap = {};
      const membersMap = {};
      await Promise.all(projList.map(async (p) => {
        const [docsRes, versionsRes, membersRes] = await Promise.all([
          fetch(`${API_URL}/api/projects/${p.id}/documents`, { headers: authHeaders }),
          fetch(`${API_URL}/api/projects/${p.id}/versions`, { headers: authHeaders }),
          fetch(`${API_URL}/api/projects/${p.id}/members`, { headers: authHeaders }),
        ]);
        docsMap[p.id] = docsRes.ok ? await docsRes.json() : [];
        versionsMap[p.id] = versionsRes.ok ? await versionsRes.json() : [];
        membersMap[p.id] = membersRes.ok ? await membersRes.json() : [];
      }));
      setDocumentsByProject(docsMap);
      setVersionsByProject(versionsMap);
      setMembersByProject(membersMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getFileUrl = (fileUrl) => (!fileUrl ? '' : fileUrl.startsWith('http') ? fileUrl : `${API_URL}${fileUrl}`);

  const handleDelete = async (projectId, documentId) => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/documents/${documentId}`, {
        method: 'DELETE', headers: authHeaders
      });
      if (!response.ok) throw new Error('Failed to delete document');
      fetchAll();
      showSuccess('Document deleted.');
    } catch (err) {
      showError(err.message);
    }
  };

  // Overview stats: computed from all loaded documents (not filtered by search/project selector)
  const stats = useMemo(() => {
    const allDocs = projects.flatMap(p => documentsByProject[p.id] || []);
    const supersededIds = new Set(allDocs.filter(d => d.replaces_document_id).map(d => d.replaces_document_id));
    const latestDocs = allDocs.filter(d => !supersededIds.has(d.id));

    const typeCounts = {};
    DOCUMENT_TYPES.forEach(t => { typeCounts[t] = 0; });
    latestDocs.forEach(d => { typeCounts[d.doc_type] = (typeCounts[d.doc_type] || 0) + 1; });

    const projectCounts = projects
      .map(p => ({ project: p, count: (documentsByProject[p.id] || []).filter(d => !supersededIds.has(d.id)).length }))
      .filter(pc => pc.count > 0)
      .sort((a, b) => b.count - a.count);

    const totalStorageBytes = allDocs.reduce((sum, d) => sum + (d.file_size || 0), 0);
    const contributorIds = new Set(allDocs.map(d => d.uploaded_by.id));

    return {
      totalDocuments: latestDocs.length,
      projectsWithDocs: projectCounts.length,
      totalProjects: projects.length,
      totalStorageBytes,
      revisionsTracked: allDocs.filter(d => d.replaces_document_id).length,
      contributors: contributorIds.size,
      typeCounts,
      projectCounts,
    };
  }, [projects, documentsByProject]);

  // Build project groups: latest revision only, with a revision-history count, filtered by search + projectFilter
  const searchTerm = search.trim().toLowerCase();
  const projectGroups = projects
    .filter(p => !projectFilter || String(p.id) === String(projectFilter))
    .map(p => {
      const docs = documentsByProject[p.id] || [];
      const supersededIds = new Set(docs.filter(d => d.replaces_document_id).map(d => d.replaces_document_id));
      let latest = docs.filter(d => !supersededIds.has(d.id));
      if (searchTerm) {
        latest = latest.filter(d =>
          d.title.toLowerCase().includes(searchTerm) ||
          d.original_filename.toLowerCase().includes(searchTerm) ||
          d.doc_type.toLowerCase().includes(searchTerm));
      }
      return { project: p, docs: latest };
    })
    .filter(g => g.docs.length > 0);

  const totalVisible = projectGroups.reduce((sum, g) => sum + g.docs.length, 0);

  const revisionCountFor = (projectId, doc) => {
    const byId = Object.fromEntries((documentsByProject[projectId] || []).map(d => [d.id, d]));
    let count = 0;
    let cursor = doc;
    while (cursor.replaces_document_id && byId[cursor.replaces_document_id]) {
      cursor = byId[cursor.replaces_document_id];
      count += 1;
    }
    return count;
  };

  if (loading) return <div style={styles.loading}>Loading documents...</div>;

  return (
    <div style={styles.container} className="animate-fade-in">
      <div style={styles.header}>
        <Files size={24} color="var(--primary-neon)" />
        <h2 style={styles.title}>Documents</h2>
      </div>
      <p style={styles.subtitle}>Every document across your projects, searchable in one place.</p>

      <div style={styles.statsGrid}>
        <div className="glass-panel" style={styles.statTile}>
          <span style={styles.statValue}>{stats.totalDocuments}</span>
          <span style={styles.statLabel}>Documents</span>
        </div>
        <div className="glass-panel" style={styles.statTile}>
          <span style={styles.statValue}>{stats.projectsWithDocs}<span style={styles.statValueOf}>/{stats.totalProjects}</span></span>
          <span style={styles.statLabel}>Projects Covered</span>
        </div>
        <div className="glass-panel" style={styles.statTile}>
          <span style={styles.statValue}>{formatTotalSize(stats.totalStorageBytes)}</span>
          <span style={styles.statLabel}>Storage Used</span>
        </div>
        <div className="glass-panel" style={styles.statTile}>
          <span style={styles.statValue}>{stats.revisionsTracked}</span>
          <span style={styles.statLabel}>Revisions Tracked</span>
        </div>
        <div className="glass-panel" style={styles.statTile}>
          <span style={styles.statValue}>{stats.contributors}</span>
          <span style={styles.statLabel}>Contributors</span>
        </div>
      </div>

      {stats.totalDocuments > 0 && (
        <div style={styles.statBreakdownGrid}>
          <div className="glass-panel" style={styles.statBreakdownPanel}>
            <h3 style={styles.statBreakdownTitle}>
              <FileType2 size={15} style={{ marginRight: '7px' }} />
              By Document Type
            </h3>
            {DOCUMENT_TYPES.map(t => (
              <StatBar key={t} label={t} count={stats.typeCounts[t] || 0} total={stats.totalDocuments} color="var(--primary-neon)" />
            ))}
          </div>
          <div className="glass-panel" style={styles.statBreakdownPanel}>
            <h3 style={styles.statBreakdownTitle}>
              <FolderKanban size={15} style={{ marginRight: '7px' }} />
              By Project
            </h3>
            {stats.projectCounts.slice(0, 6).map(({ project, count }) => (
              <StatBar key={project.id} label={project.name} count={count} total={stats.totalDocuments} color="var(--accent-mustard)" />
            ))}
            {stats.projectCounts.length > 6 && (
              <p style={styles.statMoreNote}>+ {stats.projectCounts.length - 6} more project(s) with documents.</p>
            )}
          </div>
        </div>
      )}

      <div style={styles.toolbar}>
        <div style={styles.searchWrap}>
          <Search size={16} color="var(--text-muted)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, filename, or type..."
            style={styles.searchInput}
          />
        </div>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={styles.projectSelect}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {canEdit && (
          <button className="btn-primary" style={styles.uploadBtn} onClick={() => setShowUploadModal(true)}>
            <Upload size={14} /> Upload Document
          </button>
        )}
      </div>

      {projectGroups.length === 0 ? (
        <p style={styles.emptyText}>
          {searchTerm || projectFilter ? 'No documents match your filters.' : 'No documents uploaded yet.'}
        </p>
      ) : (
        <>
          <p style={styles.countNote}>{totalVisible} document{totalVisible === 1 ? '' : 's'} across {projectGroups.length} project{projectGroups.length === 1 ? '' : 's'}.</p>
          {projectGroups.map(({ project, docs }) => (
            <div key={project.id} className="glass-panel" style={styles.projectGroup}>
              <h4 style={styles.projectGroupTitle}>
                <FolderKanban size={14} style={{ marginRight: '6px' }} />
                {project.name}
                <span style={styles.projectKeyTag}>{project.key}</span>
              </h4>
              <div style={styles.docList}>
                {docs.map(doc => (
                  <div key={doc.id} style={styles.docRow}>
                    <span style={styles.docTypeBadge}>{doc.doc_type}</span>
                    <div style={styles.docInfo} onClick={() => setPreviewDoc({ doc, projectId: project.id })}>
                      <span style={styles.docTitleText}>
                        {doc.title}
                        {revisionCountFor(project.id, doc) > 0 && (
                          <span style={styles.revisionBadge} title="Has revision history">
                            <History size={10} style={{ marginRight: '3px' }} />
                            {revisionCountFor(project.id, doc)}
                          </span>
                        )}
                        {doc.version_id && (versionsByProject[project.id] || []).some(v => v.id === doc.version_id) && (
                          <span style={styles.versionTag}>
                            <GitBranch size={10} style={{ marginRight: '3px' }} />
                            {(versionsByProject[project.id] || []).find(v => v.id === doc.version_id)?.version_name}
                          </span>
                        )}
                      </span>
                      <span style={styles.docMeta}>
                        {doc.original_filename} · {formatFileSize(doc.file_size)} · {doc.uploaded_by.full_name}
                      </span>
                    </div>
                    <a href={getFileUrl(doc.file_url)} target="_blank" rel="noreferrer" style={styles.iconBtn} title="Download">
                      <Download size={14} />
                    </a>
                    {canEdit && (
                      <button style={styles.iconBtn} onClick={() => handleDelete(project.id, doc.id)} title="Delete document">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc.doc}
          documents={documentsByProject[previewDoc.projectId] || []}
          versions={versionsByProject[previewDoc.projectId] || []}
          documentTypes={DOCUMENT_TYPES}
          projectMembers={membersByProject[previewDoc.projectId] || []}
          canEdit={canEdit}
          token={token}
          API_URL={API_URL}
          onClose={() => setPreviewDoc(null)}
          onUpdated={() => {
            fetchAll();
            setPreviewDoc(null);
          }}
        />
      )}

      {showUploadModal && (
        <DocumentUploadModal
          projects={projects}
          versionsByProject={versionsByProject}
          documentsByProject={documentsByProject}
          documentTypes={DOCUMENT_TYPES}
          token={token}
          API_URL={API_URL}
          onClose={() => setShowUploadModal(false)}
          onUploaded={fetchAll}
        />
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
    gap: '10px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-strong)',
  },
  subtitle: {
    color: 'var(--text-muted)',
    fontSize: '14px',
    marginBottom: '20px',
  },
  loading: {
    textAlign: 'center',
    padding: '80px 0',
    color: 'var(--text-muted)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '14px',
    marginBottom: '16px',
  },
  statTile: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '26px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
    lineHeight: '1',
    marginBottom: '6px',
  },
  statValueOf: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-subtle)',
  },
  statLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  statBreakdownGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '14px',
    marginBottom: '20px',
  },
  statBreakdownPanel: {
    padding: '18px 20px',
  },
  statBreakdownTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
    display: 'flex',
    alignItems: 'center',
    marginBottom: '14px',
  },
  statBarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '9px',
  },
  statBarLabel: {
    width: '96px',
    flexShrink: 0,
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontWeight: '600',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  statBarTrack: {
    flex: 1,
    height: '9px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    overflow: 'hidden',
  },
  statBarFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  statBarCount: {
    width: '24px',
    flexShrink: 0,
    textAlign: 'right',
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-strong)',
  },
  statMoreNote: {
    fontSize: '11px',
    color: 'var(--text-subtle)',
    marginTop: '4px',
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '8px 12px',
    flex: '1 1 260px',
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-main)',
    fontSize: '14px',
    width: '100%',
  },
  projectSelect: {
    padding: '8px 12px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    outline: 'none',
    fontSize: '14px',
  },
  uploadPanel: {
    padding: '18px 20px',
    marginBottom: '20px',
  },
  uploadTitle: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
    display: 'flex',
    alignItems: 'center',
    marginBottom: '12px',
  },
  uploadForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  row: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  input: {
    padding: '9px 10px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    color: 'var(--text-main)',
    fontSize: '13px',
    outline: 'none',
    minWidth: '160px',
  },
  fileInput: {
    flex: 1,
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  uploadBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '9px 16px',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },
  emptyText: {
    color: 'var(--text-subtle)',
    fontSize: '14px',
    textAlign: 'center',
    padding: '40px 0',
  },
  countNote: {
    fontSize: '12px',
    color: 'var(--text-subtle)',
    marginBottom: '14px',
  },
  projectGroup: {
    padding: '18px 20px',
    marginBottom: '16px',
  },
  projectGroupTitle: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    fontFamily: 'var(--font-display)',
    marginBottom: '12px',
    paddingBottom: '10px',
    borderBottom: '2px solid var(--glass-border)',
  },
  projectKeyTag: {
    marginLeft: '8px',
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--primary-neon)',
    background: 'var(--primary-soft)',
    padding: '2px 6px',
    borderRadius: 'var(--border-radius-sm)',
  },
  docList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
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
    cursor: 'pointer',
  },
  docTitleText: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  docMeta: {
    fontSize: '11px',
    color: 'var(--text-subtle)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  revisionBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '8px',
    padding: '1px 6px',
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--accent-mustard)',
    background: 'rgba(217, 166, 46, 0.14)',
    border: '1px solid var(--accent-mustard)',
    borderRadius: 'var(--border-radius-sm)',
    verticalAlign: 'middle',
  },
  versionTag: {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '8px',
    padding: '1px 6px',
    fontSize: '10px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    verticalAlign: 'middle',
  },
  iconBtn: {
    color: 'var(--text-muted)',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
};
