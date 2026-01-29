import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

export default function CarRequests() {
  const { token, user } = useAuth();
  const role = user?.role;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);

  const [form, setForm] = useState({
    proposed_date: new Date().toISOString().slice(0, 10),
    objet: '',
    itinerary: '',
    people: '',
    depart_time_wanted: '',
    return_time_expected: '',
    vehicle_hint: '',
    driver_hint: ''
  });
  const [creating, setCreating] = useState(false);

  const [view, setView] = useState(null); // {loading, data}
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

  const [visaModal, setVisaModal] = useState(null); // {id, vehicle_id, driver_id}

  const canCreate = role === 'DEMANDEUR';
  const canVisaLogistique = ['LOGISTIQUE', 'ADMIN'].includes(role);
  const canVisaRaf = ['RAF', 'ADMIN'].includes(role);
  const canSoftDelete = ['LOGISTIQUE', 'ADMIN'].includes(role);

  const columns = useMemo(() => ['N°', 'Date', 'Objet', 'Statut', 'Actions'], []);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const d = await apiFetch('/api/requests/car', { token });
      setRequests(d.requests || []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function loadMeta() {
    try {
      const [v, dr] = await Promise.all([
        apiFetch('/api/meta/vehicles', { token }),
        apiFetch('/api/meta/drivers', { token })
      ]);
      setVehicles(v.vehicles || []);
      setDrivers(dr.drivers || []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    load();
    loadMeta();
  }, []);

  const create = async () => {
    setCreating(true);
    setErr(null);
    try {
      await apiFetch('/api/requests/car', { method: 'POST', token, body: form });
      setForm({ proposed_date: new Date().toISOString().slice(0, 10), objet: '', itinerary: '', people: '', depart_time_wanted: '', return_time_expected: '', vehicle_hint: '', driver_hint: '' });
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setCreating(false);
    }
  };

  const openView = async (id) => {
    setView({ loading: true, data: null });
    try {
      const d = await apiFetch(`/api/requests/car/${id}`, { token });
      setView({ loading: false, data: d.request });
    } catch (e) {
      setView({ loading: false, data: null });
      alert(String(e.message || e));
    }
  };

  const openEdit = (r) => {
    setEditId(r.id);
    setDraft({
      proposed_date: (r.proposed_date || '').slice(0, 10),
      objet: r.objet || '',
      itinerary: r.itinerary || '',
      people: r.people || '',
      depart_time_wanted: r.depart_time_wanted || '',
      return_time_expected: r.return_time_expected || '',
      vehicle_hint: r.vehicle_hint || '',
      driver_hint: r.driver_hint || ''
    });
  };

  const cancelEdit = () => {
    setEditId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editId || !draft) return;
    try {
      const body = {
        proposed_date: draft.proposed_date,
        objet: draft.objet,
        itinerary: draft.itinerary,
        people: draft.people,
        depart_time_wanted: draft.depart_time_wanted || null,
        return_time_expected: draft.return_time_expected || null,
        vehicle_hint: draft.vehicle_hint || null,
        driver_hint: draft.driver_hint || null
      };
      await apiFetch(`/api/requests/car/${editId}`, { method: 'PUT', token, body });
      cancelEdit();
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const softDelete = async (r) => {
    if (!canSoftDelete) return;
    if (!confirm(`Déplacer dans Corbeille ?\n${r.request_no}`)) return;
    try {
      await apiFetch(`/api/requests/car/${r.id}`, { method: 'DELETE', token });
      await load();
      alert('OK: déplacé dans Corbeille ✅');
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const logisticsVisa = async (id, vehicle_id, driver_id) => {
    try {
      await apiFetch(`/api/requests/car/${id}/visa`, { method: 'POST', token, body: { vehicle_id: vehicle_id || null, driver_id: driver_id || null } });
      setVisaModal(null);
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const rafApprove = async (id) => {
    try {
      await apiFetch(`/api/requests/car/${id}/approve`, { method: 'POST', token });
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const reject = async (id) => {
    const reason = prompt('Motif rejet (optionnel)');
    try {
      await apiFetch(`/api/requests/car/${id}/reject`, { method: 'POST', token, body: { reason: reason || null } });
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const canEditRow = (r) => {
    if (role === 'DEMANDEUR') return r.status === 'SUBMITTED';
    if (['ADMIN', 'LOGISTIQUE'].includes(role)) return r.status === 'SUBMITTED';
    return false;
  };

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Demandes voiture</h1>

      {err && <div className="muted" style={{ color: '#b91c1c' }}>{err}</div>}

      {canCreate && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Nouvelle demande</div>
          <div className="grid2">
            <div className="field">
              <div className="label">Date proposée</div>
              <input className="input" type="date" value={form.proposed_date} onChange={(e) => setForm({ ...form, proposed_date: e.target.value })} />
            </div>
            <div className="field">
              <div className="label">Objet</div>
              <input className="input" value={form.objet} onChange={(e) => setForm({ ...form, objet: e.target.value })} placeholder="Objet..." />
            </div>
            <div className="field">
              <div className="label">Itinéraire</div>
              <textarea className="input" rows={3} value={form.itinerary} onChange={(e) => setForm({ ...form, itinerary: e.target.value })} placeholder="Départ → Arrivée..." />
            </div>
            <div className="field">
              <div className="label">Personnes transportées</div>
              <textarea className="input" rows={3} value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} placeholder="Liste des personnes..." />
            </div>
            <div className="field">
              <div className="label">Heure départ souhaitée</div>
              <input className="input" type="time" value={form.depart_time_wanted} onChange={(e) => setForm({ ...form, depart_time_wanted: e.target.value })} />
            </div>
            <div className="field">
              <div className="label">Heure probable retour</div>
              <input className="input" type="time" value={form.return_time_expected} onChange={(e) => setForm({ ...form, return_time_expected: e.target.value })} />
            </div>
            <div className="field">
              <div className="label">Immatriculation (si connu)</div>
              <input className="input" value={form.vehicle_hint} onChange={(e) => setForm({ ...form, vehicle_hint: e.target.value })} placeholder="ex: 39961 WWT" />
            </div>
            <div className="field">
              <div className="label">Chauffeur (si connu)</div>
              <input className="input" value={form.driver_hint} onChange={(e) => setForm({ ...form, driver_hint: e.target.value })} placeholder="Nom chauffeur..." />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={create} disabled={creating}>Envoyer</button>
          </div>
        </div>
      )}

      <div style={{ overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (<th key={c}>{c}</th>))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="muted">Chargement...</td></tr>
            ) : requests.length ? (
              requests.map((r) => {
                const editing = editId === r.id;
                return (
                  <tr key={r.id}>
                    <td><b>{r.request_no}</b></td>
                    <td>
                      {editing ? (
                        <input className="input" type="date" value={draft?.proposed_date || ''} onChange={(e) => setDraft({ ...draft, proposed_date: e.target.value })} />
                      ) : (
                        String(r.proposed_date || '')
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input className="input" value={draft?.objet || ''} onChange={(e) => setDraft({ ...draft, objet: e.target.value })} />
                      ) : (
                        <span>{r.objet}</span>
                      )}
                    </td>
                    <td><span className="badge badge-ok">{r.status}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openView(r.id)}>Voir</button>
                      <span style={{ display: 'inline-block', width: 8 }} />

                      {editing ? (
                        <>
                          <button className="btn btn-sm" onClick={saveEdit}>Valider</button>
                          <span style={{ display: 'inline-block', width: 8 }} />
                          <button className="btn btn-outline btn-sm" onClick={cancelEdit}>Annuler</button>
                          <span style={{ display: 'inline-block', width: 8 }} />
                        </>
                      ) : (
                        canEditRow(r) && (
                          <>
                            <button className="btn btn-outline btn-sm" onClick={() => openEdit(r)}>Modifier</button>
                            <span style={{ display: 'inline-block', width: 8 }} />
                          </>
                        )
                      )}

                      <a className="btn btn-outline btn-sm" href={`/print/car/${r.id}`} target="_blank" rel="noreferrer">Imprimer</a>
                      <span style={{ display: 'inline-block', width: 8 }} />

                      {canVisaLogistique && r.status === 'SUBMITTED' && (
                        <>
                          <button
                            className="btn btn-sm"
                            onClick={() => setVisaModal({ id: r.id, vehicle_id: r.vehicle_id || '', driver_id: r.driver_id || '' })}
                          >
                            Visa logistique
                          </button>
                          <span style={{ display: 'inline-block', width: 8 }} />
                        </>
                      )}

                      {canVisaRaf && r.status === 'LOGISTICS_APPROVED' && (
                        <>
                          <button className="btn btn-sm" onClick={() => rafApprove(r.id)}>Visa RAF</button>
                          <span style={{ display: 'inline-block', width: 8 }} />
                        </>
                      )}

                      {canVisaLogistique && r.status === 'SUBMITTED' && (
                        <>
                          <button className="btn btn-outline btn-sm" onClick={() => reject(r.id)}>Non-valider</button>
                          <span style={{ display: 'inline-block', width: 8 }} />
                        </>
                      )}

                      {canVisaRaf && r.status === 'LOGISTICS_APPROVED' && (
                        <>
                          <button className="btn btn-outline btn-sm" onClick={() => reject(r.id)}>Non-valider</button>
                          <span style={{ display: 'inline-block', width: 8 }} />
                        </>
                      )}

                      {canSoftDelete && (
                        <button className="btn btn-danger btn-sm" onClick={() => softDelete(r)}>Corbeille</button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={columns.length} className="muted">Aucune demande.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {view && (
        <Modal title={view.loading ? 'Chargement...' : `Détails ${view.data?.request_no || ''}`} onClose={() => setView(null)} width={720}>
          {view.loading ? (
            <div className="muted">Chargement...</div>
          ) : view.data ? (
            <div>
              <div className="grid2">
                <div className="card">
                  <div className="muted">Date proposée</div>
                  <div style={{ fontWeight: 800 }}>{String(view.data.proposed_date || '')}</div>
                </div>
                <div className="card">
                  <div className="muted">Statut</div>
                  <div style={{ fontWeight: 800 }}>{String(view.data.status || '')}</div>
                </div>
              </div>
              <div className="card" style={{ marginTop: 10 }}>
                <div className="muted">Objet</div>
                <div style={{ fontWeight: 700 }}>{view.data.objet}</div>
                <hr />
                <div className="muted">Itinéraire</div>
                <div>{view.data.itinerary}</div>
                <hr />
                <div className="muted">Personnes transportées</div>
                <div>{view.data.people}</div>
                <hr />
                <div className="row" style={{ gap: 10 }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="muted">Départ souhaité</div>
                    <div style={{ fontWeight: 800 }}>{String(view.data.depart_time_wanted || '')}</div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="muted">Retour probable</div>
                    <div style={{ fontWeight: 800 }}>{String(view.data.return_time_expected || '')}</div>
                  </div>
                </div>
                <hr />
                <div className="row" style={{ gap: 10 }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="muted">Véhicule (hint)</div>
                    <div style={{ fontWeight: 800 }}>{String(view.data.vehicle_hint || '')}</div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="muted">Chauffeur (hint)</div>
                    <div style={{ fontWeight: 800 }}>{String(view.data.driver_hint || '')}</div>
                  </div>
                </div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
                <a className="btn" href={`/print/car/${view.data.id}`} target="_blank" rel="noreferrer">Imprimer</a>
              </div>
            </div>
          ) : (
            <div className="muted">Impossible de charger ce détail.</div>
          )}
        </Modal>
      )}

      {visaModal && (
        <Modal title="Visa logistique" onClose={() => setVisaModal(null)} width={640}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Optionnel: tu peux assigner un véhicule + chauffeur au moment du visa.
          </div>
          <div className="grid2">
            <div className="field">
              <div className="label">Véhicule</div>
              <select className="input" value={visaModal.vehicle_id} onChange={(e) => setVisaModal({ ...visaModal, vehicle_id: e.target.value })}>
                <option value="">(aucun)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.plate} {v.label ? `— ${v.label}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <div className="label">Chauffeur</div>
              <select className="input" value={visaModal.driver_id} onChange={(e) => setVisaModal({ ...visaModal, driver_id: e.target.value })}>
                <option value="">(aucun)</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name} {d.phone ? `— ${d.phone}` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-outline" onClick={() => setVisaModal(null)}>Annuler</button>
            <button className="btn" onClick={() => logisticsVisa(visaModal.id, visaModal.vehicle_id, visaModal.driver_id)}>Valider visa</button>
          </div>
        </Modal>
      )}
    </div>
  );
}