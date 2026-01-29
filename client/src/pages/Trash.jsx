import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

const ENTITIES = [
  { key: 'vehicles', label: 'Véhicules' },
  { key: 'drivers', label: 'Chauffeurs' },
  { key: 'fuel_requests', label: 'Demandes carburant' },
  { key: 'car_requests', label: 'Demandes voiture' },
  { key: 'vehicle_fuel_logs', label: 'Suivi carburant (Véhicules)' },
  { key: 'generator_fuel_logs', label: 'Suivi carburant (Groupe électrogène)' },
  { key: 'other_fuel_logs', label: 'Suivi carburant (Autres)' }
];

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
        <div className="field" style={{ minWidth: 300 }}>
          <div className="label">Type</div>
          <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
            {ENTITIES.map((e) => (
              <option key={e.key} value={e.key}>{e.label}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-outline" onClick={load}>Recharger</button>
      </div>

      {err && <div className="muted" style={{ color: '#b91c1c', marginBottom: 12 }}>{err}</div>}

      <div style={{ overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              {columns.map((c) => (<th key={c}>{c}</th>))}
              <th style={{ width: 260 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 2} className="muted">Chargement...</td></tr>
            ) : items.length ? (
              items.map((it) => (
                <tr key={it.id}>
                  <td className="muted" style={{ fontSize: 11 }}>{String(it.id).slice(0, 8)}...</td>
                  {columns.map((c) => (
                    <td key={c}>
                      {c === 'amount_estimated_ar' || c === 'montant_ar' ? Number(it[c] || 0).toLocaleString('fr-FR') + ' Ar' :
                       c === 'deleted_at' ? new Date(it[c]).toLocaleString('fr-FR') :
                       String(it[c] ?? '')}
                    </td>
                  ))}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline btn-sm" onClick={() => openRestore(it)}>Restaurer</button>
                    <span style={{ display: 'inline-block', width: 8 }} />
                    <button className="btn btn-danger btn-sm" onClick={() => openHard(it)}>Supprimer définitif</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={columns.length + 2} className="muted">Corbeille vide ✅</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="muted" style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
        <strong>💡 Comment ça marche ?</strong>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li><strong>Restaurer</strong> : Remet l'élément dans l'app (accessible normalement)</li>
          <li><strong>Supprimer définitif</strong> : Efface DÉFINITIVEMENT de la base de données (irréversible)</li>
        </ul>
      </div>

      {confirm && (
        <Modal
          title={confirm.type === 'restore' ? 'Restaurer cet élément ?' : 'Suppression définitive'}
          onClose={() => setConfirm(null)}
          width={560}
        >
          {confirm.type === 'restore' ? (
            <div>
              <div style={{ marginBottom: 12 }}>
                Voulez-vous restaurer cet élément ?<br />
                <span className="muted">Il redeviendra accessible normalement.</span>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setConfirm(null)}>Annuler</button>
                <button className="btn" onClick={runConfirm}>✅ Restaurer</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 10, padding: 12, background: '#fef2f2', borderRadius: 8, border: '1px solid #fca5a5' }}>
                <strong style={{ color: '#b91c1c' }}>⚠️ ATTENTION : Cette action est IRRÉVERSIBLE</strong><br />
                <span className="muted">L'élément sera supprimé définitivement de la base de données.</span>
              </div>
              <div style={{ marginBottom: 10 }}>
                Tapez exactement <strong style={{ color: '#b91c1c' }}>SUPPRIMER</strong> pour confirmer :
              </div>
              <input
                className="input"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder="SUPPRIMER"
                style={{ fontWeight: 700, textTransform: 'uppercase' }}
              />
              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                <button className="btn btn-outline" onClick={() => setConfirm(null)}>Annuler</button>
                <button 
                  className="btn btn-danger" 
                  disabled={confirmWord !== 'SUPPRIMER'} 
                  onClick={runConfirm}
                >
                  🗑️ Supprimer définitif
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}