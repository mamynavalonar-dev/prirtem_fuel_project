import React, { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

function InlineRowEditor({ row, columns, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row);

  useEffect(() => {
    setDraft(row);
  }, [row]);

  const setField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const doSave = async () => {
    await onSave(draft);
    setEditing(false);
  };

  return (
    <tr>
      {columns.map((c) => (
        <td key={c.key}>
          {editing && c.editable ? (
            c.type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={!!draft[c.key]}
                onChange={(e) => setField(c.key, e.target.checked)}
              />
            ) : (
              <input
                className="input"
                value={draft[c.key] ?? ''}
                onChange={(e) => setField(c.key, e.target.value)}
              />
            )
          ) : (
            <span>{row[c.key] ?? ''}</span>
          )}
        </td>
      ))}

      <td style={{ whiteSpace: 'nowrap' }}>
        {!editing ? (
          <>
            <button className="btn btn-outline" onClick={() => setEditing(true)}>
              Modifier
            </button>
            <span style={{ display: 'inline-block', width: 8 }} />
            <button className="btn btn-outline" onClick={() => onDelete(row)}>
              Supprimer
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={doSave}>
              Valider
            </button>
            <span style={{ display: 'inline-block', width: 8 }} />
            <button
              className="btn btn-outline"
              onClick={() => {
                setDraft(row);
                setEditing(false);
              }}
            >
              Annuler
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function Section({ title, fetchUrl, createUrl, updateUrl, deleteUrl, columns, createInitial }) {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [create, setCreate] = useState(createInitial);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch(fetchUrl, { token });
      const key = Object.keys(data).find((k) => Array.isArray(data[k]));
      setItems(key ? data[key] : []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createField = (k, v) => setCreate((p) => ({ ...p, [k]: v }));

  const doCreate = async () => {
    setErr(null);
    try {
      await apiFetch(createUrl, { method: 'POST', token, body: create });
      setCreate(createInitial);
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
  };

  const doSave = async (row) => {
    await apiFetch(updateUrl(row.id), { method: 'PUT', token, body: row });
    await load();
  };

  const doDelete = async (row) => {
    const ok = confirm(`Envoyer dans la corbeille ?\n\n${title}: ${row.id}`);
    if (!ok) return;
    await apiFetch(deleteUrl(row.id), { method: 'DELETE', token });
    await load();
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button className="btn btn-outline" onClick={load}>
          Recharger
        </button>
      </div>

      {err && <div className="muted" style={{ color: '#b91c1c' }}>{err}</div>}

      <div className="card" style={{ marginTop: 12, background: '#fafafa' }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {columns
            .filter((c) => c.creatable)
            .map((c) => (
              <div key={c.key} className="field" style={{ minWidth: 200 }}>
                <div className="label">{c.label}</div>
                {c.type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={!!create[c.key]}
                    onChange={(e) => createField(c.key, e.target.checked)}
                  />
                ) : (
                  <input
                    className="input"
                    value={create[c.key] ?? ''}
                    onChange={(e) => createField(c.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          <button className="btn" onClick={doCreate}>
            Ajouter
          </button>
        </div>
      </div>

      <div style={{ overflow: 'auto', marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="muted">
                  Chargement...
                </td>
              </tr>
            ) : items.length ? (
              items.map((row) => (
                <InlineRowEditor
                  key={row.id}
                  row={row}
                  columns={columns}
                  onSave={doSave}
                  onDelete={doDelete}
                />
              ))
            ) : (
              <tr>
                <td colSpan={columns.length + 1} className="muted">
                  Aucune donnée
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Meta() {
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Véhicules & Chauffeurs</h1>

      <Section
        title="Véhicules"
        fetchUrl="/api/meta/vehicles"
        createUrl="/api/meta/vehicles"
        updateUrl={(id) => `/api/meta/vehicles/${id}`}
        deleteUrl={(id) => `/api/meta/vehicles/${id}`}
        createInitial={{ plate: '', label: '' }}
        columns={[
          { key: 'plate', label: 'Immatriculation', editable: true, creatable: true },
          { key: '', label: 'Marque et Type', editable: true, creatable: true },
          { key: '', label: 'Source énergie', editable: true, creatable: true },
          { key: '', label: 'Nombre de place', editable: true, creatable: true },
          { key: 'label', label: 'Libellé', editable: true, creatable: true },
          { key: 'is_active', label: 'Actif', editable: false, creatable: false }
        ]}
      />

      <Section
        title="Chauffeurs"
        fetchUrl="/api/meta/drivers"
        createUrl="/api/meta/drivers"
        updateUrl={(id) => `/api/meta/drivers/${id}`}
        deleteUrl={(id) => `/api/meta/drivers/${id}`}
        createInitial={{ full_name: '', phone: '', is_active: true }}
        columns={[
          { key: 'full_name', label: 'Nom complet', editable: true, creatable: true },
          { key: 'phone', label: 'Téléphone', editable: true, creatable: true },
          { key: '', label: 'Voiture assigner', editable: true, creatable: true },
          { key: 'is_active', label: 'Actif', editable: true, creatable: true, type: 'checkbox' }
        ]}
      />

      <div className="muted">
        Suppression = envoi dans la corbeille. Pour supprimer définitivement: menu Corbeille.
      </div>
    </div>
  );
}
