// ────────────────── client/src/components/ProtectedRoute.jsx ──────────────────
/**
 * Inchangé fonctionnellement : ce composant ne dépendait déjà que de
 * user/loading, jamais du token directement. Confirmé compatible avec le
 * nouveau AuthContext (cookie httpOnly).
 */
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="container">
        <div className="card">Chargement...</div>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
