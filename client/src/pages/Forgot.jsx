import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../utils/api.js';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/auth/forgot', { method: 'POST', body: { email } });
      setSent(true);
    } catch (e2) {
      setError(e2.message);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <div className="card">
        <h2>Mot de passe oublié</h2>
        {sent ? (
          <p className="muted">
            Si l’adresse existe, un lien de réinitialisation a été envoyé.
            (Si SMTP n’est pas configuré, le lien s’affiche dans la console du serveur.)
          </p>
        ) : (
          <form onSubmit={onSubmit} className="form">
            <label className="label">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ex: nom@prirtem.mg" />
            {error && <div className="error">{error}</div>}
            <button className="btn" type="submit">Envoyer</button>
          </form>
        )}
        <div style={{ marginTop: 10 }}>
          <Link to="/login">Retour</Link>
        </div>
      </div>
    </div>
  );
}
