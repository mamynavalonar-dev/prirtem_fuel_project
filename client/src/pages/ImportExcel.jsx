import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch, apiUpload } from '../utils/api.js';

export default function ImportExcel() {
  const { token, user } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchFiles, setBatchFiles] = useState([]);
  const [error, setError] = useState(null);

  const isAllowed = ['ADMIN','LOGISTIQUE'].includes(user?.role);

  async function refreshBatches() {
    const data = await apiFetch('/api/import/batches', { token });
    setBatches(data.batches || []);
  }

  async function loadBatchFiles(batchId) {
    setSelectedBatch(batchId);
    const data = await apiFetch(`/api/import/batches/${batchId}/files`, { token });
    setBatchFiles(data.files || []);
  }

  useEffect(() => {
    if (token && ['ADMIN','LOGISTIQUE','RAF'].includes(user?.role)) {
      refreshBatches().catch(() => {});
    }
  }, [token, user?.role]);

  async function onUpload() {
    setError(null);
    if (!files.length) return;
    setLoading(true);
    try {
      const batch = await apiFetch('/api/import/batch', { token, method: 'POST', body: {} });
      const fd = new FormData();
      fd.append('batch_id', batch.batch_id);
      for (const f of files) fd.append('files', f);
      const data = await apiUpload('/api/import/upload', { token, formData: fd });
      setResult(data);
      await refreshBatches();
      await loadBatchFiles(data.batch_id);
      setFiles([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div className="card">
        <h2>Import Excel (Admin/Logistique)</h2>
        {!isAllowed && <div className="muted">Accès réservé.</div>}
        {isAllowed && (
          <>
            <input
              type="file"
              multiple
              accept=".xlsx"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            <div style={{ height: 8 }} />
            <button className="btn" disabled={loading || !files.length} onClick={onUpload}>
              {loading ? 'Import...' : 'Importer'}
            </button>

            {error && <div className="alert">{error}</div>}

            {result && (
              <div style={{ marginTop: 12 }}>
                <div className="muted">Batch: {result.batch_id}</div>
                <table className="table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Fichier</th>
                      <th>Type</th>
                      <th>Insérés</th>
                      <th>Erreur</th>
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

      <div className="card">
        <h2>Historique imports</h2>
        <div className="muted">Clique un batch pour voir les détails.</div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {(batches || []).slice(0, 20).map((b) => (
            <button
              key={b.id}
              className="btn btn-secondary"
              onClick={() => loadBatchFiles(b.id)}
              title={`Batch ${b.id}`}
            >
              {new Date(b.created_at).toLocaleString('fr-FR')}
              {' • '}
              {b.created_by || '—'}
              {' • '}
              {b.files} fichiers
            </button>
          ))}
        </div>

        {selectedBatch && (
          <div style={{ marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Batch {selectedBatch}</h3>

            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Insérés</th>
                  <th>Traité le</th>
                  <th>Erreur</th>
                </tr>
              </thead>
              <tbody>
                {(batchFiles || []).map((f) => (
                  <tr key={f.id}>
                    <td>{f.original_name}</td>
                    <td>{f.detected_type || '-'}</td>
                    <td>{f.status}</td>
                    <td>{f.inserted_rows ?? ''}</td>
                    <td>{f.processed_at ? new Date(f.processed_at).toLocaleString('fr-FR') : ''}</td>
                    <td>{f.error_message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
