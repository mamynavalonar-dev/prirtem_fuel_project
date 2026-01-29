import React, { useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api.js';

export default function Reset() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const email = useMemo(() => params.get('email') || '', [params]);
  const token = useMemo(() => params.get('token') || '', [params]);

  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/auth/reset', {
        method: 'POST',
        body: { email, token, new_password: newPassword }
      });
      setDone(true);
      setTimeout(() => nav('/login'), 700);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 520, margin: '40px auto' }}>
        <h2 style={{ marginTop: 0 }}>Réinitialiser mot de passe</h2>
        {done ? (
          <div className="notice">Mot de passe modifié ✅ Redirection...</div>
        ) : (
          <>
            <div className="muted" style={{ marginBottom: 12 }}>
              Email: <b>{email || '—'}</b>
            </div>
            {error && <div className="notice error">{error}</div>}
            <form onSubmit={onSubmit} className="form">
              <label className="label">Nouveau mot de passe</label>
              <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <button className="btn btn-primary" type="submit">Valider</button>
            </form>
          </>
        )}
        <div style={{ marginTop: 12 }}>
          <Link to="/login">Retour connexion</Link>
        </div>
      </div>
    </div>
  );
}
