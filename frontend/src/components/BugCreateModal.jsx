import React, { useState, useEffect } from 'react';
import { X, ImagePlus, Clipboard, AlertTriangle } from 'lucide-react';

const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const BUG_TYPES = ["Functional", "Security", "Usability", "Regression", "Performance", "Other"];
const ENVIRONMENTS = ["Live", "Test", "Staging"];

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

export const BugCreateModal = ({ onClose, onCreated, projects, versions, components, users, bugProjId, setBugProjId, token, API_URL }) => {
  const [bugTitle, setBugTitle] = useState('');
  const [bugDesc, setBugDesc] = useState('');
  const [bugExpectedBehavior, setBugExpectedBehavior] = useState('');
  const [bugVerId, setBugVerId] = useState('');
  const [bugComponentId, setBugComponentId] = useState('');
  const [bugSeverity, setBugSeverity] = useState('Medium');
  const [bugPriority, setBugPriority] = useState('Medium');
  const [bugType, setBugType] = useState('Functional');
  const [bugEnvironment, setBugEnvironment] = useState('');
  const [bugEnvironmentDetails, setBugEnvironmentDetails] = useState('');
  const [bugOwnerId, setBugOwnerId] = useState('');
  const [bugIsBlocker, setBugIsBlocker] = useState(false);
  const [stagedAttachments, setStagedAttachments] = useState([]); // [{dataUrl, name}]
  const [stagedLabels, setStagedLabels] = useState([]);
  const [labelInput, setLabelInput] = useState('');
  const [labelSuggestions, setLabelSuggestions] = useState([]);
  const [showLabelSuggestions, setShowLabelSuggestions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!bugProjId) return;
    fetch(`${API_URL}/api/projects/${bugProjId}/labels/suggestions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : [])
      .then(setLabelSuggestions)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bugProjId]);

  const addLabel = (name) => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return;
    setStagedLabels(prev => prev.includes(normalized) ? prev : [...prev, normalized]);
    setLabelInput('');
    setShowLabelSuggestions(false);
  };

  const removeLabel = (name) => {
    setStagedLabels(prev => prev.filter(l => l !== name));
  };

  const handleLabelKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addLabel(labelInput);
    }
  };

  const labelMatches = labelInput.trim()
    ? labelSuggestions.filter(l => l.includes(labelInput.trim().toLowerCase()) && !stagedLabels.includes(l))
    : [];

  const stageFile = (file) => {
    readImageFile(file, (dataUrl, name) => {
      setStagedAttachments(prev => [...prev, { dataUrl, name }]);
    });
  };

  const handlePaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    stageFile(imageItem.getAsFile());
  };

  const removeStagedAttachment = (index) => {
    setStagedAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
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
          environment: bugEnvironment || null,
          environment_details: bugEnvironmentDetails || null,
          project_id: parseInt(bugProjId),
          version_id: bugVerId ? parseInt(bugVerId) : null,
          component_id: bugComponentId ? parseInt(bugComponentId) : null,
          status: 'Open',
          severity: bugSeverity,
          priority: bugPriority,
          bug_type: bugType,
          is_blocker: bugIsBlocker,
          owner_id: bugOwnerId ? parseInt(bugOwnerId) : null,
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Failed to log bug");
      }

      const newBug = await response.json();

      for (const attachment of stagedAttachments) {
        try {
          await fetch(`${API_URL}/api/bugs/${newBug.id}/attachments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ screenshot_data: attachment.dataUrl, filename: attachment.name })
          });
        } catch (err) {
          console.error('Attachment upload failed', err);
        }
      }

      for (const label of stagedLabels) {
        try {
          await fetch(`${API_URL}/api/bugs/${newBug.id}/labels`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name: label })
          });
        } catch (err) {
          console.error('Label add failed', err);
        }
      }

      onCreated();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-panel" style={{ maxWidth: '560px' }}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Log a QA Bug Ticket</h3>
          <button style={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} style={styles.modalForm}>
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
              <label style={styles.modalLabel}>Environment</label>
              <select
                value={bugEnvironment}
                onChange={(e) => setBugEnvironment(e.target.value)}
                style={styles.modalSelect}
              >
                <option value="">Not specified</option>
                {ENVIRONMENTS.map(env => <option key={env} value={env}>{env}</option>)}
              </select>
            </div>
            <div style={{ ...styles.inputGroup, flex: 2 }}>
              <label style={styles.modalLabel}>Environment Details</label>
              <input
                type="text"
                value={bugEnvironmentDetails}
                onChange={(e) => setBugEnvironmentDetails(e.target.value)}
                placeholder="e.g. Chrome 126 on Windows 11"
                style={styles.modalInput}
              />
            </div>
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
              <label style={styles.modalLabel}>Component</label>
              <select
                value={bugComponentId}
                onChange={(e) => setBugComponentId(e.target.value)}
                style={styles.modalSelect}
              >
                <option value="">None</option>
                {(components || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
            <label style={styles.modalLabel}>Attachments</label>
            <div
              style={styles.screenshotDropZone}
              onPaste={handlePaste}
              tabIndex={0}
            >
              <div style={styles.screenshotDropHeader}>
                <ImagePlus size={18} color="var(--primary-neon)" />
                <span>Paste images here or choose files (multiple allowed)</span>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => Array.from(e.target.files || []).forEach(stageFile)}
                style={styles.fileInput}
              />
              <div style={styles.pasteHint}>
                <Clipboard size={12} />
                Ctrl+V supports copied screenshots from your clipboard.
              </div>
            </div>
            {stagedAttachments.length > 0 && (
              <div style={styles.stagedList}>
                {stagedAttachments.map((att, i) => (
                  <div key={i} style={styles.screenshotPreviewWrap}>
                    <img src={att.dataUrl} alt={att.name} style={styles.screenshotPreview} />
                    <div style={styles.screenshotPreviewMeta}>
                      <span>{att.name}</span>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => removeStagedAttachment(i)}
                        style={styles.clearScreenshotBtn}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.modalLabel}>Labels</label>
            {stagedLabels.length > 0 && (
              <div style={styles.labelChipRow}>
                {stagedLabels.map(l => (
                  <span key={l} style={styles.labelChip}>
                    {l}
                    <button type="button" onClick={() => removeLabel(l)} style={styles.labelChipRemove}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={labelInput}
                onChange={(e) => { setLabelInput(e.target.value); setShowLabelSuggestions(true); }}
                onKeyDown={handleLabelKeyDown}
                onFocus={() => setShowLabelSuggestions(true)}
                onBlur={() => setTimeout(() => setShowLabelSuggestions(false), 150)}
                placeholder="Type a label and press Enter..."
                style={styles.modalInput}
              />
              {showLabelSuggestions && labelMatches.length > 0 && (
                <div style={styles.labelSuggestions}>
                  {labelMatches.slice(0, 6).map(l => (
                    <div key={l} style={styles.labelSuggestionItem} onClick={() => addLabel(l)}>
                      {l}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
            <button type="button" className="btn-secondary" onClick={onClose} style={{ padding: '10px 20px' }}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }} disabled={submitting}>
              {submitting ? 'Logging...' : 'Log Ticket'}
            </button>
          </div>
        </form>
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
  stagedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '8px',
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
  labelChipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '6px',
  },
  labelChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    background: 'var(--bg-tertiary)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '3px 6px 3px 10px',
    fontSize: '12px',
    color: 'var(--text-main)',
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
  labelSuggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    zIndex: 5,
    background: 'var(--bg-elevated)',
    border: '2px solid var(--glass-border)',
    borderRadius: 'var(--border-radius-sm)',
    maxHeight: '160px',
    overflowY: 'auto',
  },
  labelSuggestionItem: {
    padding: '8px 10px',
    fontSize: '13px',
    color: 'var(--text-main)',
    cursor: 'pointer',
    borderBottom: '1px solid var(--glass-border)',
  },
};
