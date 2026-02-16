import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';
import Modal from '../components/Modal.jsx';

function fmt(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('fr-FR');
}

function whoDeleted(it) {
  const name = (it.deleted_by_name || '').trim();
  const username = it.deleted_by_username ? `@${it.deleted_by_username}` : '';
  const role = it.deleted_by_role ? String(it.deleted_by_role) : '';
  const bits = [name || username, username && name ? username : '', role].filter(Boolean);
  return bits.join(' • ');
}

const ENTITIES = [
  { key: 'vehicles', label: 'Véhicules', cols: ['plate', 'label', 'deleted_by_user', 'deleted_at'] },
  { key: 'drivers', label: 'Chauffeurs', cols: ['full_name', 'phone', 'deleted_by_user', 'deleted_at'] },
  { key: 'fuel_requests', label: 'Demandes carburant', cols: ['request_no', 'request_type', 'status', 'deleted_by_user', 'deleted_at'] },
  { key: 'car_requests', label: 'Demandes voiture', cols: ['request_no', 'proposed_date', 'status', 'deleted_by_user', 'deleted_at'] },
  { key: 'car_logbooks', label: 'Journaux de bord', cols: ['plate', 'period_start', 'period_end', 'logbook_type', 'status', 'deleted_by_user', 'deleted_at'] },
  { key: 'vehicle_fuel_logs', label: 'Suivi carburant (Véhicules)', cols: ['plate', 'log_date', 'montant_ar', 'deleted_by_user', 'deleted_at'] },
  { key: 'generator_fuel_logs', label: 'Suivi carburant (Groupe électrogène)', cols: ['log_date', 'montant_ar', 'deleted_by_user', 'deleted_at'] },
  { key: 'other_fuel_logs', label: 'Suivi carburant (Autres)', cols: ['log_date', 'montant_ar', 'lien', 'deleted_by_user', 'deleted_at'] }
];

const COL_LABELS = {
  plate: 'Plaque',
  label: 'Libellé',
  full_name: 'Nom',
  phone: 'Téléphone',

  request_no: 'N°',
  request_type: 'Type',
  status: 'Statut',
  proposed_date: 'Date',
  log_date: 'Date',

  period_start: 'Début',
  period_end: 'Fin',
  logbook_type: 'Type JDB',

  montant_ar: 'Montant (Ar)',
  lien: 'Lien',

  deleted_by_user: 'Supprimé par',
  deleted_at: 'Supprimé le'
};

