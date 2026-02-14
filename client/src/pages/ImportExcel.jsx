import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch, getApiUrl } from '../utils/api.js';
import './ImportExcel.css';

function fmtRole(role) {
  if (!role) return '—';
  const map = { ADMIN: 'Admin', LOGISTIQUE: 'Logistique', RAF: 'RAF' };
  return map[role] || role;
}

function fmtUser(b) {
  const first = (b?.created_first_name || '').trim();
  const last = (b?.created_last_name || '').trim();
  const full = `${first} ${last}`.trim();
  return full || b?.created_by || '—';
}

function extOf(name = '') {
  const s = String(name).toLowerCase();
  const i = s.lastIndexOf('.');
  return i >= 0 ? s.slice(i) : '';
}

function fmtBytes(n) {
  const v = Number(n || 0);
  if (!v) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  const digits = i <= 1 ? 0 : 1;
  return `${x.toFixed(digits)} ${units[i]}`;
}

export default function ImportExcel() {
  const { token, user } = useAuth();

  const fileInputRef = useRef(null);
  const xhrRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const [loading, setLoading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [batches, setBatches] = useState([]);
  const [filterRole, setFilterRole] = useState('ALL');

  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchFiles, setBatchFiles] = useState([]);

  const isUploader = ['ADMIN', 'LOGISTIQUE'].includes(user?.role);
  const canSeeHistory = ['ADMIN', 'LOGISTIQUE', 'RAF'].includes(user?.role);

  const allowedExt = useMemo(() => new Set(['.xlsx', '.xls', '.csv']), []);

  function addFiles(incoming) {
    const list = Array.from(incoming || []);
    const cleaned = list.filter((f) => allowedExt.has(extOf(f.name)));
    if (!cleaned.length) return;

    setFiles((prev) => {
      const key = (f) => `${f.name}::${f.size}::${f.lastModified}`;
      const seen = new Set(prev.map(key));
      const merged = [...prev];
      for (const f of cleaned) {
        const k = key(f);
        if (!seen.has(k)) {
          merged.push(f);
          seen.add(k);
        }
      }
      return merged;
    });
  }

  async function refreshBatches() {
    const data = await apiFetch('/api/import/batches', { token });
    setBatches(data.batches || []);
    return data.batches || [];
  }

  async function loadBatch(batchOrId) {
    const id = typeof batchOrId === 'string' ? batchOrId : batchOrId?.id;
    if (!id) return;

    const meta =
      typeof batchOrId === 'string'
        ? (batches || []).find((b) => b.id === id) || { id }
        : batchOrId;

    setSelectedBatch(meta);

    const data = await apiFetch(`/api/import/batches/${id}/files`, { token });
    setBatchFiles(data.files || []);
  }

  useEffect(() => {
    if (token && canSeeHistory) {
      refreshBatches().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.role]);

  const stats = useMemo(() => {
    const byRole = {};
    let total = 0;

    for (const b of batches || []) {
      const role = b.created_role || '—';
      byRole[role] = (byRole[role] || 0) + 1;
      total += 1;
    }

    const roles = Object.keys(byRole).sort((a, b) => a.localeCompare(b));
    return { total, byRole, roles };
  }, [batches]);

  const filteredBatches = useMemo(() => {
    const list = Array.from(batches || []);
    if (filterRole === 'ALL') return list;
    return list.filter((b) => (b.created_role || '—') === filterRole);
  }, [batches, filterRole]);

  function uploadWithProgress(path, formData) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.open('POST', `${getApiUrl()}${path}`);

      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploadPct(pct);
      };

      xhr.onerror = () => reject(new Error("Erreur réseau lors de l'upload."));
      xhr.onabort = () => reject(new Error('Upload annulé.'));

      xhr.onload = () => {
        let data = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          data = { raw: xhr.responseText, error: 'INVALID_JSON_RESPONSE' };
        }

        if (xhr.status >= 200 && xhr.status < 300) return resolve(data);

        const msg = data?.message || data?.error || `Upload échoué (${xhr.status})`;
        const err = new Error(msg);
        err.status = xhr.status;
        err.payload = data;
        return reject(err);
      };

      xhr.send(formData);
    });
  }

  function cancelUpload() {
    try {
      xhrRef.current?.abort();
    } catch {
      // ignore
    }
  }

  async function onUpload() {
    setError(null);
    setResult(null);
    if (!files.length) return;
    if (!isUploader) return;

    setLoading(true);
    setUploadPct(0);

    try {
      const batch = await apiFetch('/api/import/batch', { token, method: 'POST', body: {} });

      const fd = new FormData();
      fd.append('batch_id', batch.batch_id);
      for (const f of files) fd.append('files', f);

      const data = await uploadWithProgress('/api/import/upload', fd);
      setResult(data);
      setUploadPct(100);

      const list = await refreshBatches();
      const meta = (list || []).find((b) => b.id === data.batch_id) || { id: data.batch_id };
      await loadBatch(meta);

      setFiles([]);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid ix-grid">
      {/* LEFT */}
      <div className="card">
        <div className="ix-head">
          <div>
            <h2 style={{ margin: 0 }}>Import Excel</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Formats: <b>.xlsx</b>, <b>.xls</b>, <b>.csv</b> • Taille max: <b>25 Mo</b>
            </div>
          </div>
        </div>

        {!isUploader && <div className="muted">Accès réservé (Admin / Logistique).</div>}

        {isUploader && (
          <>
            <div
              className={`ix-dropzone ${isDragging ? 'is-dragging' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              onDragEnter={(e) => {
                e.preventDefault(); e.stopPropagation(); setIsDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault(); e.stopPropagation(); setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault(); e.stopPropagation(); setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation(); setIsDragging(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              <div className="ix-dropzone-title">Glisse/Dépose tes fichiers ici</div>
              <div className="ix-dropzone-sub muted">ou clique pour parcourir</div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            <div className="ix-help">
              <div className="ix-help-title">Aide rapide</div>
              <ul className="ix-help-list">
                <li>Nomme tes fichiers clairement : <i>Suivi carburant - Janvier 2026.xlsx</i></li>
                <li>Si le système ne reconnaît pas le fichier → <b>TYPE_NOT_SUPPORTED</b></li>
                <li>Reconnaissance basée sur le nom/contenu : <b>Suivi carburant</b>, <b>Autres carburant</b>, <b>Groupe électrogène</b></li>
              </ul>
            </div>

            <div className="ix-files">
              {files.length === 0 ? (
                <div className="muted" style={{ marginTop: 10 }}>Aucun fichier sélectionné.</div>
              ) : (
                <>
                  <div className="ix-files-head">
                    <div><b>{files.length}</b> fichier(s) sélectionné(s)</div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setFiles([])} type="button">Vider</button>
                  </div>

                  {files.map((f, idx) => (
                    <div className="ix-file-row" key={`${f.name}-${f.size}-${f.lastModified}-${idx}`}>
                      <div className="ix-file-main">
                        <div className="ix-file-name">{f.name}</div>
                        <div className="muted ix-file-meta">{fmtBytes(f.size)} • {extOf(f.name) || '—'}</div>
                      </div>
                      <button
                        className="btn btn-secondary btn-sm"
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="ix-actions">
              <div className="ix-actions-row">
                <button className="btn" disabled={loading || !files.length} onClick={onUpload}>
                  {loading ? 'Import…' : 'Importer'}
                </button>

                {loading && (
                  <button className="btn btn-secondary" type="button" onClick={cancelUpload}>
                    Annuler
                  </button>
                )}
              </div>

              {loading && (
                <div className="ix-progress" aria-label="Progression upload">
                  <div className="ix-progress-bar" style={{ width: `${uploadPct}%` }} />
                  <div className="ix-progress-label muted">{uploadPct}%</div>
                </div>
              )}
            </div>

            {error && <div className="alert">{error}</div>}

            {result && (
              <div style={{ marginTop: 12 }}>
                <div className="muted">Batch: <b>{result.batch_id}</b></div>
                <table className="table ix-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Fichier</th><th>Type</th><th>Insérés</th><th>Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(result.results || []).map((r, idx) => (
                      <tr key={idx}>
                        <td>{r.file}</td>
                        <td>{r.type || '-'}</td>
                        <td>{r.inserted ?? '-'}</td>
                        <td>{r.error || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* RIGHT */}
      <div className="card">
        <div className="ix-head">
          <div>
            <h2 style={{ margin: 0 }}>Historique imports</h2>
            <div className="muted" style={{ marginTop: 6 }}>Cartes = filtres • Clique une ligne pour voir les détails.</div>
          </div>
          {canSeeHistory && (
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => refreshBatches().catch(() => {})}>
              Rafraîchir
            </button>
          )}
        </div>

        {!canSeeHistory ? (
          <div className="muted">Accès réservé.</div>
        ) : (
          <>
            <div className="ix-filters">
              <button
                className={`ix-filter-card ${filterRole === 'ALL' ? 'active' : ''}`}
                type="button"
                onClick={() => setFilterRole('ALL')}
              >
                <div className="ix-filter-title">Tous</div>
                <div className="ix-filter-sub">{stats.total} imports</div>
              </button>

              {stats.roles.map((role) => (
                <button
                  key={role}
                  className={`ix-filter-card ${filterRole === role ? 'active' : ''}`}
                  type="button"
                  onClick={() => setFilterRole(role)}
                >
                  <div className="ix-filter-title">{fmtRole(role)}</div>
                  <div className="ix-filter-sub">{stats.byRole[role] || 0} imports</div>
                </button>
              ))}
            </div>

            <div className="ix-history">
              <table className="table ix-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Date &amp; heure</th>
                    <th>Utilisateur</th>
                    <th>Rôle</th>
                    <th>Fichier(s)</th>
                    <th>Insérés</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatches.length === 0 ? (
                    <tr><td colSpan={6} className="muted">Aucun import dans ce filtre.</td></tr>
                  ) : (
                    filteredBatches.map((b) => {
                      const isActive = selectedBatch?.id === b.id;
                      const filesCount = Number(b.files || 0);
                      const inserted = Number(b.inserted_rows || 0);
                      const fileLabel =
                        filesCount <= 0 ? '—' : `${b.first_file || '—'}${filesCount > 1 ? ` +${filesCount - 1}` : ''}`;

                      const status = String(b.status || '').toUpperCase();
                      const statusClass =
                        status === 'DONE'
                          ? 'ix-status--done'
                          : status === 'ERROR'
                          ? 'ix-status--error'
                          : status === 'PROCESSING' || status === 'PENDING'
                          ? 'ix-status--processing'
                          : 'ix-status--unknown';

                      return (
                        <tr
                          key={b.id}
                          className={isActive ? 'ix-row-active' : ''}
                          style={{ cursor: 'pointer' }}
                          onClick={() => loadBatch(b)}
                        >
                          <td>{new Date(b.created_at).toLocaleString('fr-FR')}</td>
                          <td>{fmtUser(b)}</td>
                          <td>{fmtRole(b.created_role)}</td>
                          <td>{fileLabel}</td>
                          <td>{inserted}</td>
                          <td><span className={`ix-status ${statusClass}`}>{status || '—'}</span></td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {selectedBatch && (
              <div style={{ marginTop: 14 }}>
                <div className="ix-details-head">
                  <h3 style={{ margin: 0 }}>
                    Détails • {fmtUser(selectedBatch)} ({fmtRole(selectedBatch.created_role)})
                  </h3>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Batch: <b>{selectedBatch.id}</b> • {new Date(selectedBatch.created_at).toLocaleString('fr-FR')}
                  </div>
                </div>

                <table className="table ix-table" style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>Nom</th><th>Type</th><th>Status</th><th>Insérés</th><th>Traité le</th><th>Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchFiles.length === 0 ? (
                      <tr><td colSpan={6} className="muted">Aucun fichier trouvé pour ce batch.</td></tr>
                    ) : (
                      batchFiles.map((f) => {
                        const st = String(f.status || '').toUpperCase();
                        const cls =
                          st === 'DONE'
                            ? 'ix-status--done'
                            : st === 'ERROR'
                            ? 'ix-status--error'
                            : st === 'PROCESSING' || st === 'PENDING'
                            ? 'ix-status--processing'
                            : 'ix-status--unknown';

                        return (
                          <tr key={f.id}>
                            <td>{f.original_name}</td>
                            <td>{f.detected_type || '-'}</td>
                            <td><span className={`ix-status ${cls}`}>{st || '—'}</span></td>
                            <td>{f.inserted_rows ?? ''}</td>
                            <td>{f.processed_at ? new Date(f.processed_at).toLocaleString('fr-FR') : ''}</td>
                            <td>{f.error_message || ''}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
