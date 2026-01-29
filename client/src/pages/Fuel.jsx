import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch, getApiUrl } from '../utils/api.js';
import Modal from '../components/Modal.jsx';

function fmt(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

// ✅ Convertit n'importe quel format en "YYYY-MM-DD"
function toYMD(v) {
  if (!v) return '';
  const s = String(v);

  // déjà OK
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ISO "2023-12-31T21:00:00.000Z" => "2023-12-31"
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

  // Date object ou string autre => essaye
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) {
    // ⚠️ On récupère le jour local (ton PC) => OK pour affichage
    // si tu veux absolument Madagascar : ajouter { timeZone: 'Indian/Antananarivo' }
    return d.toLocaleDateString('fr-CA'); // yyyy-mm-dd
  }

  return s;
}

function toMoneyAr(v) {
  const n = Number(v || 0);
  return n.toLocaleString('fr-FR');
}

export default function Fuel() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState('vehicle');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

  // ========== ÉTAT POUR CRUD ==========
  const [viewModal, setViewModal] = useState(null); // {log}
  const [editModal, setEditModal] = useState(null); // {log, draft}

  const canManage = user && ['LOGISTIQUE', 'ADMIN'].includes(user.role);
  const canExport = canManage;

  useEffect(() => {
    apiFetch('/api/meta/vehicles', { token })
      .then((d) => setVehicles(d.vehicles || []))
      .catch(() => setVehicles([]));
  }, [token]);

  async function load() {
    setError(null);
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (tab === 'vehicle' && vehicleId) qs.set('vehicle_id', vehicleId);

    try {
      const d = await apiFetch(`/api/fuel/${tab}?${qs.toString()}`, { token });

      // ✅ Normalise log_date directement
      const fixed = (d.logs || []).map((r) => ({
        ...r,
        log_date: toYMD(r.log_date),
      }));

      setLogs(fixed);
    } catch (e) {
      setError(e.message);
      setLogs([]);
    }
  }

  useEffect(() => { load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportCsv() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (tab === 'vehicle' && vehicleId) qs.set('vehicle_id', vehicleId);

    const url = `${getApiUrl()}/api/fuel/export?type=${encodeURIComponent(tab)}&${qs.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const txt = await res.text();
      alert(`Export failed: ${txt}`);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `export_${tab}_${from || 'all'}_${to || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ========== VOIR DÉTAILS ==========
  function openView(log) {
    setViewModal({ log: { ...log, log_date: toYMD(log.log_date) } });
  }

  // ========== MODIFIER ==========
  function openEdit(log) {
    const fixedLog = { ...log, log_date: toYMD(log.log_date) };
    setEditModal({ log: fixedLog, draft: { ...fixedLog } });
  }

  async function saveEdit() {
    if (!editModal) return;
    setError(null);
    try {
      const endpoint = `/api/fuel/${tab}/${editModal.log.id}`;
      await apiFetch(endpoint, { token, method: 'PUT', body: editModal.draft });
      setEditModal(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  // ========== SUPPRIMER (CORBEILLE) ==========
  async function handleDelete(log) {
    if (!confirm(`Supprimer cette ligne ?\n${log.log_date || ''}`)) return;
    setError(null);
    try {
      await apiFetch(`/api/fuel/${tab}/${log.id}`, { token, method: 'DELETE' });
      await load();
      alert('✅ Envoyé dans le corbeille');
    } catch (e) {
      setError(e.message);
    }
  }

  const columns = useMemo(() => {
    if (tab === 'vehicle') {
      return [
        ['log_date', 'Date'],
        ['plate', 'Véhicule'],
        ['day_name', 'Jour'],
        ['km_depart', 'Km départ'],
        ['km_arrivee', 'Km arrivée'],
        ['km_jour', 'Km/j'],
        ['compteur', 'Compteur'],
        ['liters', 'Litres'],
        ['montant_ar', 'Montant (Ar)'],
        ['is_refill', 'Plein'],
        ['chauffeur', 'Chauffeur'],
        ['lien', 'Lien']
      ];
    }
    if (tab === 'generator') {
      return [
        ['log_date', 'Date'],
        ['liters', 'Litres'],
        ['montant_ar', 'Montant (Ar)'],
        ['source_file_name', 'Fichier']
      ];
    }
    return [
      ['log_date', 'Date'],
      ['liters', 'Litres'],
      ['montant_ar', 'Montant (Ar)'],
      ['lien', 'Lien'],
      ['source_file_name', 'Fichier']
    ];
  }, [tab]);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Suivi carburant</h2>
        <div className="row" style={{ gap: 8 }}>
          <button className={`btn ${tab === 'vehicle' ? '' : 'btn-secondary'}`} onClick={() => setTab('vehicle')}>Véhicules</button>
          <button className={`btn ${tab === 'generator' ? '' : 'btn-secondary'}`} onClick={() => setTab('generator')}>Groupe électrogène</button>
          <button className={`btn ${tab === 'other' ? '' : 'btn-secondary'}`} onClick={() => setTab('other')}>Autres</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="field">
            <label>Du</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>Au</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {tab === 'vehicle' && (
            <div className="field">
              <label>Véhicule</label>
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">(Tous)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.plate}</option>
                ))}
              </select>
            </div>
          )}
          <div className="row" style={{ alignItems: 'end', gap: 8 }}>
            <button className="btn" onClick={load}>Filtrer</button>
            {canExport && <button className="btn btn-secondary" onClick={exportCsv}>Export CSV</button>}
          </div>
        </div>

        {error && <div className="notice" style={{ marginTop: 12, color: '#b91c1c' }}>{error}</div>}

        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => <th key={c[0]}>{c[1]}</th>)}
                {canManage && <th style={{ width: 200 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {logs.map((row, idx) => (
                <tr key={row.id || idx} className={row.is_mission ? 'row-mission' : ''}>
                  {columns.map(([k]) => {
                    const v = row[k];
                    if (k === 'log_date') return <td key={k}>{toYMD(v)}</td>;
                    if (k === 'montant_ar') return <td key={k}>{toMoneyAr(v)}</td>;
                    if (k === 'is_refill') return <td key={k}>{row.is_refill ? 'Oui' : 'Non'}</td>;
                    if (k === 'lien' && v) return <td key={k}><a href={v} target="_blank" rel="noreferrer">Lien</a></td>;
                    return <td key={k}>{fmt(v)}</td>;
                  })}
                  {canManage && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openView(row)}>Voir</button>
                      <span style={{ display: 'inline-block', width: 6 }} />
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>Modifier</button>
                      <span style={{ display: 'inline-block', width: 6 }} />
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}>Mettre dans le corbeille</button>
                    </td>
                  )}
                </tr>
              ))}
              {!logs.length && <tr><td colSpan={columns.length + (canManage ? 1 : 0)} style={{ padding: 16, color: '#6b7280' }}>Aucune donnée</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========== MODAL VOIR DÉTAILS ========== */}
      {viewModal && (
        <Modal title="Détails" onClose={() => setViewModal(null)} width={700}>
          <div className="grid2">
            {columns.map(([key, label]) => (
              <div key={key} className="field">
                <div className="label">{label}</div>
                <div style={{ fontWeight: 600 }}>
                  {key === 'log_date' ? toYMD(viewModal.log[key]) :
                   key === 'montant_ar' ? toMoneyAr(viewModal.log[key]) :
                   key === 'is_refill' ? (viewModal.log[key] ? 'Oui' : 'Non') :
                   fmt(viewModal.log[key])}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ========== MODAL MODIFIER ========== */}
      {editModal && (
        <Modal title="Modifier" onClose={() => setEditModal(null)} width={700}>
          <div className="grid2">
            {tab === 'vehicle' && (
              <>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={toYMD(editModal.draft.log_date) || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, log_date: e.target.value } })}
                  />
                </div>
                <div className="field">
                  <label>Km départ</label>
                  <input
                    type="number"
                    value={editModal.draft.km_depart ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      const draft = { ...editModal.draft, km_depart: val };
                      if (draft.km_arrivee !== null && val !== null) {
                        draft.km_jour = draft.km_arrivee - val;
                      }
                      setEditModal({ ...editModal, draft });
                    }}
                  />
                </div>
                <div className="field">
                  <label>Km arrivée</label>
                  <input
                    type="number"
                    value={editModal.draft.km_arrivee ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      const draft = { ...editModal.draft, km_arrivee: val };
                      if (draft.km_depart !== null && val !== null) {
                        draft.km_jour = val - draft.km_depart;
                      }
                      setEditModal({ ...editModal, draft });
                    }}
                  />
                </div>
                <div className="field">
                  <label>Km/j (calculé auto)</label>
                  <input
                    type="number"
                    value={editModal.draft.km_jour ?? ''}
                    disabled
                    style={{ background: '#f3f4f6', cursor: 'not-allowed' }}
                  />
                </div>
                <div className="field">
                  <label>Compteur</label>
                  <input
                    type="number"
                    value={editModal.draft.compteur ?? ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, compteur: e.target.value === '' ? null : Number(e.target.value) } })}
                  />
                </div>
                <div className="field">
                  <label>Litres</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editModal.draft.liters ?? ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, liters: e.target.value === '' ? null : Number(e.target.value) } })}
                  />
                </div>
                <div className="field">
                  <label>Montant (Ar)</label>
                  <input
                    type="number"
                    value={editModal.draft.montant_ar ?? ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, montant_ar: e.target.value === '' ? null : Number(e.target.value) } })}
                  />
                </div>
                <div className="field">
                  <label>Chauffeur</label>
                  <input
                    value={editModal.draft.chauffeur || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, chauffeur: e.target.value } })}
                  />
                </div>
                <div className="field">
                  <label>Lien</label>
                  <input
                    value={editModal.draft.lien || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, lien: e.target.value } })}
                  />
                </div>
              </>
            )}

            {tab === 'generator' && (
              <>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={toYMD(editModal.draft.log_date) || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, log_date: e.target.value } })}
                  />
                </div>
                <div className="field">
                  <label>Litres</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editModal.draft.liters ?? ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, liters: e.target.value === '' ? null : Number(e.target.value) } })}
                  />
                </div>
                <div className="field">
                  <label>Montant (Ar)</label>
                  <input
                    type="number"
                    value={editModal.draft.montant_ar ?? ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, montant_ar: e.target.value === '' ? null : Number(e.target.value) } })}
                  />
                </div>
              </>
            )}

            {tab === 'other' && (
              <>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={toYMD(editModal.draft.log_date) || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, log_date: e.target.value } })}
                  />
                </div>
                <div className="field">
                  <label>Litres</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editModal.draft.liters ?? ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, liters: e.target.value === '' ? null : Number(e.target.value) } })}
                  />
                </div>
                <div className="field">
                  <label>Montant (Ar)</label>
                  <input
                    type="number"
                    value={editModal.draft.montant_ar ?? ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, montant_ar: e.target.value === '' ? null : Number(e.target.value) } })}
                  />
                </div>
                <div className="field">
                  <label>Lien</label>
                  <input
                    value={editModal.draft.lien || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, lien: e.target.value } })}
                  />
                </div>
              </>
            )}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setEditModal(null)}>Annuler</button>
            <button className="btn" onClick={saveEdit}>Enregistrer</button>
          </div>
        </Modal>
      )}
    </>
  );
}
