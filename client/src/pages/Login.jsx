// client/src/pages/Login.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

const ROLES = [
  { value: 'DEMANDEUR', label: 'Demandeur' },
  { value: 'LOGISTIQUE', label: 'Logistique' },
  { value: 'RAF', label: 'RAF' },
  { value: 'ADMIN', label: 'Admin' }
];

export default function Login() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('DEMANDEUR');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { username, role, password }
      });
      setSession(data.token, data.user);
      navigate('/app');
    } catch (err) {
      // (Gestion d'erreur identique à l'original)
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #4f46e5 0%, #0f172a 100%)',
      padding: '20px'
    }}>
      <div className="card" style={{ 
        width: '100%', maxWidth: '420px', 
        padding: '40px', 
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' 
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: 60, height: 60, background: '#4f46e5', borderRadius: 16, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'white', fontWeight: 800 }}>P</div>
          <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Bienvenue</h2>
          <p className="muted">Connectez-vous à PRIRTEM Flotte</p>
        </div>

        {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', textAlign: 'center' }}>{error}</div>}

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="label">Nom d'utilisateur</label>
            <input className="input" style={{ padding: '12px' }} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Votre identifiant" />
          </div>

          <div>
            <label className="label">Rôle</label>
            <select className="input" style={{ padding: '12px' }} value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Mot de passe</label>
            <input className="input" style={{ padding: '12px' }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          <button className="btn" style={{ marginTop: '8px', padding: '14px', fontSize: '1rem' }} disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Link to="/forgot" style={{ color: '#4f46e5' }}>Mot de passe oublié ?</Link>
          <div style={{ color: '#94a3b8' }}>Pas encore de compte ? <Link to="/register" style={{ color: '#4f46e5', fontWeight: '600' }}>Créer un compte</Link></div>
        </div>
      </div>
    </div>
  );
}