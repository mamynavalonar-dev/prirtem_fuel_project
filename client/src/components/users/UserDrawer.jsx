import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import UserProfileCard from './UserProfileCard.jsx';
import './UserDrawer.css';

function ymdhms(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function status(u) {
  if (!u) return { text: '—', cls: 'badge' };
  if (u.is_blocked) return { text: 'Bloqué', cls: 'badge badge-warn' };
  if (!u.is_active) return { text: 'Inactif', cls: 'badge badge-bad' };
  return { text: 'Actif', cls: 'badge badge-ok' };
}

export default function UserDrawer({
  user,
  open,
  onClose,
  onEdit,
  onToggleActive,
  onToggleBlocked,
  onRevokeSessions,
  onDelete
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !user) return null;

  const st = status(user);

  return createPortal(
    <div className="udOverlay" onClick={onClose} role="presentation">
      <div
        className="udPanel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Profil utilisateur"
      >
        <div className="udTop">
          <div>
            <div className="udTitle">{user.first_name} {user.last_name}</div>
            <div className="udSub">
              @{user.username} · <span className={st.cls}>{st.text}</span>
            </div>
          </div>
          <button className="udClose" type="button" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <UserProfileCard user={user} />

        <div className="udSection">
          <div className="udGrid">
            <div className="udField">
              <div className="udLabel">Email</div>
              <div className="udValue">{user.email || '—'}</div>
            </div>
            <div className="udField">
              <div className="udLabel">Rôle</div>
              <div className="udValue">{user.role || '—'}</div>
            </div>
            <div className="udField">
              <div className="udLabel">Permissions supplémentaires</div>
              <div className="udValue">
                {(user.permissions || []).length ? (user.permissions || []).join(', ') : '—'}
              </div>
            </div>
            <div className="udField">
              <div className="udLabel">Dernière connexion</div>
              <div className="udValue">{ymdhms(user.last_login_at)}</div>
            </div>
            <div className="udField">
              <div className="udLabel">Créé le</div>
              <div className="udValue">{ymdhms(user.created_at)}</div>
            </div>
          </div>
        </div>

        <div className="udActions">
          <button className="btn btn-outline" type="button" onClick={() => onEdit?.(user)}>Modifier</button>
          <button className="btn btn-outline" type="button" onClick={() => onToggleActive?.(user)}>
            {user.is_active ? 'Désactiver' : 'Activer'}
          </button>
          <button className="btn btn-outline" type="button" onClick={() => onToggleBlocked?.(user)}>
            {user.is_blocked ? 'Débloquer' : 'Bloquer'}
          </button>
          <button className="btn btn-outline" type="button" onClick={() => onRevokeSessions?.(user)}>Révoquer sessions</button>
          <button className="btn btn-danger" type="button" onClick={() => onDelete?.(user)}>Supprimer (soft)</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
