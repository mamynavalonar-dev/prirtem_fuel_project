import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';
import UserDrawer from '../components/users/UserDrawer.jsx';
import './Users.css';

const ROLES = [
  { value: 'DEMANDEUR', label: 'Demandeur' },
  { value: 'LOGISTIQUE', label: 'Logistique' },
  { value: 'RAF', label: 'RAF' },
  { value: 'ADMIN', label: 'Admin' }
];

const EXTRA_PERMS = [
  { value: 'IMPORT_EXCEL', label: 'Importer des données (Excel)' },
  { value: 'FLEET_MANAGE', label: 'Gérer la flotte' }
];

function ymdhms(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/(^\.)|(\.$)/g, '')
    .slice(0, 32);
}

function displayStatus(u) {
  if (u.is_blocked) return { text: 'Bloqué', cls: 'badge-warn' };
  if (!u.is_active) return { text: 'Inactif', cls: 'badge-bad' };
  return { text: 'Actif', cls: 'badge-ok' };
}

export default function Users() {
  const { token } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const [selected, setSelected] = useState(() => new Set());

  const [drawerUser, setDrawerUser] = useState(null);

  const [menuOpenId, setMenuOpenId] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [usernameTouched, setUsernameTouched] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    role: 'DEMANDEUR',
    password: '',
    is_active: true,
    is_blocked: false,
    permissions: []
  });

  const [confirmDelete, setConfirmDelete] = useState({ open: false, user: null, text: '' });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/users', { token });
      setUsers(data.users || []);
      setSelected(new Set());
    } catch (e) {
      setError(e.message || 'Erreur lors du chargement des utilisateurs.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    if (editingUser) return;
    if (usernameTouched) return;
    const base = `${formData.first_name}.${formData.last_name}`;
    const next = slugify(base);
    if (next && next !== formData.username) {
      setFormData((p) => ({ ...p, username: next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.first_name, formData.last_name]);

  const sortedUsers = useMemo(() => {
    const arr = [...users];

    const getName = (u) => `${u.last_name || ''} ${u.first_name || ''}`.trim().toLowerCase();
    const getEmail = (u) => String(u.email || '').toLowerCase();
    const getRole = (u) => String(u.role || '');
    const getStatus = (u) => (u.is_blocked ? 2 : (u.is_active ? 1 : 0));
    const getLastLogin = (u) => (u.last_login_at ? new Date(u.last_login_at).getTime() : 0);
    const getCreated = (u) => (u.created_at ? new Date(u.created_at).getTime() : 0);

    const keyFn = {
      name: getName,
      email: getEmail,
      role: getRole,
      status: getStatus,
      last_login: getLastLogin,
      created: getCreated
    }[sortKey] || getName;

    arr.sort((a, b) => {
      const av = keyFn(a);
      const bv = keyFn(b);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return arr;
  }, [users, sortKey, sortDir]);

  function toggleSort(k) {
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('asc');
    }
  }

  function isSelected(id) {
    return selected.has(id);
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const allIds = sortedUsers.map((u) => u.id);
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }

  const selectedCount = selected.size;

  async function bulkPatch(patch) {
    if (selectedCount === 0) return;
    try {
      await apiFetch('/api/users/bulk', {
        method: 'PUT',
        token,
        body: { ids: Array.from(selected), patch }
      });
      await loadUsers();
    } catch (e) {
      alert(e.message || 'Erreur bulk');
    }
  }

  const openCreate = () => {
    setEditingUser(null);
    setUsernameTouched(false);
    setFormData({
      first_name: '',
      last_name: '',
      username: '',
      email: '',
      role: 'DEMANDEUR',
      password: '',
      is_active: true,
      is_blocked: false,
      permissions: []
    });
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setUsernameTouched(true);
    setFormData({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      username: user.username || '',
      email: user.email || '',
      role: user.role || 'DEMANDEUR',
      password: '',
      is_active: !!user.is_active,
      is_blocked: !!user.is_blocked,
      permissions: user.permissions || []
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      alert('Prénom/Nom obligatoires');
      return;
    }
    if (!formData.username.trim() || formData.username.trim().length < 3) {
      alert('Username min 3 caractères');
      return;
    }
    if (!String(formData.email || '').includes('@')) {
      alert('Email invalide');
      return;
    }

    try {
      if (editingUser) {
        const body = { ...formData };
        if (!body.password) delete body.password;

        await apiFetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          token,
          body
        });
      } else {
        if (!formData.password) {
          alert('Le mot de passe est obligatoire pour la création.');
          return;
        }
        await apiFetch('/api/users', {
          method: 'POST',
          token,
          body: formData
        });
      }
      setShowModal(false);
      await loadUsers();
    } catch (err) {
      alert(err.message || 'Erreur');
    }
  };

  async function toggleActive(u) {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        token,
        body: { is_active: !u.is_active }
      });
      await loadUsers();
    } catch (e) {
      alert(e.message || 'Erreur');
    }
  }

  async function toggleBlocked(u) {
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        token,
        body: { is_blocked: !u.is_blocked }
      });
      await loadUsers();
    } catch (e) {
      alert(e.message || 'Erreur');
    }
  }

  async function revokeSessions(u) {
    if (!window.confirm(`Révoquer toutes les sessions de ${u.username} ?`)) return;
    try {
      await apiFetch(`/api/users/${u.id}/revoke`, { method: 'POST', token });
      alert('Sessions révoquées ✅');
    } catch (e) {
      alert(e.message || 'Erreur révocation');
    }
  }

  function askDelete(u) {
    setConfirmDelete({ open: true, user: u, text: '' });
  }

  async function doDelete() {
    const u = confirmDelete.user;
    if (!u) return;

    if (confirmDelete.text.trim() !== u.username) {
      alert(`Tape exactement: ${u.username}`);
      return;
    }

    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PUT',
        token,
        body: { is_active: false }
      });
      setConfirmDelete({ open: false, user: null, text: '' });
      await loadUsers();
    } catch (e) {
      alert(e.message || 'Erreur suppression');
    }
  }

  async function copyEmail(email) {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      alert('Email copié ✅');
    } catch {
      // fallback simple
      const ta = document.createElement('textarea');
      ta.value = email;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Email copié ✅');
    }
  }

  function SortTh({ k, children }) {
    const active = sortKey === k;
    return (
      <th className={'thSort ' + (active ? 'active' : '')} onClick={() => toggleSort(k)}>
        <span>{children}</span>
        <span className="sortArrow">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </th>
    );
  }

  return (
    <div className="usersPage" onClick={() => setMenuOpenId(null)}>
      <div className="card">
        <div className="rowBetween" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>Gestion des Utilisateurs</h2>
            <div className="muted" style={{ marginTop: 4 }}>
              Tri par défaut: <b>Nom A→Z</b> · RBAC (rôle + permissions) · Révocation sessions · Audit logs
            </div>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-outline" onClick={loadUsers}>
              <span className="btnIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-3-6.7" />
                    <path d="M21 3v7h-7" />
                  </svg>
              </span>
              Actualiser
            </button>
            <button className="btn" onClick={openCreate}>+ Nouvel Utilisateur</button>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {selectedCount > 0 && (
          <div className="bulkBar">
            <div><b>{selectedCount}</b> sélectionné(s)</div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm btn-outline" onClick={() => bulkPatch({ is_active: true })}>Activer</button>
              <button className="btn btn-sm btn-outline" onClick={() => bulkPatch({ is_active: false })}>Désactiver</button>

              <select
                className="input input-sm"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value;
                  e.target.value = '';
                  if (!v) return;
                  bulkPatch({ role: v });
                }}
                title="Changer rôle en masse"
              >
                <option value="">Changer rôle…</option>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="tableWrap">
          <table className="table usersTable">
            <thead>
              <tr>
                <th style={{ width: 44 }}>
                  <input
                    type="checkbox"
                    checked={sortedUsers.length > 0 && sortedUsers.every((u) => selected.has(u.id))}
                    onChange={(e) => { e.stopPropagation(); toggleSelectAll(); }}
                    title="Tout sélectionner"
                  />
                </th>
                <SortTh k="name">Nom</SortTh>
                <SortTh k="email">Email</SortTh>
                <SortTh k="role">Rôle</SortTh>
                <SortTh k="status">Statut</SortTh>
                <SortTh k="last_login">Dernière connexion</SortTh>
                <SortTh k="created">Créé le</SortTh>
                <th style={{ width: 70 }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td><div className="sk skBox" /></td>
                    <td><div className="sk skLine" /></td>
                    <td><div className="sk skLine" /></td>
                    <td><div className="sk skPill" /></td>
                    <td><div className="sk skPill" /></td>
                    <td><div className="sk skLine" /></td>
                    <td><div className="sk skLine" /></td>
                    <td><div className="sk skBox" /></td>
                  </tr>
                ))
              ) : sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="emptyCell">
                    <div className="emptyState">
                      <div className="emptyTitle">Aucun utilisateur</div>
                      <div className="muted">Crée ton premier utilisateur Admin / Logistique / RAF / Demandeur.</div>
                      <button className="btn" style={{ marginTop: 10 }} onClick={openCreate}>+ Nouvel Utilisateur</button>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedUsers.map(u => {
                  const st = displayStatus(u);

                  return (
                    <tr
                      key={u.id}
                      className="rowClickable"
                      style={{ opacity: u.is_active ? 1 : 0.75 }}
                      onClick={() => setDrawerUser(u)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected(u.id)}
                          onChange={() => toggleSelect(u.id)}
                          title="Sélectionner"
                        />
                      </td>

                      <td className="cellName">
                        <div className="nameMain">{u.first_name} {u.last_name}</div>
                        <div className="mutedSmall">@{u.username}</div>
                      </td>

                      <td className="cellEmail" title={u.email} onClick={(e) => e.stopPropagation()}>
                        <div className="emailWrap">
                          <span className="truncate">{u.email}</span>
                          <button className="iconBtn usersIconBtn" title="Copier email" onClick={() => copyEmail(u.email)}>⧉</button>
                        </div>
                      </td>

                      <td>
                        <span className={'badge role ' + (u.role || '').toLowerCase()}>{u.role}</span>
                      </td>

                      <td>
                        <span className={'badge ' + st.cls}>{st.text}</span>
                      </td>

                      <td title={u.last_login_at ? ymdhms(u.last_login_at) : '—'}>
                        {u.last_login_at ? ymdhms(u.last_login_at) : '—'}
                      </td>

                      <td title={u.created_at ? ymdhms(u.created_at) : '—'}>
                        {u.created_at ? ymdhms(u.created_at) : '—'}
                      </td>

                      <td onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
                        <button
                          className="kebabBtn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId((p) => (p === u.id ? null : u.id));
                          }}
                          title="Menu"
                          type="button"
                        >
                          …
                        </button>

                        {menuOpenId === u.id && (
                          <div className="kebabMenu" onClick={(e) => e.stopPropagation()}>
                            <button className="kItem" onClick={() => { setMenuOpenId(null); openEdit(u); }} type="button">Modifier</button>
                            <button className="kItem" onClick={() => { setMenuOpenId(null); toggleActive(u); }} type="button">
                              {u.is_active ? 'Désactiver' : 'Activer'}
                            </button>
                            <button className="kItem" onClick={() => { setMenuOpenId(null); toggleBlocked(u); }} type="button">
                              {u.is_blocked ? 'Débloquer' : 'Bloquer'}
                            </button>
                            <button className="kItem" onClick={() => { setMenuOpenId(null); revokeSessions(u); }} type="button">Révoquer sessions</button>
                            <div className="kSep" />
                            <button className="kItem danger" onClick={() => { setMenuOpenId(null); askDelete(u); }} type="button">Supprimer (soft)</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <UserDrawer
        user={drawerUser}
        open={!!drawerUser}
        onClose={() => setDrawerUser(null)}
        onEdit={(u) => { setDrawerUser(null); openEdit(u); }}
        onToggleActive={toggleActive}
        onToggleBlocked={toggleBlocked}
        onRevokeSessions={revokeSessions}
        onDelete={askDelete}
      />

      {showModal && (
        <Modal
          title={editingUser ? 'Modifier Utilisateur' : 'Créer Utilisateur'}
          onClose={() => setShowModal(false)}
          width={720}
        >
          <form onSubmit={handleSubmit} className="form">
            <div className="grid2">
              <label className="field">
                <span className="label">Prénom</span>
                <input
                  required
                  className="input"
                  value={formData.first_name}
                  onChange={e => setFormData({ ...formData, first_name: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="label">Nom</span>
                <input
                  required
                  className="input"
                  value={formData.last_name}
                  onChange={e => setFormData({ ...formData, last_name: e.target.value })}
                />
              </label>
            </div>

            <div className="grid2">
              <label className="field">
                <span className="label">Identifiant (Login)</span>
                <input
                  required
                  className="input"
                  value={formData.username}
                  onChange={e => {
                    setUsernameTouched(true);
                    setFormData({ ...formData, username: e.target.value });
                  }}
                />
                {!editingUser && !usernameTouched && (
                  <div className="hint">Généré automatiquement depuis prénom/nom (modifiable)</div>
                )}
              </label>

              <label className="field">
                <span className="label">Email</span>
                <input
                  required
                  type="email"
                  className="input"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </label>
            </div>

            <div className="grid2">
              <label className="field">
                <span className="label">Rôle</span>
                <select
                  className="input"
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>

              <div className="field">
                <span className="label">Permissions supplémentaires</span>
                <div className="permGrid">
                  {EXTRA_PERMS.map((p) => {
                    const checked = (formData.permissions || []).includes(p.value);
                    return (
                      <label key={p.value} className="permItem">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setFormData((prev) => {
                              const set = new Set(prev.permissions || []);
                              if (on) set.add(p.value);
                              else set.delete(p.value);
                              return { ...prev, permissions: Array.from(set) };
                            });
                          }}
                        />
                        <span>{p.label}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="hint">RBAC = rôle + permissions ajoutées (ex: Importer, Flotte)</div>
              </div>
            </div>

            <div className="grid2">
              <label className="field rowInline">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                />
                <span className="label" style={{ marginBottom: 0 }}>Compte Actif</span>
              </label>

              <label className="field rowInline">
                <input
                  type="checkbox"
                  checked={formData.is_blocked}
                  onChange={e => setFormData({ ...formData, is_blocked: e.target.checked })}
                />
                <span className="label" style={{ marginBottom: 0 }}>Compte Bloqué</span>
              </label>
            </div>

            <div className="field">
              <span className="label">Mot de passe {editingUser && '(Laisser vide pour ne pas changer)'}</span>
              <input
                type="password"
                className="input"
                placeholder={editingUser ? 'Nouveau mot de passe...' : 'Mot de passe obligatoire'}
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                required={!editingUser}
              />
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16, gap: 10 }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary">{editingUser ? 'Enregistrer' : 'Créer'}</button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete.open && (
        <Modal
          title={`Supprimer (soft) : ${confirmDelete.user?.username || ''}`}
          onClose={() => setConfirmDelete({ open: false, user: null, text: '' })}
          width={520}
        >
          <div className="dangerBox">
            <div><b>Action sensible :</b> le compte sera désactivé (is_active=false).</div>
            <div className="muted" style={{ marginTop: 8 }}>
              Pour confirmer, tape le username : <b>{confirmDelete.user?.username}</b>
            </div>

            <input
              className="input"
              style={{ marginTop: 12 }}
              value={confirmDelete.text}
              onChange={(e) => setConfirmDelete((p) => ({ ...p, text: e.target.value }))}
              placeholder="Tape le username exactement…"
            />

            <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-outline" type="button" onClick={() => setConfirmDelete({ open: false, user: null, text: '' })}>
                Annuler
              </button>
              <button className="btn btn-danger" type="button" onClick={doDelete}>
                Confirmer suppression
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
