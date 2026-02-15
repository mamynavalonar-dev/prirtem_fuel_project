import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';
import './Logbooks.css';

function toYMD(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('fr-CA');
  return s;
}

export default function Logbooks() {
  const { token, user } = useAuth();
  const role = user?.role;
  const navigate = useNavigate();

  const canManage = ['ADMIN', 'LOGISTIQUE'].includes(role);

  const [vehicles, setVehicles] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // filters
  const [fVehicle, setFVehicle] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fType, setFType] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [q, setQ] = useState('');

  // view modal
  const [view, setView] = useState(null); // {loading, data}

  // create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    vehicle_id: '',
    logbook_type: 'SERVICE',
    period_start: '',
    period_end: '',
    objet: ''
  });

  const columns = useMemo(() => {
    return ['Véhicule', 'Période', 'Type', 'Objet', 'Km', 'Statut', 'Actions'];
  }, []);

  async function loadVehicles() {
    try {
      const d = await apiFetch('/api/vehicles', { token });
      setVehicles(d.vehicles || []);
    } catch {
      // silence
    }
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (fVehicle) params.set('vehicle_id', fVehicle);
      if (fStatus) params.set('status', fStatus);
      if (fType) params.set('type', fType);
      if (fFrom) params.set('from', fFrom);
      if (fTo) params.set('to', fTo);
      if (q) params.set('q', q);

      const d = await apiFetch(`/api/logbooks?${params.toString()}`, { token });
      setItems(d.items || []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVehicles();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fVehicle, fStatus, fType, fFrom, fTo, q]);

  const resetFilters = () => {
    setFVehicle('');
    setFStatus('');
    setFType('');
    setFFrom('');
    setFTo('');
    setQ('');
  };

  const openView = async (id) => {
    setView({ loading: true, data: null });
    try {
      const d = await apiFetch(`/api/logbooks/${id}`, { token });
      setView({ loading: false, data: d.item });
    } catch (e) {
      setView(null);
      alert(String(e.message || e));
    }
  };

  const openCreate = () => {
    setCreateForm({
      vehicle_id: '',
      logbook_type: 'SERVICE',
      period_start: '',
      period_end: '',
      objet: ''
    });
    setShowCreate(true);
  };

  const create = async () => {
    setCreating(true);
    try {
      const body = {
        ...createForm,
        period_start: createForm.period_start,
        period_end: createForm.period_end
      };
      await apiFetch('/api/logbooks', { method: 'POST', token, body });
      setShowCreate(false);
      await load();
    } catch (e) {
      alert(String(e.message || e));
    } finally {
      setCreating(false);
    }
  };

  const softDelete = async (id) => {
    const ok = confirm('Déplacer ce journal dans la corbeille ?');
    if (!ok) return;
    try {
      await apiFetch(`/api/logbooks/${id}`, { method: 'DELETE', token });
      await load();
      alert('✅ Déplacé dans la corbeille');
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const statusBadgeClass = (s) => {
    if (s === 'LOCKED') return 'badge-ok';
    if (s === 'SUBMITTED') return '';
    return '';
  };

  const typeChipClass = (t) => (t === 'MISSION' ? 'chip chip-mission' : 'chip chip-service');

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Journal de bord</h1>

      <div className="card logbooksCard">
        <div className="logbooksHeader">
          <div>
            <div style={{ fontWeight: 800, fontSize: 20 }}>Journaux de bord voiture</div>
          </div>

          <div className="logbooksHeaderRight">
            <div className="muted" style={{ fontWeight: 700 }}>
              {items.length} / {items.length}
            </div>

            {canManage && (
              <button className="btn btn-outline" onClick={openCreate}>
                <ion-icon name="add-circle-outline" style={{ marginRight: 8, fontSize: 18 }} />
                Créer un journal
              </button>
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ gap: 12 }}>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <div className="label">Véhicule</div>
              <select className="input" value={fVehicle} onChange={(e) => setFVehicle(e.target.value)}>
                <option value="">Tous</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <div className="label">Statut</div>
              <select className="input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                <option value="">Tous</option>
                <option value="DRAFT">DRAFT</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="LOCKED">LOCKED</option>
              </select>
            </div>

            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <div className="label">Type</div>
              <select className="input" value={fType} onChange={(e) => setFType(e.target.value)}>
                <option value="">Tous</option>
                <option value="SERVICE">SERVICE</option>
                <option value="MISSION">MISSION</option>
              </select>
            </div>
          </div>

          <div className="row" style={{ gap: 12, marginTop: 10 }}>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <div className="label">Du</div>
              <input className="input" type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
            </div>

            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <div className="label">Au</div>
              <input className="input" type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
            </div>

            <div className="field" style={{ flex: 2, minWidth: 280 }}>
              <div className="label">Recherche</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="input"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Immatriculation, objet, statut, type..."
                />
                <button className="btn btn-outline logbooksResetBtn" onClick={resetFilters} title="Réinitialiser les filtres">
                  <ion-icon name="refresh-outline" style={{ fontSize: 18 }} />
                  <span>Réinitialiser</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {err && <div className="muted" style={{ color: '#b91c1c', marginTop: 10 }}>{err}</div>}

        <div style={{ overflow: 'auto', marginTop: 14 }}>
          {/* ✅ zebra + lisibilité light */}
          <table className="table table-zebra logbooksTable">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="muted">
                    Chargement...
                  </td>
                </tr>
              ) : items.length ? (
                items.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 800 }}>{l.plate || l.vehicle_plate || l.vehicle_id}</td>
                    <td>
                      {toYMD(l.period_start)} → {toYMD(l.period_end)}
                    </td>
                    <td>
                      <span className={typeChipClass(l.logbook_type)}>{l.logbook_type}</span>
                    </td>
                    <td>{l.objet || ''}</td>
                    <td>
                      <span className="chip chip-service" style={{ marginRight: 6 }}>S: {Number(l.service_km || 0)}</span>
                      <span className="chip chip-mission">M: {Number(l.mission_km || 0)}</span>
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(l.status)}`}>{l.status}</span>
                    </td>
                    <td className="logbooksActionsCell">
                      {/* Voir */}
                      <button
                        className="iconActionBtn"
                        onClick={() => openView(l.id)}
                        title="Voir"
                        aria-label="Voir"
                      >
                        <ion-icon name="eye-outline" />
                      </button>

                      {/* Ouvrir */}
                      <button
                        className="iconActionBtn iconActionBtnPrimary"
                        onClick={() => navigate(`/app/logbooks/${l.id}`)}
                        title="Ouvrir"
                        aria-label="Ouvrir"
                      >
                        <ion-icon name="open-outline" />
                      </button>

                      {/* Imprimer */}
                      <a
                        className="iconActionBtn iconActionBtnDark"
                        href={`/print/logbook/${l.id}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Imprimer"
                        aria-label="Imprimer"
                      >
                        <ion-icon name="print-outline" />
                      </a>

                      {/* Corbeille */}
                      {canManage && (
                        <button
                          className="iconActionBtn iconActionBtnDanger"
                          onClick={() => softDelete(l.id)}
                          title="Mettre à la corbeille"
                          aria-label="Mettre à la corbeille"
                        >
                          <ion-icon name="trash-outline" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="muted">
                    Aucun journal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREATE */}
      {showCreate && (
        <Modal title="Créer un journal" onClose={() => setShowCreate(false)} width={720}>
          <div className="row" style={{ gap: 12 }}>
            <div className="field" style={{ flex: 1, minWidth: 260 }}>
              <div className="label">Véhicule</div>
              <select
                className="input"
                value={createForm.vehicle_id}
                onChange={(e) => setCreateForm({ ...createForm, vehicle_id: e.target.value })}
              >
                <option value="">-- sélectionner --</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ flex: 1, minWidth: 260 }}>
              <div className="label">Type de journal</div>
              <select
                className="input"
                value={createForm.logbook_type}
                onChange={(e) => setCreateForm({ ...createForm, logbook_type: e.target.value })}
              >
                <option value="SERVICE">SERVICE</option>
                <option value="MISSION">MISSION</option>
              </select>
            </div>
          </div>

          <div className="row" style={{ gap: 12, marginTop: 10 }}>
            <div className="field" style={{ flex: 1, minWidth: 260 }}>
              <div className="label">Du</div>
              <input
                className="input"
                type="date"
                value={createForm.period_start}
                onChange={(e) =>
                  setCreateForm({ ...createForm, period_start: e.target.value, period_end: createForm.period_end || e.target.value })
                }
              />
            </div>

            <div className="field" style={{ flex: 1, minWidth: 260 }}>
              <div className="label">Au</div>
              <input
                className="input"
                type="date"
                value={createForm.period_end}
                min={createForm.period_start}
                onChange={(e) => setCreateForm({ ...createForm, period_end: e.target.value })}
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <div className="label">Objet</div>
            <input
              className="input"
              value={createForm.objet}
              onChange={(e) => setCreateForm({ ...createForm, objet: e.target.value })}
              placeholder="(optionnel)"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn" onClick={create} disabled={creating}>
              Créer et ouvrir
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL VIEW */}
      {view && (
        <Modal title="Détail journal" onClose={() => setView(null)} width={760}>
          {view.loading ? (
            <div className="muted">Chargement...</div>
          ) : view.data ? (
            <div className="card">
              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div className="muted">Véhicule</div>
                  <div style={{ fontWeight: 800 }}>{view.data.plate || view.data.vehicle_plate || view.data.vehicle_id}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="muted">Type</div>
                  <div style={{ fontWeight: 800 }}>{view.data.logbook_type}</div>
                </div>
              </div>

              <div className="row" style={{ gap: 12, marginTop: 10 }}>
                <div style={{ flex: 1 }}>
                  <div className="muted">Période</div>
                  <div>
                    {toYMD(view.data.period_start)} → {toYMD(view.data.period_end)}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="muted">Statut</div>
                  <div style={{ fontWeight: 800 }}>{view.data.status}</div>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div className="muted">Objet</div>
                <div>{view.data.objet || ''}</div>
              </div>
            </div>
          ) : (
            <div className="muted">Introuvable.</div>
          )}
        </Modal>
      )}
    </div>
  );
}
