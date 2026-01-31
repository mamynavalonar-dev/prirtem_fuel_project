import React, { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

const ROLES = [
  { value: 'DEMANDEUR', label: 'Demandeur' },
  { value: 'LOGISTIQUE', label: 'Logistique' },
  { value: 'RAF', label: 'RAF' },
  { value: 'ADMIN', label: 'Admin' }
];

export default function Users() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // État pour la création / modification
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = mode création
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    role: 'DEMANDEUR',
    password: '',
    is_active: true
  });

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      // NOTE: Assurez-vous d'avoir créé la route GET /api/users dans le backend
      const data = await apiFetch('/api/users', { token });
      setUsers(data.users || []);
    } catch (e) {
      setError(e.message || "Erreur lors du chargement des utilisateurs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    setFormData({
      first_name: '',
      last_name: '',
      username: '',
      email: '',
      role: 'DEMANDEUR',
      password: '',
      is_active: true
    });
    setShowModal(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setFormData({
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      email: user.email,
      role: user.role,
      password: '', // On laisse vide pour ne pas modifier
      is_active: user.is_active
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      if (editingUser) {
        // Mode Modification
        // NOTE: Assurez-vous d'avoir créé la route PUT /api/users/:id
        await apiFetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          token,
          body: formData
        });
      } else {
        // Mode Création
        if (!formData.password) {
          alert("Le mot de passe est obligatoire pour la création.");
          return;
        }
        // NOTE: On utilise la route existante ou une nouvelle route admin
        await apiFetch('/api/users', { // ou /api/auth/register-admin
          method: 'POST',
          token,
          body: formData
        });
      }
      setShowModal(false);
      await loadUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="container">
      <div className="card">
        <div className="rowBetween" style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Gestion des Utilisateurs</h2>
          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-outline" onClick={loadUsers}>Actualiser</button>
            <button className="btn" onClick={openCreate}>+ Nouvel Utilisateur</button>
          </div>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <div className="tableWrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nom complet</th>
                <th>Utilisateur</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="muted">Chargement...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="muted">Aucun utilisateur trouvé.</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.6 }}>
                    <td>{u.first_name} {u.last_name}</td>
                    <td><b>{u.username}</b></td>
                    <td>{u.email}</td>
                    <td><span className="badge badge-info">{u.role}</span></td>
                    <td>
                      {u.is_active ? (
                        <span className="badge badge-ok">Actif</span>
                      ) : (
                        <span className="badge badge-bad">Inactif</span>
                      )}
                    </td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(u)}>
                        Modifier
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal title={editingUser ? "Modifier Utilisateur" : "Créer Utilisateur"} onClose={() => setShowModal(false)} width={600}>
          <form onSubmit={handleSubmit} className="form">
            <div className="grid2">
              <label className="field">
                <span className="label">Prénom</span>
                <input required className="input" value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} />
              </label>
              <label className="field">
                <span className="label">Nom</span>
                <input required className="input" value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} />
              </label>
            </div>

            <div className="grid2">
              <label className="field">
                <span className="label">Identifiant (Login)</span>
                <input required className="input" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
              </label>
              <label className="field">
                <span className="label">Email</span>
                <input required type="email" className="input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
              </label>
            </div>

            <div className="grid2">
              <label className="field">
                <span className="label">Rôle</span>
                <select className="input" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
              
              <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 }}>
                <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} />
                <span className="label" style={{ marginBottom: 0 }}>Compte Actif</span>
              </label>
            </div>

            <div className="field">
              <span className="label">Mot de passe {editingUser && "(Laisser vide pour ne pas changer)"}</span>
              <input 
                type="password" 
                className="input" 
                placeholder={editingUser ? "Nouveau mot de passe..." : "Mot de passe obligatoire"}
                value={formData.password} 
                onChange={e => setFormData({...formData, password: e.target.value})} 
                required={!editingUser} // Obligatoire seulement à la création
              />
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16, gap: 10 }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary">{editingUser ? "Enregistrer" : "Créer"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}