export default function Trash() {
  const { token } = useAuth();

  const [entity, setEntity] = useState('vehicles');

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [selected, setSelected] = useState(() => new Set());

  // confirm modal
  const [confirm, setConfirm] = useState(null); // { type, item? }
  const [confirmWord, setConfirmWord] = useState('');

  const config = useMemo(() => ENTITIES.find((e) => e.key === entity) || ENTITIES[0], [entity]);
  const columns = config.cols;

  useEffect(() => {
    setOffset(0);
    setSelected(new Set());
  }, [entity]);

  useEffect(() => {
    setOffset(0);
  }, [q, limit]);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        q
      }).toString();

      const data = await apiFetch(`/api/trash/${entity}?${qs}`, { token });

      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number.isFinite(Number(data.total)) ? Number(data.total) : (Array.isArray(data.items) ? data.items.length : 0));
    } catch (e) {
      setErr(e.message || 'Erreur');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, limit, offset, q]);

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  const allOnPageSelected = useMemo(() => {
    if (!items.length) return false;
    return items.every((it) => selected.has(it.id));
  }, [items, selected]);

  function toggleAllOnPage() {
    const next = new Set(selected);
    if (allOnPageSelected) {
      items.forEach((it) => next.delete(it.id));
    } else {
      items.forEach((it) => next.add(it.id));
    }
    setSelected(next);
  }

  function toggleOne(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function ask(type, item) {
    setConfirm({ type, item });
    setConfirmWord('');
  }

  async function doRestoreOne(it) {
    await apiFetch(`/api/trash/${entity}/${it.id}/restore`, { method: 'POST', token });
    await load();
  }

  async function doHardOne(it) {
    await apiFetch(`/api/trash/${entity}/${it.id}/hard`, { method: 'DELETE', token });
    await load();
  }

  async function restoreSelection() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    await apiFetch(`/api/trash/${entity}/restore-many`, { method: 'POST', token, body: { ids } });
    setSelected(new Set());
    await load();
  }

  async function hardDeleteSelection() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    await apiFetch(`/api/trash/${entity}/hard-many`, { method: 'POST', token, body: { ids } });
    setSelected(new Set());
    await load();
  }

  async function restoreAll() {
    await apiFetch(`/api/trash/${entity}/restore-all`, { method: 'POST', token });
    setSelected(new Set());
    await load();
  }

  async function purgeAll() {
    await apiFetch(`/api/trash/${entity}/purge-all`, { method: 'DELETE', token });
    setSelected(new Set());
    await load();
  }

  const selectionCount = selected.size;

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>🗑️ Corbeille</h1>

      <div className="row" style={{ alignItems: 'flex-end', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div className="field" style={{ minWidth: 320 }}>
          <div className="label">Type</div>
          <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
            {ENTITIES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="field" style={{ minWidth: 320 }}>
          <div className="label">Recherche</div>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Plaque, n°, objet, lien, user..."
          />
        </div>

        <div className="field" style={{ width: 170 }}>
          <div className="label">Taille page</div>
          <select className="input" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button className="btn btn-sm" disabled={!selectionCount} onClick={() => ask('restore_selection')}>
            Restaurer sélection ({selectionCount})
          </button>
          <button className="btn btn-danger btn-sm" disabled={!selectionCount} onClick={() => ask('hard_selection')}>
            Supprimer sélection
          </button>
          <button className="btn btn-sm" onClick={() => ask('restore_all')}>
            Restaurer tout
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => ask('purge_all')}>
            Vider la corbeille
          </button>
        </div>
      </div>

      {err && <div className="muted" style={{ color: '#b91c1c', marginBottom: 10 }}>{err}</div>}

      <div className="muted" style={{ marginBottom: 8 }}>
        {total ? (
          <>Total: <b>{total}</b> • Page <b>{page}</b> / <b>{pages}</b></>
        ) : (
          <>Corbeille vide. • Page {page} / {pages}</>
        )}
      </div>

      <div style={{ overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
              </th>
              {columns.map((c) => <th key={c}>{COL_LABELS[c] || c}</th>)}
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + 2} className="muted">Chargement...</td></tr>
            ) : items.length ? (
              items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleOne(it.id)} />
                  </td>

                  {columns.map((c) => (
                    <td key={c}>
                      {c === 'deleted_by_user'
                        ? fmt(whoDeleted(it))
                        : (c.endsWith('_date') || c.endsWith('_at') || c.includes('period_') || c === 'log_date' || c === 'proposed_date')
                          ? fmtDate(it[c])
                          : fmt(it[c])
                      }
                    </td>
                  ))}

                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm" onClick={() => ask('restore_one', it)}>Restaurer</button>
                    <span style={{ display: 'inline-block', width: 8 }} />
                    <button className="btn btn-danger btn-sm" onClick={() => ask('hard_one', it)}>Supprimer</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={columns.length + 2} className="muted">Corbeille vide.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => setOffset(Math.max(0, offset - limit))}>← Précédent</button>
        <button className="btn btn-sm" disabled={page >= pages} onClick={() => setOffset(offset + limit)}>Suivant →</button>
      </div>

      {confirm && (
        <Modal
          title="Confirmation"
          onClose={() => setConfirm(null)}
          width={640}
        >
          {(() => {
            const { type, item } = confirm;
            const destructive = (type === 'hard_one' || type === 'hard_selection' || type === 'purge_all');

            const needWord = destructive;

            const onRun = async () => {
              try {
                if (needWord && confirmWord !== 'SUPPRIMER') {
                  alert('⚠️ Tapez exactement "SUPPRIMER" pour confirmer');
                  return;
                }

                if (type === 'restore_one' && item) await doRestoreOne(item);
                else if (type === 'hard_one' && item) await doHardOne(item);
                else if (type === 'restore_selection') await restoreSelection();
                else if (type === 'hard_selection') await hardDeleteSelection();
                else if (type === 'restore_all') await restoreAll();
                else if (type === 'purge_all') await purgeAll();

                setConfirm(null);
              } catch (e) {
                alert(`❌ Erreur: ${e.message}`);
              }
            };

            return (
              <div>
                {type === 'restore_selection' && (
                  <div className="muted">Restaurer <b>{selectionCount}</b> élément(s) sélectionné(s) ?</div>
                )}

                {type === 'hard_selection' && (
                  <div className="muted">Supprimer définitivement <b>{selectionCount}</b> élément(s) sélectionné(s) ?</div>
                )}

                {type === 'restore_all' && (
                  <div className="muted">Restaurer tous les éléments de ce type ?</div>
                )}

                {type === 'purge_all' && (
                  <div className="muted">Vider la corbeille (suppression définitive de ce type) ?</div>
                )}

                {(type === 'restore_one' || type === 'hard_one') && item && (
                  <div className="muted" style={{ marginBottom: 10 }}>
                    Élément : <b>{item.id}</b>
                  </div>
                )}

                {needWord && (
                  <>
                    <div className="muted" style={{ marginTop: 12, marginBottom: 10 }}>
                      ⚠️ Tape <b>SUPPRIMER</b> pour confirmer.
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
                  <button className={destructive ? 'btn btn-danger' : 'btn'} onClick={onRun}>Confirmer</button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
