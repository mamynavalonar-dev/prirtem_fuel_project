import React, { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

function fmtAr(n) {
  try { return new Intl.NumberFormat('fr-FR').format(Number(n || 0)) + ' Ar'; } catch { return String(n || 0) + ' Ar'; }
}

export default function FuelRequestsRaf() {
  const { token, user } = useAuth();
  const role = user?.role;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch('/api/requests/fuel?status=VERIFIED', { token });
      setRows(r.requests || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function openView(id) {
    setView({ loading: true, data: null });
    try {
      const d = await apiFetch(`/api/requests/fuel/${id}`, { token });
      setView({ loading: false, data: d.request });
    } catch (e) {
      setView(null);
      alert(e.message || String(e));
    }
  }

  async function approve(id) {
    await apiFetch(`/api/requests/fuel/${id}/approve`, { token, method: 'POST' });
    await load();
  }

  async function reject(id) {
    const reason = prompt('Motif de rejet (obligatoire)') || '';
    if (!reason.trim()) return;
    await apiFetch(`/api/requests/fuel/${id}/reject`, { token, method: 'POST', body: { reason } });
    await load();
  }

  const can = ['RAF', 'ADMIN'].includes(role);

  return (
    <div className="card">
      <h2>Visa RAF carburant</h2>
      {error && <div className="alert">{error}</div>}
      {loading ? <div className="muted">Chargement...</div> : (
        <table className="table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Date</th>
              <th>Type</th>
              <th>Objet</th>
              <th>Montant</th>
              <th style={{ width: 260 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.request_no}</b></td>
                <td>{r.request_date}</td>
                <td>{r.request_type}</td>
                <td>{r.objet}</td>
                <td>{fmtAr(r.amount_estimated_ar)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => openView(r.id)}>Voir</button>
                  <span style={{ display: 'inline-block', width: 8 }} />
                  {can && (
                    <>
                      <button className="btn btn-sm" onClick={() => approve(r.id)}>Approuver</button>
                      <span style={{ display: 'inline-block', width: 8 }} />
                      <button className="btn btn-outline btn-sm" onClick={() => reject(r.id)}>Rejeter</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted">Rien à viser.</td></tr>}
          </tbody>
        </table>
      )}

      {view && (
        <Modal title="Détails demande carburant" onClose={() => setView(null)} width={800}>
          {view.loading ? <div className="muted">Chargement...</div> : (
            <div className="grid2">
              <div className="card">
                <div className="label">N°</div><div><b>{view.data.request_no}</b></div>
                <div className="label" style={{ marginTop: 10 }}>Date</div><div>{view.data.request_date}</div>
                <div className="label" style={{ marginTop: 10 }}>Type</div><div>{view.data.request_type}</div>
                <div className="label" style={{ marginTop: 10 }}>Objet</div><div>{view.data.objet}</div>
              </div>
              <div className="card">
                <div className="label">Montant</div><div><b>{fmtAr(view.data.amount_estimated_ar)}</b></div>
                <div className="label" style={{ marginTop: 10 }}>Montant (lettres)</div><div>{view.data.amount_estimated_words || <span className="muted">—</span>}</div>
                <div className="label" style={{ marginTop: 10 }}>Statut</div><div><span className="badge">{view.data.status}</span></div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
