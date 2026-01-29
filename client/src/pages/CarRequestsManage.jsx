import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

export default function CarRequestsManage() {
  const { token, user } = useAuth();
  const role = user?.role;

  const [requests, setRequests] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [viewId, setViewId] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

  const [visa, setVisa] = useState(null); // {id, vehicle_id, driver_id}

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [r, v, d] = await Promise.all([
        apiFetch('/api/requests/car?status=SUBMITTED', { token }),
        apiFetch('/api/meta/vehicles', { token }),
        apiFetch('/api/meta/drivers', { token })
      ]);
      setRequests(r.requests || []);
      setVehicles(v.vehicles || []);
      setDrivers(d.drivers || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const canManage = useMemo(() => ['LOGISTIQUE','ADMIN'].includes(role), [role]);

  async function openView(id) {
    setViewId(id);
    setViewLoading(true);
    try {
      const d = await apiFetch(`/api/requests/car/${id}`, { token });
      setViewData(d.request);
    } catch (e) {
      alert(e.message);
      setViewId(null);
      setViewData(null);
    } finally {
      setViewLoading(false);
    }
  }

  function openEdit(row) {
    setEditId(row.id);
    setDraft({
      proposed_date: row.proposed_date || '',
      objet: row.objet || '',
      itinerary: row.itinerary || '',
      people: row.people || '',
      depart_time_wanted: row.depart_time_wanted || '',
      return_time_expected: row.return_time_expected || '',
      vehicle_hint: row.vehicle_hint || '',
      driver_hint: row.driver_hint || ''
    });
  }

  async function saveEdit(id) {
    try {
      await apiFetch(`/api/requests/car/${id}`, { token, method: 'PUT', body: { ...draft } });
      setEditId(null);
      setDraft(null);
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  function cancelEdit() {
    setEditId(null);
    setDraft(null);
  }

  async function softDelete(id) {
    if (!confirm('Déplacer en Corbeille ?')) return;
    try {
      await apiFetch(`/api/requests/car/${id}`, { token, method: 'DELETE' });
      await load();
      alert('OK ✅ Déplacé dans Corbeille');
    } catch (e) {
      alert(e.message);
    }
  }

  function openVisa(row) {
    setVisa({
      id: row.id,
      vehicle_id: row.vehicle_id || '',
      driver_id: row.driver_id || ''
    });
  }

  async function doVisa() {
    if (!visa?.id) return;
    if (!visa.vehicle_id || !visa.driver_id) {
      alert('Choisis véhicule + chauffeur avant Visa.');
      return;
    }
    try {
      await apiFetch(`/api/requests/car/${visa.id}/visa`, { token, method: 'POST', body: { vehicle_id: visa.vehicle_id, driver_id: visa.driver_id } });
      setVisa(null);
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function reject(id) {
    const reason = prompt('Motif rejet (optionnel)') || null;
    try {
      await apiFetch(`/api/requests/car/${id}/reject`, { token, method: 'POST', body: { reason } });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  async function printOne(id) {
    try {
      const d = await apiFetch(`/api/requests/car/${id}/print`, { token });
      window.open(d.url, '_blank');
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="card">
      <h2>Validation voiture (Logistique/Admin)</h2>
      {error && <div className="alert">{error}</div>}
      {loading ? <div className="muted">Chargement...</div> : null}

      <table className="table">
        <thead>
          <tr>
            <th>N°</th>
            <th>Date proposée</th>
            <th>Objet</th>
            <th>Statut</th>
            <th style={{ width: 420 }}></th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const editing = editId === r.id;
            return (
              <tr key={r.id}>
                <td>{r.request_no}</td>
                <td>
                  {editing ? (
                    <input className="input" type="date" value={draft.proposed_date} onChange={(e) => setDraft({ ...draft, proposed_date: e.target.value })} />
                  ) : r.proposed_date}
                </td>
                <td>
                  {editing ? (
                    <input className="input" value={draft.objet} onChange={(e) => setDraft({ ...draft, objet: e.target.value })} />
                  ) : (
                    <div style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.objet}</div>
                  )}
                </td>
                <td><span className="badge badge-info">{r.status}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => openView(r.id)}>Voir</button>
                  <span style={{ display: 'inline-block', width: 8 }} />

                  {editing ? (
                    <>
                      <button className="btn btn-sm" onClick={() => saveEdit(r.id)}>Valider</button>
                      <span style={{ display: 'inline-block', width: 8 }} />
                      <button className="btn btn-outline btn-sm" onClick={cancelEdit}>Annuler</button>
                    </>
                  ) : (
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(r)}>Modifier</button>
                  )}

                  <span style={{ display: 'inline-block', width: 8 }} />
                  <button className="btn btn-secondary btn-sm" onClick={() => printOne(r.id)}>Imprimer</button>

                  {canManage && !editing ? (
                    <>
                      <span style={{ display: 'inline-block', width: 8 }} />
                      <button className="btn btn-sm" onClick={() => openVisa(r)}>Visa Logistique</button>
                      <span style={{ display: 'inline-block', width: 8 }} />
                      <button className="btn btn-outline btn-sm" onClick={() => reject(r.id)}>Rejeter</button>
                      <span style={{ display: 'inline-block', width: 8 }} />
                      <button className="btn btn-danger btn-sm" onClick={() => softDelete(r.id)}>Supprimer</button>
                    </>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {!requests.length && (
            <tr><td colSpan={5} className="muted">Aucune demande en attente.</td></tr>
          )}
        </tbody>
      </table>

      {viewId && (
        <Modal title="Détails demande voiture" onClose={() => { setViewId(null); setViewData(null); }} width={860}>
          {viewLoading ? (
            <div className="muted">Chargement...</div>
          ) : viewData ? (
            <div className="grid2">
              <div className="card">
                <div className="label">N°</div><div><b>{viewData.request_no}</b></div>
                <div className="label" style={{ marginTop: 10 }}>Date proposée</div><div>{viewData.proposed_date}</div>
                <div className="label" style={{ marginTop: 10 }}>Objet</div><div>{viewData.objet}</div>
                <div className="label" style={{ marginTop: 10 }}>Itinéraire</div><div>{viewData.itinerary || <span className="muted">—</span>}</div>
                <div className="label" style={{ marginTop: 10 }}>Personnes</div><div>{viewData.people || <span className="muted">—</span>}</div>
              </div>
              <div className="card">
                <div className="label">Heure départ</div><div>{viewData.depart_time_wanted || <span className="muted">—</span>}</div>
                <div className="label" style={{ marginTop: 10 }}>Heure retour</div><div>{viewData.return_time_expected || <span className="muted">—</span>}</div>
                <div className="label" style={{ marginTop: 10 }}>Hints</div>
                <div className="muted">Véhicule: {viewData.vehicle_hint || '—'} • Chauffeur: {viewData.driver_hint || '—'}</div>
                <div className="label" style={{ marginTop: 10 }}>Statut</div>
                <div><span className="badge">{viewData.status}</span></div>
              </div>
            </div>
          ) : <div className="muted">Aucune donnée</div>}
        </Modal>
      )}

      {visa && (
        <Modal title="Visa Logistique (assigner véhicule + chauffeur)" onClose={() => setVisa(null)} width={700}>
          <div className="form">
            <label>
              Véhicule
              <select value={visa.vehicle_id} onChange={(e) => setVisa({ ...visa, vehicle_id: e.target.value })}>
                <option value="">-- sélectionner --</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
              </select>
            </label>
            <label>
              Chauffeur
              <select value={visa.driver_id} onChange={(e) => setVisa({ ...visa, driver_id: e.target.value })}>
                <option value="">-- sélectionner --</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
            </label>
            <div className="row">
              <button className="btn" onClick={doVisa}>Valider Visa</button>
              <button className="btn btn-outline" onClick={() => setVisa(null)}>Annuler</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
