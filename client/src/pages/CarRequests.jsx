// client/src/pages/CarRequests.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

function ymdToday() {
  return new Date().toISOString().slice(0, 10);
}

function cleanStr(v) {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function cleanInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function periodLabel(r) {
  const a = String(r?.proposed_date || '');
  const b = String(r?.end_date || r?.proposed_date || '');
  return b && a && b !== a ? `${a} → ${b}` : a;
}

function buildItinerary(departure, destination) {
  const a = String(departure || '').trim();
  const b = String(destination || '').trim();
  if (!a && !b) return '';
  if (a && !b) return a;
  if (!a && b) return b;
  return `${a} → ${b}`;
}

export default function CarRequests() {
  const { token, user } = useAuth();
  const role = user?.role;

  const [requests, setRequests] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // filtres (recherche + statut)
  const [filters, setFilters] = useState({ q: '', status: 'ALL' });

  // ✅ MODAL création
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // ✅ MODAL view
  const [view, setView] = useState(null); // {loading, data}

  // ✅ MODAL visa logistique
  const [visaModal, setVisaModal] = useState(null); // {id, vehicle_id, driver_id}

  // ✅ MODAL édition (2 modes : REQUEST / CONTROL)
  const [editModal, setEditModal] = useState(null); // { id, mode, status }
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const canCreate = role === 'DEMANDEUR';
  const canVisaLogistique = ['LOGISTIQUE', 'ADMIN'].includes(role);
  const canVisaRaf = ['RAF', 'ADMIN'].includes(role);
  const canSoftDelete = ['LOGISTIQUE', 'ADMIN'].includes(role);

  const showAssigned = role !== 'DEMANDEUR';
  const showRequester = role !== 'DEMANDEUR';

  const columns = useMemo(() => {
    const cols = ['N°', 'Période', 'Objet', 'Départ', 'Destination', 'Nb'];
    if (showRequester) cols.push('Demandeur', 'Service');
    if (showAssigned) cols.push('Immatriculation', 'Chauffeur');
    cols.push('Statut', 'Actions');
    return cols;
  }, [showAssigned, showRequester]);

  const statusOptions = useMemo(() => {
    const set = new Set((requests || []).map((r) => r.status).filter(Boolean));
    return ['ALL', ...Array.from(set)];
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = (filters.q || '').trim().toLowerCase();
    const st = filters.status || 'ALL';

    return (requests || []).filter((r) => {
      if (st !== 'ALL' && String(r.status) !== st) return false;
      if (!q) return true;

      const hay = `
        ${r.request_no || ''}
        ${r.objet || ''}
        ${r.departure_place || ''}
        ${r.destination_place || ''}
        ${r.itinerary || ''}
        ${r.people || ''}
        ${r.requester_username || ''}
        ${r.requester_name || ''}
        ${r.requester_service || ''}
        ${r.vehicle_plate || ''}
        ${r.driver_name || ''}
        ${r.trip_type || ''}
      `.toLowerCase();

      return hay.includes(q);
    });
  }, [requests, filters]);

  function makeDefaultForm() {
    const today = ymdToday();
    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
    return {
      proposed_date: today,
      end_date: today,

      // ✅ champs manquants (essentiels)
      requester_service: '',
      requester_name: fullName || user?.username || '',
      requester_contact: user?.email || '',
      trip_type: 'SERVICE',
      passenger_count: '',
      departure_place: '',
      destination_place: '',
      itinerary: '',
      objet: '',
      people: '',
      observations: '',

      // horaires demandés
      depart_time_wanted: '',
      return_time_expected: '',

      // hints
      vehicle_hint: '',
      driver_hint: '',

      // ✅ contrôle sortie/retour (plutôt rempli par Logistique après Visa RAF)
      actual_out_time: '',
      actual_return_time: '',
      odometer_start: '',
      odometer_end: '',
      fuel_level_start: '',
      fuel_level_end: ''
    };
  }

  const [form, setForm] = useState(() => makeDefaultForm());

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

  function openCreate() {
    setErr(null);
    setForm(makeDefaultForm());
    setCreateOpen(true);
  }

  function closeCreate() {
    setCreateOpen(false);
  }

  function createBodyFromForm(f) {
    const auto = buildItinerary(f.departure_place, f.destination_place);
    const itinerary = String(f.itinerary || '').trim() || auto;

    return {
      proposed_date: f.proposed_date,
      end_date: f.end_date || f.proposed_date,

      requester_service: cleanStr(f.requester_service),
      requester_name: cleanStr(f.requester_name),
      requester_contact: cleanStr(f.requester_contact),
      trip_type: cleanStr(f.trip_type) || 'SERVICE',
      passenger_count: cleanInt(f.passenger_count),

      departure_place: cleanStr(f.departure_place),
      destination_place: cleanStr(f.destination_place),

      objet: String(f.objet || '').trim(),
      itinerary: itinerary,
      people: String(f.people || '').trim(),
      observations: cleanStr(f.observations),

      depart_time_wanted: cleanStr(f.depart_time_wanted),
      return_time_expected: cleanStr(f.return_time_expected),

      vehicle_hint: cleanStr(f.vehicle_hint),
      driver_hint: cleanStr(f.driver_hint),

      // contrôle (optionnel)
      actual_out_time: cleanStr(f.actual_out_time),
      actual_return_time: cleanStr(f.actual_return_time),
      odometer_start: cleanInt(f.odometer_start),
      odometer_end: cleanInt(f.odometer_end),
      fuel_level_start: cleanInt(f.fuel_level_start),
      fuel_level_end: cleanInt(f.fuel_level_end)
    };
  }

  const canSubmitCreate = useMemo(() => {
    const b = createBodyFromForm(form);
    // ✅ essentiels : évite les allers-retours
    if (!b.requester_service) return false;
    if (!b.requester_name) return false;
    if (!b.requester_contact) return false;
    if (!b.trip_type) return false;
    if (!b.departure_place) return false;
    if (!b.destination_place) return false;
    if (!b.passenger_count || b.passenger_count <= 0) return false;

    if (!b.objet || !b.objet.trim()) return false;
    if (!b.people || !b.people.trim()) return false;

    // itinéraire auto OK, mais si vide ET pas départ/destination (déjà contrôlé), c’est mort
    if (!b.itinerary || !String(b.itinerary).trim()) return false;
    return true;
  }, [form]);

  const create = async () => {
    setCreating(true);
    setErr(null);
    try {
      const body = createBodyFromForm(form);
      await apiFetch('/api/requests/car', { method: 'POST', token, body });
      closeCreate();
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

  function canEditRequestFields(r) {
    if (!r) return false;
    if (role === 'DEMANDEUR') return r.status === 'SUBMITTED';
    if (['ADMIN', 'LOGISTIQUE'].includes(role)) return r.status === 'SUBMITTED';
    return false;
  }

  function canEditControlFields(r) {
    if (!r) return false;
    if (!['ADMIN', 'LOGISTIQUE'].includes(role)) return false;
    return r.status === 'RAF_APPROVED';
  }

  const openEdit = async (r, mode) => {
    // On prend la ligne (cr.*) ; si tu veux, on peut recharger /:id, mais ici pas nécessaire
    setEditModal({ id: r.id, mode, status: r.status });

    setDraft({
      proposed_date: String(r.proposed_date || '').slice(0, 10),
      end_date: String(r.end_date || r.proposed_date || '').slice(0, 10),

      requester_service: r.requester_service || '',
      requester_name: r.requester_name || r.requester_username || '',
      requester_contact: r.requester_contact || '',
      trip_type: r.trip_type || 'SERVICE',
      passenger_count: r.passenger_count ?? '',

      departure_place: r.departure_place || '',
      destination_place: r.destination_place || '',
      itinerary: r.itinerary || '',
      objet: r.objet || '',
      people: r.people || '',
      observations: r.observations || '',

      depart_time_wanted: r.depart_time_wanted || '',
      return_time_expected: r.return_time_expected || '',

      vehicle_hint: r.vehicle_hint || '',
      driver_hint: r.driver_hint || '',

      actual_out_time: r.actual_out_time || '',
      actual_return_time: r.actual_return_time || '',
      odometer_start: r.odometer_start ?? '',
      odometer_end: r.odometer_end ?? '',
      fuel_level_start: r.fuel_level_start ?? '',
      fuel_level_end: r.fuel_level_end ?? ''
    });
  };

  const closeEdit = () => {
    setEditModal(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editModal?.id || !draft) return;

    setSaving(true);
    try {
      const auto = buildItinerary(draft.departure_place, draft.destination_place);
      const itinerary = String(draft.itinerary || '').trim() || auto;

      // ✅ 2 modes : REQUEST (tout) vs CONTROL (juste contrôle)
      let body;

      if (editModal.mode === 'CONTROL') {
        body = {
          actual_out_time: cleanStr(draft.actual_out_time),
          actual_return_time: cleanStr(draft.actual_return_time),
          odometer_start: cleanInt(draft.odometer_start),
          odometer_end: cleanInt(draft.odometer_end),
          fuel_level_start: cleanInt(draft.fuel_level_start),
          fuel_level_end: cleanInt(draft.fuel_level_end)
        };
      } else {
        body = {
          proposed_date: draft.proposed_date,
          end_date: draft.end_date || draft.proposed_date,

          requester_service: cleanStr(draft.requester_service),
          requester_name: cleanStr(draft.requester_name),
          requester_contact: cleanStr(draft.requester_contact),
          trip_type: cleanStr(draft.trip_type) || 'SERVICE',
          passenger_count: cleanInt(draft.passenger_count),

          departure_place: cleanStr(draft.departure_place),
          destination_place: cleanStr(draft.destination_place),

          objet: String(draft.objet || '').trim(),
          itinerary: itinerary,
          people: String(draft.people || '').trim(),
          observations: cleanStr(draft.observations),

          depart_time_wanted: cleanStr(draft.depart_time_wanted),
          return_time_expected: cleanStr(draft.return_time_expected),

          vehicle_hint: cleanStr(draft.vehicle_hint),
          driver_hint: cleanStr(draft.driver_hint)
        };
      }

      await apiFetch(`/api/requests/car/${editModal.id}`, { method: 'PUT', token, body });
      closeEdit();
      await load();
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      setSaving(false);
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
      await apiFetch(`/api/requests/car/${id}/visa`, {
        method: 'POST',
        token,
        body: { vehicle_id: vehicle_id || null, driver_id: driver_id || null }
      });
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

  const cancelRequest = async (id) => {
    const reason = prompt("Motif d'annulation (optionnel) :") || '';
    const ok = confirm('Annuler cette demande ?');
    if (!ok) return;
    try {
      await apiFetch(`/api/requests/car/${id}/cancel`, { method: 'POST', token, body: { reason } });
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const fuelOptions = [
    { v: '', label: '(vide)' },
    { v: 0, label: '0%' },
    { v: 25, label: '25%' },
    { v: 50, label: '50%' },
    { v: 75, label: '75%' },
    { v: 100, label: '100%' }
  ];

  return (
    <div>
      {/* ✅ Header + bouton modal */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ marginTop: 0, marginBottom: 0 }}>Demandes voiture</h1>

        {canCreate && (
          <button className="btn" onClick={openCreate} title="Nouvelle demande voiture">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ion-icon name="add-circle-outline" style={{ fontSize: 18 }} />
              Nouvelle demande voiture
            </span>
          </button>
        )}
      </div>

      {err && <div className="muted" style={{ color: '#b91c1c', marginTop: 10 }}>{err}</div>}

      {/* ✅ Filtres */}
      <div className="row" style={{ margin: '12px 0' }}>
        <div className="field" style={{ flex: 1, minWidth: 240 }}>
          <div className="label">Recherche</div>
          <input
            className="input"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="N°, objet, départ/destination, chauffeur…"
          />
        </div>

        <div className="field" style={{ minWidth: 200 }}>
          <div className="label">Statut</div>
          <select
            className="input"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'Tous' : s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ✅ Table */}
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
            ) : filteredRequests.length ? (
              filteredRequests.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.request_no}</b></td>
                  <td>{periodLabel(r)}</td>
                  <td>{r.objet}</td>
                  <td>{r.departure_place || '—'}</td>
                  <td>{r.destination_place || '—'}</td>
                  <td>{Number.isFinite(Number(r.passenger_count)) ? r.passenger_count : '—'}</td>

                  {showRequester && (
                    <>
                      <td>{r.requester_name || r.requester_username || '—'}</td>
                      <td>{r.requester_service || '—'}</td>
                    </>
                  )}

                  {showAssigned && (
                    <>
                      <td>{r.vehicle_plate || '—'}</td>
                      <td>{r.driver_name || '—'}</td>
                    </>
                  )}

                  <td><span className="badge badge-ok">{r.status}</span></td>

                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openView(r.id)}>
                      <ion-icon name="eye-outline" />
                      <span style={{ marginLeft: 6 }}>Voir</span>
                    </button>
                    <span style={{ display: 'inline-block', width: 8 }} />

                    {(canEditRequestFields(r) || canEditControlFields(r)) && (
                      <>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => openEdit(r, canEditControlFields(r) ? 'CONTROL' : 'REQUEST')}
                          title={canEditControlFields(r) ? 'Compléter sortie/retour' : 'Modifier demande'}
                        >
                          <ion-icon name="create-outline" />
                          <span style={{ marginLeft: 6 }}>
                            {canEditControlFields(r) ? 'Sortie/Retour' : 'Modifier'}
                          </span>
                        </button>
                        <span style={{ display: 'inline-block', width: 8 }} />
                      </>
                    )}

                    {role === 'DEMANDEUR' && ['SUBMITTED', 'LOGISTICS_APPROVED'].includes(r.status) && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => cancelRequest(r.id)}>
                          <ion-icon name="close-circle-outline" />
                          <span style={{ marginLeft: 6 }}>Annuler</span>
                        </button>
                        <span style={{ display: 'inline-block', width: 8 }} />
                      </>
                    )}

                    <a className="btn btn-outline btn-sm" href={`/print/car/${r.id}`} target="_blank" rel="noreferrer">
                      <ion-icon name="print-outline" />
                      <span style={{ marginLeft: 6 }}>Imprimer</span>
                    </a>
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

                    {(canVisaLogistique && r.status === 'SUBMITTED') && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => reject(r.id)}>Non-valider</button>
                        <span style={{ display: 'inline-block', width: 8 }} />
                      </>
                    )}

                    {(canVisaRaf && r.status === 'LOGISTICS_APPROVED') && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => reject(r.id)}>Non-valider</button>
                        <span style={{ display: 'inline-block', width: 8 }} />
                      </>
                    )}

                    {canSoftDelete && (
                      <button className="btn btn-danger btn-sm" onClick={() => softDelete(r)}>
                        <ion-icon name="trash-outline" />
                        <span style={{ marginLeft: 6 }}>Corbeille</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={columns.length} className="muted">Aucune demande.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ MODAL création */}
      {createOpen && (
        <Modal title="Nouvelle demande voiture" onClose={closeCreate} width={980}>
          <div className="muted" style={{ marginBottom: 10 }}>
            Champs essentiels obligatoires (service, demandeur, type, trajet, nb passagers) pour éviter les retours Logistique/RAF.
          </div>

          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Demandeur</div>
            <div className="grid2">
              <div className="field">
                <div className="label">Service / Direction *</div>
                <input className="input" value={form.requester_service} onChange={(e) => setForm({ ...form, requester_service: e.target.value })} placeholder="Ex: Informatique, Admin, Finance..." />
              </div>
              <div className="field">
                <div className="label">Type de déplacement *</div>
                <select className="input" value={form.trip_type} onChange={(e) => setForm({ ...form, trip_type: e.target.value })}>
                  <option value="SERVICE">SERVICE</option>
                  <option value="MISSION">MISSION</option>
                  <option value="URGENCE">URGENCE</option>
                </select>
              </div>
              <div className="field">
                <div className="label">Nom du demandeur *</div>
                <input className="input" value={form.requester_name} onChange={(e) => setForm({ ...form, requester_name: e.target.value })} />
              </div>
              <div className="field">
                <div className="label">Contact (tél/email) *</div>
                <input className="input" value={form.requester_contact} onChange={(e) => setForm({ ...form, requester_contact: e.target.value })} placeholder="Téléphone ou email" />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Trajet & période</div>
            <div className="grid2">
              <div className="field">
                <div className="label">Date début *</div>
                <input
                  className="input"
                  type="date"
                  value={form.proposed_date}
                  onChange={(e) => setForm({ ...form, proposed_date: e.target.value, end_date: form.end_date || e.target.value })}
                />
              </div>
              <div className="field">
                <div className="label">Date fin *</div>
                <input
                  className="input"
                  type="date"
                  value={form.end_date}
                  min={form.proposed_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>

              <div className="field">
                <div className="label">Lieu de départ *</div>
                <input
                  className="input"
                  value={form.departure_place}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...form, departure_place: v };
                    if (!String(form.itinerary || '').trim()) next.itinerary = buildItinerary(v, form.destination_place);
                    setForm(next);
                  }}
                  placeholder="Ex: Bureau PRIRTEM"
                />
              </div>

              <div className="field">
                <div className="label">Destination *</div>
                <input
                  className="input"
                  value={form.destination_place}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...form, destination_place: v };
                    if (!String(form.itinerary || '').trim()) next.itinerary = buildItinerary(form.departure_place, v);
                    setForm(next);
                  }}
                  placeholder="Ex: Port, Site, Commune..."
                />
              </div>

              <div className="field">
                <div className="label">Nombre de passagers *</div>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.passenger_count}
                  onChange={(e) => setForm({ ...form, passenger_count: e.target.value })}
                  placeholder="Ex: 4"
                />
              </div>

              <div className="field">
                <div className="label">Objet *</div>
                <input className="input" value={form.objet} onChange={(e) => setForm({ ...form, objet: e.target.value })} placeholder="Objet..." />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <div className="label">Itinéraire (détails) *</div>
                <textarea className="input" rows={2} value={form.itinerary} onChange={(e) => setForm({ ...form, itinerary: e.target.value })} placeholder="Ex: PRIRTEM → RN2 → ... → Destination" />
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Participants & horaires</div>
            <div className="grid2">
              <div className="field">
                <div className="label">Personnes transportées (liste) *</div>
                <textarea className="input" rows={3} value={form.people} onChange={(e) => setForm({ ...form, people: e.target.value })} placeholder="Noms des personnes..." />
              </div>
              <div className="field">
                <div className="label">Observations</div>
                <textarea className="input" rows={3} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} placeholder="Matériel, arrêts, contraintes horaires..." />
              </div>

              <div className="field">
                <div className="label">Heure départ souhaitée</div>
                <input className="input" type="time" value={form.depart_time_wanted} onChange={(e) => setForm({ ...form, depart_time_wanted: e.target.value })} />
              </div>
              <div className="field">
                <div className="label">Heure probable retour</div>
                <input className="input" type="time" value={form.return_time_expected} onChange={(e) => setForm({ ...form, return_time_expected: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Affectation (si connu)</div>
            <div className="grid2">
              <div className="field">
                <div className="label">Immatriculation (hint)</div>
                <input className="input" list="vehicleHintList" value={form.vehicle_hint} onChange={(e) => setForm({ ...form, vehicle_hint: e.target.value })} placeholder="ex: 39961 WWT" />
              </div>
              <div className="field">
                <div className="label">Chauffeur (hint)</div>
                <input className="input" list="driverHintList" value={form.driver_hint} onChange={(e) => setForm({ ...form, driver_hint: e.target.value })} placeholder="Nom chauffeur..." />
              </div>
            </div>

            <datalist id="vehicleHintList">
              {(vehicles || []).filter((v) => v && v.plate).map((v) => (
                <option key={v.id} value={v.plate}>
                  {`${v.plate} — ${[v.label, v.brand, v.model].filter(Boolean).join(' ')}`}
                </option>
              ))}
            </datalist>

            <datalist id="driverHintList">
              {(drivers || []).filter((d) => d && d.full_name).map((d) => (
                <option key={d.id} value={d.full_name}>
                  {d.full_name}
                </option>
              ))}
            </datalist>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <button className="btn btn-outline" onClick={closeCreate}>Annuler</button>
            <button className="btn" onClick={create} disabled={creating || !canSubmitCreate}>
              Envoyer
            </button>
          </div>
        </Modal>
      )}

      {/* ✅ MODAL view */}
      {view && (
        <Modal title={view.loading ? 'Chargement...' : `Détails ${view.data?.request_no || ''}`} onClose={() => setView(null)} width={820}>
          {view.loading ? (
            <div className="muted">Chargement...</div>
          ) : view.data ? (
            <div>
              <div className="grid2">
                <div className="card">
                  <div className="muted">Période</div>
                  <div style={{ fontWeight: 800 }}>{periodLabel(view.data)}</div>
                </div>
                <div className="card">
                  <div className="muted">Statut</div>
                  <div style={{ fontWeight: 800 }}>{String(view.data.status || '')}</div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 10 }}>
                <div className="grid2">
                  <div>
                    <div className="muted">Service / Direction</div>
                    <div style={{ fontWeight: 800 }}>{view.data.requester_service || '—'}</div>
                  </div>
                  <div>
                    <div className="muted">Type déplacement</div>
                    <div style={{ fontWeight: 800 }}>{view.data.trip_type || '—'}</div>
                  </div>
                  <div>
                    <div className="muted">Demandeur</div>
                    <div style={{ fontWeight: 800 }}>{view.data.requester_name || view.data.requester_username || '—'}</div>
                  </div>
                  <div>
                    <div className="muted">Contact</div>
                    <div style={{ fontWeight: 800 }}>{view.data.requester_contact || '—'}</div>
                  </div>
                </div>

                <hr />

                <div className="muted">Objet</div>
                <div style={{ fontWeight: 800 }}>{view.data.objet}</div>

                <hr />

                <div className="grid2">
                  <div>
                    <div className="muted">Départ</div>
                    <div style={{ fontWeight: 800 }}>{view.data.departure_place || '—'}</div>
                  </div>
                  <div>
                    <div className="muted">Destination</div>
                    <div style={{ fontWeight: 800 }}>{view.data.destination_place || '—'}</div>
                  </div>
                  <div>
                    <div className="muted">Nb passagers</div>
                    <div style={{ fontWeight: 800 }}>{Number.isFinite(Number(view.data.passenger_count)) ? view.data.passenger_count : '—'}</div>
                  </div>
                  <div>
                    <div className="muted">Itinéraire</div>
                    <div style={{ fontWeight: 800 }}>{view.data.itinerary || '—'}</div>
                  </div>
                </div>

                <hr />

                <div className="muted">Personnes transportées</div>
                <div>{view.data.people}</div>

                {view.data.observations ? (
                  <>
                    <hr />
                    <div className="muted">Observations</div>
                    <div>{view.data.observations}</div>
                  </>
                ) : null}

                <hr />

                <div className="row" style={{ gap: 10 }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="muted">Départ souhaité</div>
                    <div style={{ fontWeight: 800 }}>{String(view.data.depart_time_wanted || '') || '—'}</div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="muted">Retour probable</div>
                    <div style={{ fontWeight: 800 }}>{String(view.data.return_time_expected || '') || '—'}</div>
                  </div>
                </div>

                <hr />

                <div className="row" style={{ gap: 10 }}>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="muted">Immatriculation</div>
                    <div style={{ fontWeight: 800 }}>{view.data.vehicle_plate || '—'}</div>
                  </div>
                  <div className="card" style={{ flex: 1 }}>
                    <div className="muted">Chauffeur</div>
                    <div style={{ fontWeight: 800 }}>{view.data.driver_name || '—'}</div>
                  </div>
                </div>

                <hr />

                <div className="grid2">
                  <div className="card">
                    <div className="muted">Sortie réelle</div>
                    <div style={{ fontWeight: 800 }}>{String(view.data.actual_out_time || '') || '—'}</div>
                  </div>
                  <div className="card">
                    <div className="muted">Retour réel</div>
                    <div style={{ fontWeight: 800 }}>{String(view.data.actual_return_time || '') || '—'}</div>
                  </div>
                  <div className="card">
                    <div className="muted">Km départ</div>
                    <div style={{ fontWeight: 800 }}>{Number.isFinite(Number(view.data.odometer_start)) ? view.data.odometer_start : '—'}</div>
                  </div>
                  <div className="card">
                    <div className="muted">Km retour</div>
                    <div style={{ fontWeight: 800 }}>{Number.isFinite(Number(view.data.odometer_end)) ? view.data.odometer_end : '—'}</div>
                  </div>
                  <div className="card">
                    <div className="muted">Carburant départ</div>
                    <div style={{ fontWeight: 800 }}>{Number.isFinite(Number(view.data.fuel_level_start)) ? `${view.data.fuel_level_start}%` : '—'}</div>
                  </div>
                  <div className="card">
                    <div className="muted">Carburant retour</div>
                    <div style={{ fontWeight: 800 }}>{Number.isFinite(Number(view.data.fuel_level_end)) ? `${view.data.fuel_level_end}%` : '—'}</div>
                  </div>
                </div>
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10, gap: 10 }}>
                <a className="btn" href={`/print/car/${view.data.id}`} target="_blank" rel="noreferrer">
                  Imprimer
                </a>
              </div>
            </div>
          ) : (
            <div className="muted">Impossible de charger ce détail.</div>
          )}
        </Modal>
      )}

      {/* ✅ MODAL visa logistique */}
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

      {/* ✅ MODAL édition */}
      {editModal && draft && (
        <Modal
          title={editModal.mode === 'CONTROL' ? 'Compléter sortie / retour' : 'Modifier demande'}
          onClose={closeEdit}
          width={980}
        >
          {editModal.mode === 'CONTROL' ? (
            <div className="muted" style={{ marginBottom: 10 }}>
              Remplir les champs flotte/contrôle après Visa RAF (heure réelle, km, carburant).
            </div>
          ) : null}

          {editModal.mode !== 'CONTROL' && (
            <>
              <div className="card" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Demandeur</div>
                <div className="grid2">
                  <div className="field">
                    <div className="label">Service / Direction *</div>
                    <input className="input" value={draft.requester_service} onChange={(e) => setDraft({ ...draft, requester_service: e.target.value })} />
                  </div>
                  <div className="field">
                    <div className="label">Type de déplacement *</div>
                    <select className="input" value={draft.trip_type} onChange={(e) => setDraft({ ...draft, trip_type: e.target.value })}>
                      <option value="SERVICE">SERVICE</option>
                      <option value="MISSION">MISSION</option>
                      <option value="URGENCE">URGENCE</option>
                    </select>
                  </div>
                  <div className="field">
                    <div className="label">Nom du demandeur *</div>
                    <input className="input" value={draft.requester_name} onChange={(e) => setDraft({ ...draft, requester_name: e.target.value })} />
                  </div>
                  <div className="field">
                    <div className="label">Contact *</div>
                    <input className="input" value={draft.requester_contact} onChange={(e) => setDraft({ ...draft, requester_contact: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Trajet & période</div>
                <div className="grid2">
                  <div className="field">
                    <div className="label">Date début *</div>
                    <input className="input" type="date" value={draft.proposed_date} onChange={(e) => setDraft({ ...draft, proposed_date: e.target.value, end_date: draft.end_date || e.target.value })} />
                  </div>
                  <div className="field">
                    <div className="label">Date fin *</div>
                    <input className="input" type="date" value={draft.end_date} min={draft.proposed_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
                  </div>

                  <div className="field">
                    <div className="label">Départ *</div>
                    <input className="input" value={draft.departure_place} onChange={(e) => setDraft({ ...draft, departure_place: e.target.value })} />
                  </div>
                  <div className="field">
                    <div className="label">Destination *</div>
                    <input className="input" value={draft.destination_place} onChange={(e) => setDraft({ ...draft, destination_place: e.target.value })} />
                  </div>

                  <div className="field">
                    <div className="label">Nb passagers *</div>
                    <input className="input" type="number" min={1} value={draft.passenger_count} onChange={(e) => setDraft({ ...draft, passenger_count: e.target.value })} />
                  </div>

                  <div className="field">
                    <div className="label">Objet *</div>
                    <input className="input" value={draft.objet} onChange={(e) => setDraft({ ...draft, objet: e.target.value })} />
                  </div>

                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <div className="label">Itinéraire *</div>
                    <textarea className="input" rows={2} value={draft.itinerary} onChange={(e) => setDraft({ ...draft, itinerary: e.target.value })} />
                  </div>

                  <div className="field">
                    <div className="label">Départ souhaité</div>
                    <input className="input" type="time" value={draft.depart_time_wanted} onChange={(e) => setDraft({ ...draft, depart_time_wanted: e.target.value })} />
                  </div>
                  <div className="field">
                    <div className="label">Retour probable</div>
                    <input className="input" type="time" value={draft.return_time_expected} onChange={(e) => setDraft({ ...draft, return_time_expected: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Participants & observations</div>
                <div className="grid2">
                  <div className="field">
                    <div className="label">Personnes transportées *</div>
                    <textarea className="input" rows={3} value={draft.people} onChange={(e) => setDraft({ ...draft, people: e.target.value })} />
                  </div>
                  <div className="field">
                    <div className="label">Observations</div>
                    <textarea className="input" rows={3} value={draft.observations} onChange={(e) => setDraft({ ...draft, observations: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="card">
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Affectation (hint)</div>
                <div className="grid2">
                  <div className="field">
                    <div className="label">Immatriculation (hint)</div>
                    <input className="input" list="vehicleHintList" value={draft.vehicle_hint} onChange={(e) => setDraft({ ...draft, vehicle_hint: e.target.value })} />
                  </div>
                  <div className="field">
                    <div className="label">Chauffeur (hint)</div>
                    <input className="input" list="driverHintList" value={draft.driver_hint} onChange={(e) => setDraft({ ...draft, driver_hint: e.target.value })} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ✅ Contrôle sortie/retour */}
          {editModal.mode === 'CONTROL' && (
            <div className="card">
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Flotte / Contrôle sortie - retour</div>
              <div className="grid2">
                <div className="field">
                  <div className="label">Heure sortie réelle</div>
                  <input className="input" type="time" value={draft.actual_out_time} onChange={(e) => setDraft({ ...draft, actual_out_time: e.target.value })} />
                </div>
                <div className="field">
                  <div className="label">Heure retour réelle</div>
                  <input className="input" type="time" value={draft.actual_return_time} onChange={(e) => setDraft({ ...draft, actual_return_time: e.target.value })} />
                </div>

                <div className="field">
                  <div className="label">Kilométrage départ</div>
                  <input className="input" type="number" min={0} value={draft.odometer_start} onChange={(e) => setDraft({ ...draft, odometer_start: e.target.value })} />
                </div>
                <div className="field">
                  <div className="label">Kilométrage retour</div>
                  <input className="input" type="number" min={0} value={draft.odometer_end} onChange={(e) => setDraft({ ...draft, odometer_end: e.target.value })} />
                </div>

                <div className="field">
                  <div className="label">Niveau carburant départ</div>
                  <select className="input" value={draft.fuel_level_start} onChange={(e) => setDraft({ ...draft, fuel_level_start: e.target.value })}>
                    {fuelOptions.map((o) => (
                      <option key={String(o.v)} value={o.v}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <div className="label">Niveau carburant retour</div>
                  <select className="input" value={draft.fuel_level_end} onChange={(e) => setDraft({ ...draft, fuel_level_end: e.target.value })}>
                    {fuelOptions.map((o) => (
                      <option key={String(o.v)} value={o.v}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <button className="btn btn-outline" onClick={closeEdit}>Annuler</button>
            <button className="btn" onClick={saveEdit} disabled={saving}>
              Enregistrer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
