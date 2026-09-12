import React, { useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';
import RequestPagination from '../components/RequestPagination.jsx';
import useFuelRequests from '../hooks/useFuelRequests.js';

function fmtAr(n) {
  try { return new Intl.NumberFormat('fr-FR').format(Number(n || 0)) + ' Ar'; } catch { return String(n || 0) + ' Ar'; }
}

export default function FuelRequestsRaf() {
  const { token, user } = useAuth();
  const role = user?.role;
  const { rows, loading, error, pagination, setPage, reload: load } = useFuelRequests({ token, status: 'VERIFIED' });
  const [view, setView] = useState(null);

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
    try {
      await apiFetch(`/api/requests/fuel/${id}/approve`, { token, method: 'POST' });
      load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function reject(id) {
    const reason = prompt('Motif de rejet (obligatoire)') || '';
    if (!reason.trim()) return;
    try {
      await apiFetch(`/api/requests/fuel/${id}/reject`, { token, method: 'POST', body: { reason } });
      load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  const can = role === 'RAF';

  return (
    <div className="card">
      <h2>Visa RAF carburant</h2>
      {error && <div className="alert" role="alert">{error} <button type="button" className="btn btn-outline" onClick={() => load()}>Réessayer</button></div>}
      {loading ? <div className="muted">Chargement...</div> : !error && (
        <div className="tableWrap" role="region" aria-label="Demandes de carburant à approuver" tabIndex={0}>
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
        </div>
      )}
      <RequestPagination pagination={pagination} loading={loading} error={error} onPageChange={setPage} />

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
