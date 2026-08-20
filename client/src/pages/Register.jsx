// ────────────────── client/src/pages/Register.jsx ──────────────────
/**
 * CORRECTIF ARCHITECTURE APPLIQUÉ : onSubmit appelle register() du
 * AuthContext, qui encapsule l'appel API et la pose du cookie de session.
 * Plus de manipulation de token côté composant.
 */
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

const ROLES = [
  { value: "DEMANDEUR", label: "Demandeur" },
  { value: "LOGISTIQUE", label: "Logistique" },
  { value: "RAF", label: "RAF" },
];

export default function Register() {
  const nav = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    username: "",
    email: "",
    role: "DEMANDEUR",
    password: "",
    password2: "",
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.password2) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    try {
      await register({
        first_name: form.first_name,
        last_name: form.last_name,
        username: form.username,
        email: form.email,
        role: form.role,
        password: form.password,
      });
      nav("/app");
    } catch (e2) {
      setError(e2.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      <div className="card">
        <h2>Inscription</h2>
        <p className="muted">Compte PRIRTEM (offline).</p>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={onSubmit} className="form">
          <div className="grid2">
            <label className="field">
              <span>Nom</span>
              <input
                value={form.last_name}
                onChange={(e) =>
                  setForm({ ...form, last_name: e.target.value })
                }
                required
              />
            </label>
            <label className="field">
              <span>Prénom</span>
              <input
                value={form.first_name}
                onChange={(e) =>
                  setForm({ ...form, first_name: e.target.value })
                }
                required
              />
            </label>
          </div>

          <label className="field">
            <span>Nom d'utilisateur</span>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Rôle</span>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid2">
            <label className="field">
              <span>Mot de passe</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Confirmer</span>
              <input
                type="password"
                value={form.password2}
                onChange={(e) =>
                  setForm({ ...form, password2: e.target.value })
                }
                required
              />
            </label>
          </div>
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "Création..." : "Créer le compte"}
          </button>
        </form>
        <div style={{ marginTop: 12 }}>
          <Link to="/login">Déjà inscrit ? Se connecter</Link>
        </div>
      </div>
    </div>
  );
}
