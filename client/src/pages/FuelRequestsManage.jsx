import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

function fmtAr(n) {
  try { return new Intl.NumberFormat('fr-FR').format(Number(n || 0)) + ' Ar'; } catch { return String(n || 0) + ' Ar'; }
}

export default function FuelRequestsManage() {
  const { token, user } = useAuth();
  const role = user?.role;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [view, setView] = useState(null); // {loading,data}
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ request_date: '', request_type: 'SERVICE', objet: '', amount_estimated_ar: 0, amount_estimated_words: '' });

  const canManage = useMemo(() => ['LOGISTIQUE', 'ADMIN'].includes(role), [role]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch('/api/requests/fuel?status=SUBMITTED', { token });
      setRows(d.requests || []);
    } catch (e) {
      setError(e.message || String(e));
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

  function startEdit(r) {
    setEditId(r.id);
    setEdit({
      request_date: (r.request_date || '').slice(0, 10),
      request_type: r.request_type || 'SERVICE',
      objet: r.objet || '',
      amount_estimated_ar: Number(r.amount_estimated_ar || 0),
      amount_estimated_words: r.amount_estimated_words || ''
    });
  }

  async function saveEdit(id) {
    try {
      await apiFetch(`/api/requests/fuel/${id}`, {
        token,
        method: 'PUT',
        body: {
          request_date: edit.request_date,
          request_type: edit.request_type,
          objet: edit.objet,
          amount_estimated_ar: Number(edit.amount_estimated_ar || 0),
          amount_estimated_words: edit.amount_estimated_words
        }
      });
      setEditId(null);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function softDelete(id) {
    if (!window.confirm('Déplacer dans Corbeille ?')) return;
    try {
      await apiFetch(`/api/requests/fuel/${id}`, { token, method: 'DELETE' });
      await load();
      alert('OK: déplacé dans Corbeille.');
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function verify(id) {
    try {
      await apiFetch(`/api/requests/fuel/${id}/verify`, { token, method: 'POST' });
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function reject(id) {
    const reason = window.prompt('Motif de rejet (optionnel) :') || null;
    try {
      await apiFetch(`/api/requests/fuel/${id}/reject`, { token, method: 'POST', body: { reason } });
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  if (!canManage) return <div className="card"><h2>Validation carburant</h2><div className="muted">Accès Logistique/Admin.</div></div>;

  return (
    <div className="card">
      <h2>Validation carburant (Logistique)</h2>
      {error && <div className="alert">{error}</div>}
      {loading ? (
        <div className="muted">Chargement...</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Date</th>
              <th>Type</th>
              <th>Objet</th>
              <th>Montant</th>
              <th>Demandeur</th>
              <th style={{ width: 360 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEdit = editId === r.id;
              return (
                <tr key={r.id}>
                  <td>{r.request_no}</td>
                  <td>{isEdit ? <input className="input" type="date" value={edit.request_date} onChange={(e) => setEdit({ ...edit, request_date: e.target.value })} /> : (r.request_date || '').slice(0, 10)}</td>
                  <td>{isEdit ? (
                    <select className="input" value={edit.request_type} onChange={(e) => setEdit({ ...edit, request_type: e.target.value })}>
                      <option value="SERVICE">SERVICE</option>
                      <option value="MISSION">MISSION</option>
                    </select>
                  ) : r.request_type}</td>
                  <td>{isEdit ? <input className="input" value={edit.objet} onChange={(e) => setEdit({ ...edit, objet: e.target.value })} /> : r.objet}</td>
                  <td>{isEdit ? <input className="input" type="number" value={edit.amount_estimated_ar} onChange={(e) => setEdit({ ...edit, amount_estimated_ar: e.target.value })} /> : fmtAr(r.amount_estimated_ar)}</td>
                  <td>{r.requester_name}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openView(r.id)}>Voir</button>
                    <span style={{ display: 'inline-block', width: 8 }} />
                    {isEdit ? (
                      <>
                        <button className="btn btn-sm" onClick={() => saveEdit(r.id)}>Valider</button>
                        <span style={{ display: 'inline-block', width: 8 }} />
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>Annuler</button>
                      </>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => startEdit(r)}>Modifier</button>
                    )}
                    <span style={{ display: 'inline-block', width: 8 }} />
                    <button className="btn btn-danger btn-sm" onClick={() => softDelete(r.id)}>Supprimer</button>
                    <span style={{ display: 'inline-block', width: 8 }} />
                    <button className="btn btn-sm" onClick={() => verify(r.id)}>Visa Logistique</button>
                    <span style={{ display: 'inline-block', width: 8 }} />
                    <button className="btn btn-outline btn-sm" onClick={() => reject(r.id)}>Non-validé</button>
                  </td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="muted">Aucune demande SUBMITTED.</td></tr>}
          </tbody>
        </table>
      )}

      {view && (
        <Modal title={`Demande carburant — ${view.data?.request_no || ''}`} onClose={() => setView(null)} width={820}>
          {view.loading ? (
            <div className="muted">Chargement...</div>
          ) : view.data ? (
            <div className="grid2">
              <div className="card">
                <div className="label">Date</div>
                <div>{(view.data.request_date || '').slice(0, 10)}</div>
                <div className="label" style={{ marginTop: 10 }}>Type</div>
                <div>{view.data.request_type}</div>
                <div className="label" style={{ marginTop: 10 }}>Objet</div>
                <div>{view.data.objet}</div>
                <div className="label" style={{ marginTop: 10 }}>Montant</div>
                <div><b>{fmtAr(view.data.amount_estimated_ar)}</b></div>
              </div>
              <div className="card">
                <div className="label">Statut</div>
                <div><span className="badge badge-info">{view.data.status}</span></div>
                <div className="label" style={{ marginTop: 10 }}>Demandeur</div>
                <div>{view.data.requester_name}</div>
                <div className="label" style={{ marginTop: 10 }}>Motif rejet</div>
                <div>{view.data.rejected_reason || <span className="muted">—</span>}</div>
              </div>
            </div>
          ) : (
            <div className="muted">Aucune donnée</div>
          )}
        </Modal>
      )}
    </div>
  );
}
