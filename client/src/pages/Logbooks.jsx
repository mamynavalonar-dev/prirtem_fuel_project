import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

function fmtDate(d) {
  if (!d) return '';
  const s = String(d);
  // ISO -> YYYY-MM-DD...
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

function toYmd(s) {
  if (!s) return null;
  // accept "YYYY-MM-DD" or iso string
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export default function Logbooks() {
  const { token, user } = useAuth();
  const role = user?.role;

  const [vehicles, setVehicles] = useState([]);
  const [logbooks, setLogbooks] = useState([]);

  const [form, setForm] = useState({ vehicle_id: '', period_start: '', period_end: '', objet: '' });

  // 🔎 filtre UI
  const [filter, setFilter] = useState({
    vehicle_id: '',
    status: '',
    date_from: '',
    date_to: '',
    q: ''
  });

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState(null); // {loading, book, trips, supplies}

  async function load() {
    setError(null);
    const v = await apiFetch('/api/meta/vehicles', { token });
    setVehicles(v.vehicles || []);
    const lb = await apiFetch('/api/logbooks', { token });
    setLogbooks(lb.logbooks || []);
  }

  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function openView(id) {
    setView({ loading: true, book: null, trips: [], supplies: [] });
    try {
      const d = await apiFetch(`/api/logbooks/${id}`, { token });
      setView({ loading: false, book: d.logbook, trips: d.trips || [], supplies: d.supplies || [] });
    } catch (e) {
      setView(null);
      alert(e.message || String(e));
    }
  }

  async function create(e) {
    e.preventDefault();
    if (!['LOGISTIQUE','ADMIN'].includes(role)) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch('/api/logbooks', { token, method: 'POST', body: { ...form, objet: form.objet || null } });
      setForm({ vehicle_id: '', period_start: '', period_end: '', objet: '' });
      await load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  }

  const vehicleMap = useMemo(() => {
    const m = new Map();
    vehicles.forEach(v => m.set(String(v.id), v));
    return m;
  }, [vehicles]);

  const filtered = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    const fVeh = filter.vehicle_id ? String(filter.vehicle_id) : '';
    const fStatus = filter.status || '';
    const fFrom = filter.date_from ? toYmd(filter.date_from) : null;
    const fTo = filter.date_to ? toYmd(filter.date_to) : null;

    return (logbooks || []).filter(lb => {
      if (fVeh) {
        // lb.vehicle_id si dispo sinon fallback by plate compare
        if (lb.vehicle_id != null) {
          if (String(lb.vehicle_id) !== fVeh) return false;
        } else {
          const v = vehicleMap.get(fVeh);
          if (v?.plate && String(lb.plate) !== String(v.plate)) return false;
        }
      }
      if (fStatus && String(lb.status) !== fStatus) return false;

      const ps = toYmd(lb.period_start) || '';
      const pe = toYmd(lb.period_end) || '';

      if (fFrom && pe && pe < fFrom) return false; // le journal finit avant le filtre
      if (fTo && ps && ps > fTo) return false;     // le journal commence après le filtre

      if (q) {
        const hay = `${lb.plate || ''} ${lb.objet || ''} ${lb.status || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logbooks, filter, vehicleMap]);

  function badgeClass(status) {
    if (status === 'LOCKED') return 'badge-ok';
    if (status === 'SUBMITTED') return 'badge-info';
    if (status === 'REJECTED') return 'badge-bad';
    return 'badge-warn';
  }

  return (
    <div className="grid2">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <h2 style={{ margin: 0 }}>Journaux de bord voiture</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {filtered.length} / {logbooks.length}
          </div>
        </div>

        {error && <div className="alert">{error}</div>}

        {/* 🔎 FILTRE */}
        <div className="card" style={{ marginTop: 12, padding: 12, background: '#fafafa' }}>
          <div className="row2">
            <label>
              Véhicule
              <select
                value={filter.vehicle_id}
                onChange={(e) => setFilter({ ...filter, vehicle_id: e.target.value })}
              >
                <option value="">Tous</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
              </select>
            </label>

            <label>
              Statut
              <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
                <option value="">Tous</option>
                <option value="DRAFT">DRAFT</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="LOCKED">LOCKED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </label>
          </div>

          <div className="row2" style={{ marginTop: 10 }}>
            <label>
              Du
              <input type="date" value={filter.date_from} onChange={(e) => setFilter({ ...filter, date_from: e.target.value })} />
            </label>
            <label>
              Au
              <input type="date" value={filter.date_to} onChange={(e) => setFilter({ ...filter, date_to: e.target.value })} />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'flex-end' }}>
            <label style={{ flex: 1 }}>
              Recherche
              <input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Immatriculation, objet, statut..." />
            </label>
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => setFilter({ vehicle_id: '', status: '', date_from: '', date_to: '', q: '' })}
            >
              Reset
            </button>
          </div>
        </div>

        {/* LISTE */}
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Véhicule</th>
                <th>Période</th>
                <th>Objet</th>
                <th>Km</th>
                <th>Statut</th>
                <th style={{ width: 320 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lb) => (
                <tr key={lb.id}>
                  <td><b>{lb.plate}</b></td>
                  <td>{fmtDate(lb.period_start)} → {fmtDate(lb.period_end)}</td>
                  <td>{lb.objet ? String(lb.objet).slice(0, 60) : <span className="muted">—</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="badge badge-info" style={{ marginRight: 6 }}>S: {lb.service_km ?? 0}</span>
                    <span className="badge badge-warn">M: {lb.mission_km ?? 0}</span>
                  </td>
                  <td>
                    <span className={`badge ${badgeClass(lb.status)}`}>{lb.status}</span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openView(lb.id)}>Voir</button>
                    <span style={{ display: 'inline-block', width: 8 }} />
                    <Link className="btn btn-secondary btn-sm" to={`/app/logbooks/${lb.id}`}>Ouvrir</Link>
                    <span style={{ display: 'inline-block', width: 8 }} />
                    <a className="btn btn-sm" href={`/print/logbook/${lb.id}`} target="_blank" rel="noreferrer">Imprimer</a>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={6} className="muted">Aucun journal.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE */}
      <div className="card">
        <h3>Créer un journal</h3>
        {!['LOGISTIQUE','ADMIN'].includes(role) ? (
          <div className="muted">Accès Logistique/Admin.</div>
        ) : (
          <form onSubmit={create} className="form">
            <label>
              Véhicule
              <select value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} required>
                <option value="">-- sélectionner --</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
              </select>
            </label>

            <div className="row2">
              <label>
                Du
                <input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} required />
              </label>
              <label>
                Au
                <input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} required />
              </label>
            </div>

            <label>
              Objet
              <input value={form.objet} onChange={(e) => setForm({ ...form, objet: e.target.value })} placeholder="(optionnel)" />
            </label>

            <button className="btn" disabled={loading}>{loading ? '...' : 'Créer et ouvrir'}</button>
          </form>
        )}
      </div>

      {/* MODAL DETAILS */}
      {view && (
        <Modal title="Détails journal de bord" onClose={() => setView(null)} width={900}>
          {view.loading ? (
            <div className="muted">Chargement...</div>
          ) : view.book ? (
            <div className="grid2">
              <div className="card">
                <div className="label">Véhicule</div>
                <div><b>{view.book.plate}</b> <span className="muted">{view.book.label || ''}</span></div>
                <div className="label" style={{ marginTop: 10 }}>Période</div>
                <div><b>{fmtDate(view.book.period_start)}</b> → <b>{fmtDate(view.book.period_end)}</b></div>
                <div className="label" style={{ marginTop: 10 }}>Objet</div>
                <div>{view.book.objet || <span className="muted">—</span>}</div>
                <div className="label" style={{ marginTop: 10 }}>Km</div>
                <div>
                  <span className="badge badge-info" style={{ marginRight: 6 }}>Services: {view.book.service_km ?? 0}</span>
                  <span className="badge badge-warn">Mission: {view.book.mission_km ?? 0}</span>
                </div>
                <div className="label" style={{ marginTop: 10 }}>Statut</div>
                <div><span className={`badge ${badgeClass(view.book.status)}`}>{view.book.status}</span></div>
              </div>

              <div className="card">
                <div className="label">Résumé</div>
                <div className="muted">Trajets: {view.trips.length} • Appro carburant: {view.supplies.length}</div>
                <hr />
                <div className="label">Derniers trajets</div>
                <ul className="muted" style={{ marginTop: 8 }}>
                  {view.trips.slice(0, 6).map((t) => (
                    <li key={t.id}>{fmtDate(t.trip_date)} — {t.route_start || '...'} → {t.route_end || '...'}</li>
                  ))}
                  {!view.trips.length && <li>—</li>}
                </ul>

                <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                  <Link className="btn btn-secondary" to={`/app/logbooks/${view.book.id}`}>Ouvrir</Link>
                  <a className="btn" href={`/print/logbook/${view.book.id}`} target="_blank" rel="noreferrer">Imprimer</a>
                </div>
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
