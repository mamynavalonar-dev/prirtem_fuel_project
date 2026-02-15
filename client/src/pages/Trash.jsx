import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

const ENTITIES = [
  { key: 'vehicles', label: 'Véhicules' },
  { key: 'drivers', label: 'Chauffeurs' },
  { key: 'fuel_requests', label: 'Demandes carburant' },
  { key: 'car_requests', label: 'Demandes voiture' },
  { key: 'car_logbooks', label: 'Journaux de bord' },
  { key: 'vehicle_fuel_logs', label: 'Suivi carburant (Véhicules)' },
  { key: 'generator_fuel_logs', label: 'Suivi carburant (Groupe électrogène)' },
  { key: 'other_fuel_logs', label: 'Suivi carburant (Autres)' }
];

function fmt(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function fmtDate(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

export default function Trash() {
  const { token } = useAuth();
  const [entity, setEntity] = useState('vehicles');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [confirm, setConfirm] = useState(null);
  const [confirmWord, setConfirmWord] = useState('');

  const columns = useMemo(() => {
    if (entity === 'vehicles') return ['plate', 'label', 'deleted_at'];
    if (entity === 'drivers') return ['full_name', 'phone', 'deleted_at'];
    if (entity === 'fuel_requests') return ['request_no', 'request_date', 'request_type', 'amount_estimated_ar', 'status', 'deleted_at'];
    if (entity === 'car_requests') return ['request_no', 'proposed_date', 'objet', 'status', 'deleted_at'];
    if (entity === 'car_logbooks') return ['plate', 'period_start', 'period_end', 'logbook_type', 'objet', 'status', 'deleted_at'];
    if (entity === 'vehicle_fuel_logs') return ['log_date', 'km_depart', 'km_arrivee', 'montant_ar', 'deleted_at'];
    if (entity === 'generator_fuel_logs') return ['log_date', 'liters', 'montant_ar', 'deleted_at'];
    if (entity === 'other_fuel_logs') return ['log_date', 'liters', 'montant_ar', 'lien', 'deleted_at'];
    return ['id', 'deleted_at'];
  }, [entity]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const d = await apiFetch(`/api/trash/${entity}`, { token });
      setItems(d.items || []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const openRestore = (item) => {
    setConfirm({ type: 'restore', item });
    setConfirmWord('');
  };

  const openHard = (item) => {
    setConfirm({ type: 'hard', item });
    setConfirmWord('');
  };

  const runConfirm = async () => {
    if (!confirm) return;
    const { type, item } = confirm;

    try {
      if (type === 'restore') {
        await apiFetch(`/api/trash/${entity}/${item.id}/restore`, { method: 'POST', token });
        alert('✅ Restauré avec succès');
        setConfirm(null);
        await load();
        return;
      }

      if (type === 'hard') {
        if (confirmWord !== 'SUPPRIMER') {
          alert('⚠️ Tapez exactement "SUPPRIMER" pour confirmer');
          return;
        }
        await apiFetch(`/api/trash/${entity}/${item.id}/hard`, { method: 'DELETE', token });
        alert('✅ Supprimé définitivement');
        setConfirm(null);
        await load();
      }
    } catch (e) {
      alert(`❌ Erreur: ${e.message}`);
    }
  };

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>🗑️ Corbeille</h1>

      <div className="row" style={{ alignItems: 'flex-end', marginBottom: 12 }}>
        <div className="field" style={{ minWidth: 320 }}>
          <div className="label">Type</div>
          <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
            {ENTITIES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {err && <div className="muted" style={{ color: '#b91c1c', marginBottom: 10 }}>{err}</div>}

      <div style={{ overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => <th key={c}>{c}</th>)}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 1} className="muted">Chargement...</td></tr>
            ) : items.length ? (
              items.map((it) => (
                <tr key={it.id}>
                  {columns.map((c) => (
                    <td key={c}>
                      {c.endsWith('_date') || c.endsWith('_at') || c.includes('period_') || c === 'log_date'
                        ? fmtDate(it[c])
                        : fmt(it[c])
                      }
                    </td>
                  ))}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" onClick={() => openRestore(it)}>Restaurer</button>
                    <span style={{ display: 'inline-block', width: 8 }} />
                    <button className="btn btn-danger btn-sm" onClick={() => openHard(it)}>Supprimer</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={columns.length + 1} className="muted">Corbeille vide.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {confirm && (
        <Modal
          title={confirm.type === 'restore' ? 'Restaurer' : 'Supprimer définitivement'}
          onClose={() => setConfirm(null)}
          width={620}
        >
          <div className="muted" style={{ marginBottom: 10 }}>
            Élément : <b>{confirm.item.id}</b>
          </div>

          {confirm.type === 'hard' && (
            <>
              <div className="muted" style={{ marginBottom: 10 }}>
                ⚠️ Tape <b>SUPPRIMER</b> pour confirmer la suppression définitive.
              </div>
              <input
                className="input"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder="SUPPRIMER"
              />
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button className="btn btn-outline" onClick={() => setConfirm(null)}>Annuler</button>
            <button className={confirm.type === 'hard' ? 'btn btn-danger' : 'btn'} onClick={runConfirm}>
              Confirmer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
