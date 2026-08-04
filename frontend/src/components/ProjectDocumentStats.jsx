import React from 'react';

/**
 * Compact per-project distribution summary for document views: total count
 * (latest revisions only), a chip row by document type, and a chip row by
 * version. Shared by DocumentsHub (one per project card) and
 * ProjectDetailView's Documents tab (single project).
 */
export const ProjectDocumentStats = ({ documents, versions }) => {
  const supersededIds = new Set(documents.filter(d => d.replaces_document_id).map(d => d.replaces_document_id));
  const latest = documents.filter(d => !supersededIds.has(d.id));

  if (latest.length === 0) return null;

  const typeCounts = {};
  latest.forEach(d => { typeCounts[d.doc_type] = (typeCounts[d.doc_type] || 0) + 1; });
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  const versionById = Object.fromEntries(versions.map(v => [v.id, v.version_name]));
  const versionCounts = {};
  let noVersionCount = 0;
  latest.forEach(d => {
    if (d.version_id && versionById[d.version_id]) {
      versionCounts[versionById[d.version_id]] = (versionCounts[versionById[d.version_id]] || 0) + 1;
    } else {
      noVersionCount += 1;
    }
  });
  const versionEntries = Object.entries(versionCounts).sort((a, b) => b[1] - a[1]);
  if (noVersionCount > 0) versionEntries.push(['No Version', noVersionCount]);

  return (
    <div style={styles.container}>
      <span style={styles.countBadge}>{latest.length} document{latest.length === 1 ? '' : 's'}</span>
      <div style={styles.chipRow}>
        {typeEntries.map(([type, count]) => (
          <span key={type} style={styles.typeChip}>{type} <b>{count}</b></span>
        ))}
      </div>
      {versionEntries.length > 0 && (
        <div style={styles.chipRow}>
          {versionEntries.map(([name, count]) => (
            <span key={name} style={styles.versionChip}>{name} <b>{count}</b></span>
          ))}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '14px',
  },
  countBadge: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-strong)',
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    padding: '3px 9px',
    borderRadius: 'var(--border-radius-sm)',
    flexShrink: 0,
  },
  chipRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  typeChip: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--primary-neon)',
    background: 'var(--primary-soft)',
    border: '1px solid var(--primary-border)',
    padding: '2px 8px',
    borderRadius: 'var(--border-radius-sm)',
  },
  versionChip: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--glass-border)',
    padding: '2px 8px',
    borderRadius: 'var(--border-radius-sm)',
  },
};
