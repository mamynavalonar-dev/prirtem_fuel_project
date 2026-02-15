import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

function fmtAr(n) {
  try {
    return new Intl.NumberFormat('fr-FR').format(Number(n || 0)) + ' Ar';
  } catch {
    return String(n || 0) + ' Ar';
  }
}

const TYPES = [
  { value: 'SERVICE', label: 'SERVICE' },
  { value: 'MISSION', label: 'MISSION' }
];

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

export default function FuelRequests() {
  const { token, user } = useAuth();
  const role = user?.role;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [form, setForm] = useState(() => {
    const t = todayYMD();
    return {
      request_type: 'SERVICE',
      objet: '',
      amount_estimated_ar: 0,
      amount_estimated_words: '',
      request_date: t,
      end_date: t
    };
  });
  const [creating, setCreating] = useState(false);

  const [view, setView] = useState(null); // {loading, data}
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);

  const canCreate = role === 'DEMANDEUR';
  const canVerify = ['LOGISTIQUE', 'ADMIN'].includes(role);
  const canApprove = ['RAF', 'ADMIN'].includes(role);
  const canSoftDelete = ['LOGISTIQUE', 'ADMIN'].includes(role);

  const columns = useMemo(() => ['N°', 'Période', 'Type', 'Objet', 'Montant', 'Statut', 'Actions'], []);

  const load = useCallback(async () => {
    if (!token) return; // évite le 401 pendant que l'auth se charge
    setLoading(true);
    setErr(null);
    try {
      const d = await apiFetch('/api/requests/fuel', { token });
      setRequests(d.requests || []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!token) return;
    setCreating(true);
    setErr(null);
    try {
      const body = {
        ...form,
        amount_estimated_ar: Number(form.amount_estimated_ar || 0),
        request_date: form.request_date || todayYMD(),
        end_date: form.end_date || form.request_date || todayYMD()
      };
      await apiFetch('/api/requests/fuel', { method: 'POST', token, body });

      const t = todayYMD();
      setForm({
        request_type: 'SERVICE',
        objet: '',
        amount_estimated_ar: 0,
        amount_estimated_words: '',
        request_date: t,
        end_date: t
      });

      await load();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setCreating(false);
    }
  };

  const openView = async (id) => {
    if (!token) return;
    setView({ loading: true, data: null });
    try {
      const d = await apiFetch(`/api/requests/fuel/${id}`, { token });
      setView({ loading: false, data: d.request });
    } catch (e) {
      setView({ loading: false, data: null });
      alert(String(e.message || e));
    }
  };

  const openEdit = (r) => {
    setEditId(r.id);
    setDraft({
      request_date: String(r.request_date || '').slice(0, 10) || todayYMD(),
      end_date: String(r.end_date || r.request_date || '').slice(0, 10) || todayYMD(),
      request_type: r.request_type || 'SERVICE',
      objet: r.objet || '',
      amount_estimated_ar: Number(r.amount_estimated_ar || 0),
      amount_estimated_words: r.amount_estimated_words || ''
    });
  };

  const cancelEdit = () => {
    setEditId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!token) return;
    if (!editId || !draft) return;
    try {
      const body = {
        request_date: draft.request_date,
        end_date: draft.end_date || draft.request_date,
        request_type: draft.request_type,
        objet: draft.objet,
        amount_estimated_ar: Number(draft.amount_estimated_ar || 0),
        amount_estimated_words: draft.amount_estimated_words
      };
      await apiFetch(`/api/requests/fuel/${editId}`, { method: 'PUT', token, body });
      cancelEdit();
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const softDelete = async (id) => {
    if (!token) return;
    const ok = confirm('Déplacer dans Corbeille ?');
    if (!ok) return;
    try {
      await apiFetch(`/api/requests/fuel/${id}`, { method: 'DELETE', token });
      await load();
      alert('OK ✅ Déplacé dans Corbeille');
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const submit = async (id) => {
    if (!token) return;
    await apiFetch(`/api/requests/fuel/${id}/submit`, { method: 'PATCH', token });
    await load();
  };
  const verify = async (id) => {
    if (!token) return;
    await apiFetch(`/api/requests/fuel/${id}/verify`, { method: 'PATCH', token });
    await load();
  };
  const approve = async (id) => {
    if (!token) return;
    await apiFetch(`/api/requests/fuel/${id}/approve`, { method: 'PATCH', token });
    await load();
  };
  const reject = async (id) => {
    if (!token) return;
    const reason = prompt('Motif de rejet (optionnel) :') || '';
    await apiFetch(`/api/requests/fuel/${id}/reject`, { method: 'PATCH', token, body: { reason } });
    await load();
  };
  const cancelRequest = async (id) => {
    if (!token) return;
    const reason = prompt("Motif d'annulation (optionnel) :") || '';
    const ok = confirm('Annuler cette demande ?');
    if (!ok) return;
    try {
      await apiFetch(`/api/requests/fuel/${id}/cancel`, { method: 'POST', token, body: { reason } });
      await load();
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const fmtPeriod = (r) => {
    const a = String(r.request_date || '').slice(0, 10);
    const b = String(r.end_date || r.request_date || '').slice(0, 10);
    return b && a && b !== a ? `${a} → ${b}` : a;
  };

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Demande de carburant</h1>

      {canCreate && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row">
            <div className="field" style={{ minWidth: 160 }}>
              <div className="label">Date début</div>
              <input
                className="input"
                type="date"
                value={form.request_date}
                onChange={(e) =>
                  setForm({
                    ...form,
                    request_date: e.target.value,
                    end_date: form.end_date || e.target.value
                  })
                }
              />
            </div>

            <div className="field" style={{ minWidth: 160 }}>
              <div className="label">Date fin</div>
              <input
                className="input"
                type="date"
                value={form.end_date}
                min={form.request_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>

            <div className="field" style={{ minWidth: 160 }}>
              <div className="label">Type</div>
              <select
                className="input"
                value={form.request_type}
                onChange={(e) => setForm({ ...form, request_type: e.target.value })}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ flex: 1 }}>
              <div className="label">Objet</div>
              <input
                className="input"
                value={form.objet}
                onChange={(e) => setForm({ ...form, objet: e.target.value })}
                placeholder="Objet..."
              />
            </div>
          </div>

          <div className="row">
            <div className="field" style={{ minWidth: 200 }}>
              <div className="label">Montant prévisionnel (Ar)</div>
              <input
                className="input"
                type="number"
                value={form.amount_estimated_ar}
                onChange={(e) => setForm({ ...form, amount_estimated_ar: e.target.value })}
              />
            </div>

            <div className="field" style={{ flex: 1 }}>
              <div className="label">Montant (en lettre)</div>
              <input
                className="input"
                value={form.amount_estimated_words}
                onChange={(e) => setForm({ ...form, amount_estimated_words: e.target.value })}
                placeholder="..."
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn" onClick={create} disabled={creating}>
              Créer (DRAFT)
            </button>
          </div>

          {err && <div className="muted" style={{ color: '#b91c1c', marginTop: 8 }}>{err}</div>}
        </div>
      )}

      {!canCreate && err && <div className="muted" style={{ color: '#b91c1c' }}>{err}</div>}

      <div style={{ overflow: 'auto' }}>
        <table className="table">
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
            ) : requests.length ? (
              requests.map((r) => {
                const isEditing = editId === r.id;

                const canEditRow =
                  (role === 'DEMANDEUR' && r.status && ['DRAFT', 'REJECTED'].includes(r.status)) ||
                  (['ADMIN', 'LOGISTIQUE'].includes(role) &&
                    r.status &&
                    ['DRAFT', 'REJECTED', 'SUBMITTED', 'VERIFIED'].includes(r.status));

                return (
                  <tr key={r.id}>
                    <td>
                      <b>{r.request_no}</b>
                    </td>

                    <td>
                      {isEditing ? (
                        <div className="row" style={{ gap: 8 }}>
                          <input
                            className="input"
                            type="date"
                            value={draft?.request_date || ''}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                request_date: e.target.value,
                                end_date: draft?.end_date || e.target.value
                              })
                            }
                          />
                          <input
                            className="input"
                            type="date"
                            min={draft?.request_date || ''}
                            value={draft?.end_date || ''}
                            onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                          />
                        </div>
                      ) : (
                        fmtPeriod(r)
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <select
                          className="input"
                          value={draft?.request_type || 'SERVICE'}
                          onChange={(e) => setDraft({ ...draft, request_type: e.target.value })}
                        >
                          {TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        r.request_type || ''
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          value={draft?.objet || ''}
                          onChange={(e) => setDraft({ ...draft, objet: e.target.value })}
                        />
                      ) : (
                        r.objet || ''
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          type="number"
                          value={draft?.amount_estimated_ar ?? 0}
                          onChange={(e) => setDraft({ ...draft, amount_estimated_ar: e.target.value })}
                        />
                      ) : (
                        fmtAr(r.amount_estimated_ar)
                      )}
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          r.status === 'APPROVED' ? 'badge-ok' : r.status === 'REJECTED' ? 'badge-bad' : ''
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>

                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openView(r.id)}>
                        Voir
                      </button>
                      <span style={{ display: 'inline-block', width: 6 }} />

                      {isEditing ? (
                        <>
                          <button className="btn btn-sm" onClick={saveEdit}>
                            Valider
                          </button>
                          <span style={{ display: 'inline-block', width: 6 }} />
                          <button className="btn btn-outline btn-sm" onClick={cancelEdit}>
                            Annuler
                          </button>
                          <span style={{ display: 'inline-block', width: 6 }} />
                        </>
                      ) : (
                        canEditRow && (
                          <>
                            <button className="btn btn-outline btn-sm" onClick={() => openEdit(r)}>
                              Modifier
                            </button>
                            <span style={{ display: 'inline-block', width: 6 }} />
                          </>
                        )
                      )}

                      {canSoftDelete && (
                        <>
                          <button className="btn btn-danger btn-sm" onClick={() => softDelete(r.id)}>
                            Corbeille
                          </button>
                          <span style={{ display: 'inline-block', width: 6 }} />
                        </>
                      )}

                      {role === 'DEMANDEUR' && ['DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED'].includes(r.status) && (
                        <>
                          <button className="btn btn-outline btn-sm" onClick={() => cancelRequest(r.id)}>
                            Annuler
                          </button>
                          <span style={{ display: 'inline-block', width: 8 }} />
                        </>
                      )}

                      <a
                        className="btn btn-outline btn-sm"
                        href={`/print/fuel/${r.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Imprimer
                      </a>

                      {/* Workflow actions */}
                      <span style={{ display: 'inline-block', width: 10 }} />
                      {role === 'DEMANDEUR' && ['DRAFT', 'REJECTED'].includes(r.status) && (
                        <button className="btn btn-sm" onClick={() => submit(r.id)}>
                          Envoyer
                        </button>
                      )}
                      {canVerify && r.status === 'SUBMITTED' && (
                        <button className="btn btn-sm" onClick={() => verify(r.id)}>
                          Vérifier (Logistique)
                        </button>
                      )}
                      {canApprove && r.status === 'VERIFIED' && (
                        <>
                          <button className="btn btn-sm" onClick={() => approve(r.id)}>
                            Visa RAF
                          </button>
                          <span style={{ display: 'inline-block', width: 6 }} />
                          <button className="btn btn-outline btn-sm" onClick={() => reject(r.id)}>
                            Rejeter
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={columns.length} className="muted">
                  Aucune demande.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {view && (
        <Modal title="Détail demande carburant" onClose={() => setView(null)} width={760}>
          {view.loading ? (
            <div className="muted">Chargement...</div>
          ) : view.data ? (
            <div>
              <div className="row" style={{ gap: 14 }}>
                <div className="card" style={{ flex: 1 }}>
                  <div className="muted">N°</div>
                  <div style={{ fontWeight: 800 }}>{view.data.request_no}</div>
                </div>
                <div className="card" style={{ flex: 1 }}>
                  <div className="muted">Statut</div>
                  <div style={{ fontWeight: 800 }}>{view.data.status}</div>
                </div>
              </div>

              <div className="card" style={{ marginTop: 10 }}>
                <div className="row">
                  <div style={{ flex: 1 }}>
                    <div className="muted">Période</div>
                    <div>
                      {String(view.data.end_date || view.data.request_date || '').slice(0, 10) !==
                      String(view.data.request_date || '').slice(0, 10)
                        ? `${String(view.data.request_date || '').slice(0, 10)} → ${String(
                            view.data.end_date || ''
                          ).slice(0, 10)}`
                        : String(view.data.request_date || '').slice(0, 10)}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="muted">Type</div>
                    <div>{view.data.request_type}</div>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div className="muted">Objet</div>
                  <div>{view.data.objet}</div>
                </div>

                <div className="row" style={{ marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="muted">Montant (chiffre)</div>
                    <div>{fmtAr(view.data.amount_estimated_ar)}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="muted">Montant (lettre)</div>
                    <div>{view.data.amount_estimated_words || ''}</div>
                  </div>
                </div>

                {view.data.reject_reason && (
                  <div style={{ marginTop: 8 }}>
                    <div className="muted">Motif rejet</div>
                    <div style={{ color: '#b91c1c' }}>{view.data.reject_reason}</div>
                  </div>
                )}
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
