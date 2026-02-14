import React, { memo } from "react";
import styled from "styled-components";

function UserCard({
  user,
  onOpen,          // ouvrir le drawer / détails
  onReset,         // reset mdp
  onToggle,        // enable/disable
  onRevoke,        // revoke sessions/tickets
  onDelete,        // delete user
  busy = false,    // bool ou {reset:true,...} si tu veux
  mode = "card",   // "card" (liste) ou "drawer" (header)
}) {
  const isDisabled = !!user?.disabled || !!user?.isDisabled || user?.enabled === false;

  return (
    <StyledWrapper data-mode={mode} data-disabled={isDisabled ? "1" : "0"}>
      <div className="card" onClick={onOpen} role="button" tabIndex={0}>
        <button
          className="mail"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen?.();
          }}
          aria-label="Ouvrir les détails"
          disabled={busy}
        >
          {/* icône mail */}
          <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect width={20} height={16} x={2} y={4} rx={2} />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </button>

        <div className="profile-pic" aria-hidden="true">
          {/* TON SVG COMPLET ICI (inchangé) */}
          {/* <svg ...> ... </svg> */}
        </div>

        <div className="meta">
          <div className="name">{user?.name || user?.username || "Utilisateur"}</div>
          <div className="email">{user?.email || "—"}</div>
          <div className="badges">
            <span className={`badge ${isDisabled ? "off" : "on"}`}>
              {isDisabled ? "Désactivé" : "Actif"}
            </span>
            {user?.role ? <span className="badge role">{user.role}</span> : null}
          </div>
        </div>

        <div className="actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn ghost" onClick={onReset} disabled={busy}>
            Reset
          </button>

          <button
            type="button"
            className="btn ghost"
            onClick={onToggle}
            disabled={busy}
          >
            {isDisabled ? "Activer" : "Désactiver"}
          </button>

          <button type="button" className="btn ghost" onClick={onRevoke} disabled={busy}>
            Revoke
          </button>

          <button type="button" className="btn danger" onClick={onDelete} disabled={busy}>
            Supprimer
          </button>
        </div>
      </div>
    </StyledWrapper>
  );
}

export default memo(UserCard);

/** ⚠️ Styles: garde ton StyledWrapper actuel si tu l’as déjà.
 *  Sinon voici une base propre (tu peux l’ajuster).
 */
const StyledWrapper = styled.div`
  .card{
    position:relative;
    display:flex;
    gap:14px;
    align-items:center;
    padding:14px 14px 12px;
    border-radius:16px;
    border:1px solid rgba(255,255,255,.08);
    background: rgba(20, 20, 28, .55);
    backdrop-filter: blur(14px);
    cursor:pointer;
    user-select:none;
  }

  &[data-disabled="1"] .card{
    opacity:.72;
  }

  .mail{
    position:absolute;
    top:10px;
    right:10px;
    width:40px;
    height:40px;
    border-radius:12px;
    border:1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.06);
    color: rgba(255,255,255,.85);
    display:grid;
    place-items:center;
  }

  .profile-pic{
    width:56px;
    height:56px;
    border-radius:14px;
    overflow:hidden;
    border:1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.05);
    display:grid;
    place-items:center;
  }
  .profile-pic svg{ width:100%; height:100%; display:block; }

  .meta{
    flex:1;
    min-width:0;
    padding-right:54px; /* pour pas passer sous le bouton mail */
  }
  .name{
    font-weight:700;
    color: rgba(255,255,255,.95);
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .email{
    margin-top:2px;
    font-size:12.5px;
    color: rgba(255,255,255,.70);
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .badges{
    margin-top:8px;
    display:flex;
    gap:8px;
    flex-wrap:wrap;
  }
  .badge{
    font-size:11px;
    padding:4px 8px;
    border-radius:999px;
    border:1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.06);
    color: rgba(255,255,255,.82);
  }
  .badge.on{ border-color: rgba(46, 213, 115, .35); }
  .badge.off{ border-color: rgba(255, 71, 87, .35); }
  .badge.role{ opacity:.9; }

  .actions{
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    justify-content:flex-end;
  }
  .btn{
    height:32px;
    padding:0 10px;
    border-radius:10px;
    border:1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.06);
    color: rgba(255,255,255,.9);
    font-weight:600;
    font-size:12px;
    cursor:pointer;
  }
  .btn.ghost:hover{ background: rgba(255,255,255,.10); }
  .btn.danger{
    border-color: rgba(255, 71, 87, .35);
  }
`;
