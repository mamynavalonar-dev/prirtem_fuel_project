import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

function statusLabel(s) {
  switch (String(s || '').toUpperCase()) {
    case 'SUBMITTED': return 'En attente (Logistique)';
    case 'LOGISTICS_APPROVED': return 'Validé (Logistique)';
    case 'RAF_APPROVED': return 'Validé (RAF)';
    case 'REJECTED': return 'Rejeté';
    case 'CANCELLED': return 'Annulé';
    default: return s || '';
  }
}

export default function CarRequestsRaf() {
  const { token } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [view, setView] = useState(null); // {loading, data}

  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const d = await apiFetch('/api/requests/car?status=LOGISTICS_APPROVED', { token });
      setRows(d.requests || []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows || []).filter(r => {
      if (!needle) return true;
      const blob = [
        r.request_no, r.objet, r.status,
        r.requester_username, r.vehicle_plate, r.driver_name
      ].join(' ').toLowerCase();
      return blob.includes(needle);
    });
  }, [rows, q]);

  async function openView(id) {
    setView({ loading: true, data: null });
    try {
      const d = await apiFetch(`/api/requests/car/${id}`, { token });
      setView({ loading: false, data: d.request });
    } catch (e) {
      setView(null);
      alert(e.message || String(e));
    }
  }

  function closeView() {
    setView(null);
  }

  async function approve(id) {
    const ok = window.confirm('Approuver cette demande (Visa RAF) ?');
    if (!ok) return;
    try {
      await apiFetch(`/api/requests/car/${id}/approve`, { token, method: 'POST' });
      await load();
      if (view?.data?.id === id) closeView();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function reject(id) {
    const reason = window.prompt('Motif de rejet (obligatoire) :') || '';
    if (!reason.trim()) return;
    const ok = window.confirm('Rejeter cette demande ?');
    if (!ok) return;
    try {
      await apiFetch(`/api/requests/car/${id}/reject`, { token, method: 'POST', body: { reason } });
      await load();
      if (view?.data?.id === id) closeView();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  function printRequest(id) {
    window.open(`/print/car/${id}`, '_blank', 'noopener,noreferrer');
  }

  const columns = useMemo(() => ([
    'N°', 'Date', 'Demandeur', 'Objet', 'Véhicule', 'Chauffeur', 'Statut', 'Actions'
  ]), []);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Visa RAF voiture</h1>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="cardBody">
          <div className="field" style={{ maxWidth: 520 }}>
            <div className="label">Recherche</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="N°, objet, demandeur..." />
          </div>

          {err && <div className="muted" style={{ color: '#b91c1c', marginTop: 10 }}>{err}</div>}

          <div style={{ overflow: 'auto', marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={columns.length} className="muted">Chargement...</td></tr>
                ) : filtered.length ? (
                  filtered.map(r => (
                    <tr key={r.id} className="rowHover">
                      <td style={{ fontWeight: 700 }}>{r.request_no}</td>
                      <td>{String(r.proposed_date || '').slice(0, 10)}</td>
                      <td>{r.requester_username || '-'}</td>
                      <td style={{ maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.objet}>{r.objet}</td>
                      <td>{r.vehicle_plate || '-'}</td>
                      <td>{r.driver_name || '-'}</td>
                      <td><span className="badge">{statusLabel(r.status)}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openView(r.id)}>Voir</button>
                          <button className="btn btn-outline btn-sm" onClick={() => printRequest(r.id)}>Imprimer</button>
                          <button className="btn btn-sm" onClick={() => approve(r.id)}>Approuver</button>
                          <button className="btn btn-outline btn-sm" onClick={() => reject(r.id)}>Rejeter</button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={columns.length} className="muted">Aucune demande à viser.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {view && (
        <Modal title="Détails demande voiture" onClose={closeView} width={980}>
          {view.loading ? (
            <div className="muted">Chargement...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><b>N°</b><div>{view.data?.request_no}</div></div>
              <div><b>Statut</b><div>{statusLabel(view.data?.status)}</div></div>

              <div><b>Demandeur</b><div>{view.data?.requester_username || '-'}</div></div>
              <div><b>Date</b><div>{String(view.data?.proposed_date || '').slice(0, 10)}</div></div>

              <div style={{ gridColumn: 'span 2' }}><b>Objet</b><div style={{ whiteSpace: 'pre-wrap' }}>{view.data?.objet}</div></div>
              <div style={{ gridColumn: 'span 2' }}><b>Itinéraire</b><div style={{ whiteSpace: 'pre-wrap' }}>{view.data?.itinerary || '-'}</div></div>

              <div><b>Véhicule</b><div>{view.data?.vehicle_plate || '-'}</div></div>
              <div><b>Chauffeur</b><div>{view.data?.driver_name || '-'}</div></div>

              {view.data?.reject_reason ? (
                <div style={{ gridColumn: 'span 2' }}>
                  <b>Motif de rejet</b>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{view.data.reject_reason}</div>
                </div>
              ) : null}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button className="btn btn-outline" onClick={closeView}>Fermer</button>
            {view.data?.id && (
              <>
                <button className="btn btn-outline" onClick={() => printRequest(view.data.id)}>Imprimer</button>
                <button className="btn" onClick={() => approve(view.data.id)}>Approuver</button>
                <button className="btn btn-outline" onClick={() => reject(view.data.id)}>Rejeter</button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
