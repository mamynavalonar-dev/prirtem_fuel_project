import React from "react";
import styled from "styled-components";

export default function UserProfileCard({
  user,
  onEmail,
  onMessage,
  onEdit,
  onMore,
  className,
}) {
  const u = user ?? {};

  const displayName =
    u.name ||
    [u.first_name, u.last_name].filter(Boolean).join(" ") ||
    u.username ||
    "Utilisateur";

  const initials = getInitials(displayName);

  const derivedStatus =
    u.status ||
    (u.is_blocked ? "blocked" : (u.is_active === false ? "away" : "active"));

  return (
    <Card className={className}>
      <Header>
        <AvatarWrap>
          <AvatarRing />
          <Avatar>
            {u.avatarUrl ? (
              <img src={u.avatarUrl} alt={displayName} />
            ) : (
              <Fallback>{initials}</Fallback>
            )}
          </Avatar>
          <StatusDot data-status={derivedStatus} title={derivedStatus} />
        </AvatarWrap>

        <TitleBlock>
          <NameRow>
            <Name title={displayName}>{displayName}</Name>
            <RolePill>{u.role || "Membre"}</RolePill>
          </NameRow>
          <Sub title={u.email || u.username || ""}>{u.email || `@${u.username || ""}` || "—"}</Sub>
        </TitleBlock>

        {/* <Actions>
          <IconBtn type="button" onClick={onEmail} aria-label="Envoyer un email" title="Email">
            <MailIcon />
          </IconBtn>
          <IconBtn type="button" onClick={onMessage} aria-label="Envoyer un message" title="Message">
            <ChatIcon />
          </IconBtn>
          <IconBtn type="button" onClick={onEdit} aria-label="Modifier" title="Modifier">
            <EditIcon />
          </IconBtn>
          <IconBtn type="button" onClick={onMore} aria-label="Plus" title="Plus">
            <MoreIcon />
          </IconBtn>
        </Actions> */}
      </Header>

      <Divider />

      <InfoGrid>
        <InfoItem>
          <Label>Email</Label>
          <Value title={u.email || ""}>{u.email || "—"}</Value>
        </InfoItem>

        <InfoItem>
          <Label>Username</Label>
          <Value title={u.username || ""}>@{u.username || "—"}</Value>
        </InfoItem>

        <InfoItem>
          <Label>Rôle</Label>
          <Value title={u.role || ""}>{u.role || "—"}</Value>
        </InfoItem>

        <InfoItem>
          <Label>Statut</Label>
          <StatusPill data-status={derivedStatus}>
            {formatStatus(derivedStatus)}
          </StatusPill>
        </InfoItem>
      </InfoGrid>
    </Card>
  );
}

/* ---------------- helpers ---------------- */
function getInitials(name) {
  const s = String(name || "").trim();
  if (!s) return "U";
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}

function formatStatus(v) {
  const s = String(v || "").toLowerCase();
  if (s === "away" || s === "inactive") return "Inactif";
  if (s === "blocked") return "Bloqué";
  return "Actif";
}

/* ---------------- styled (theme via html[data-theme]) ---------------- */
const Card = styled.section`
  /* Light (default) */
  --card-bg: rgba(255, 255, 255, 0.85);
  --card-border: rgba(15, 23, 42, 0.12);
  --text: rgba(15, 23, 42, 0.92);
  --muted: rgba(15, 23, 42, 0.62);

  width: 100%;
  border-radius: 18px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow:
    0 10px 30px rgba(15, 23, 42, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.10);
  padding: 16px;
  color: var(--text);
  transition: transform 180ms ease, box-shadow 180ms ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow:
      0 14px 38px rgba(15, 23, 42, 0.14),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  /* Dark (theme switch) */
  html[data-theme="dark"] & {
    --card-bg: rgba(255, 255, 255, 0.06);
    --card-border: rgba(255, 255, 255, 0.12);
    --text: rgba(229, 231, 235, 0.92);
    --muted: rgba(229, 231, 235, 0.62);

    box-shadow:
      0 14px 38px rgba(0, 0, 0, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
`;

const AvatarWrap = styled.div`
  position: relative;
  width: 58px;
  height: 58px;
`;

const AvatarRing = styled.div`
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 20%, rgba(120, 163, 255, 0.9), rgba(255, 106, 193, 0.75) 45%, rgba(0, 0, 0, 0) 70%);
  opacity: 0.9;
`;

const Avatar = styled.div`
  position: absolute;
  inset: 2px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.10);
  display: grid;
  place-items: center;

  html[data-theme="dark"] & {
    background: rgba(0, 0, 0, 0.22);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const Fallback = styled.div`
  font-weight: 900;
  letter-spacing: 0.5px;
  font-size: 16px;
  color: var(--text);
`;

const StatusDot = styled.span`
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.28);

  &[data-status="active"] { background: #22c55e; }
  &[data-status="away"] { background: #f59e0b; }
  &[data-status="blocked"] { background: #ef4444; }
`;

const TitleBlock = styled.div`
  min-width: 0;
`;

const NameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const Name = styled.div`
  font-size: 16px;
  font-weight: 900;
  line-height: 1.2;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RolePill = styled.span`
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(15, 23, 42, 0.04);
  color: var(--muted);
  white-space: nowrap;

  html[data-theme="dark"] & {
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.07);
  }
`;

const Sub = styled.div`
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
`;

const IconBtn = styled.button`
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(15, 23, 42, 0.04);
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--text);
  transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;

  &:hover {
    transform: translateY(-1px);
    background: rgba(15, 23, 42, 0.06);
    border-color: rgba(15, 23, 42, 0.14);
  }

  &:active { transform: translateY(0px); }

  svg { width: 18px; height: 18px; opacity: 0.92; }

  html[data-theme="dark"] & {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);

    &:hover {
      background: rgba(255, 255, 255, 0.10);
      border-color: rgba(255, 255, 255, 0.22);
    }
  }
`;

const Divider = styled.div`
  margin: 14px 0;
  height: 1px;
  background: linear-gradient(
    to right,
    rgba(15, 23, 42, 0),
    rgba(15, 23, 42, 0.14),
    rgba(15, 23, 42, 0)
  );

  html[data-theme="dark"] & {
    background: linear-gradient(
      to right,
      rgba(255, 255, 255, 0),
      rgba(255, 255, 255, 0.16),
      rgba(255, 255, 255, 0)
    );
  }
`;

const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const InfoItem = styled.div`
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(15, 23, 42, 0.03);
  padding: 10px 12px;

  html[data-theme="dark"] & {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
  }
`;

const Label = styled.div`
  font-size: 11px;
  letter-spacing: 0.35px;
  text-transform: uppercase;
  color: var(--muted);
`;

const Value = styled.div`
  margin-top: 6px;
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const StatusPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  width: fit-content;
  font-size: 13px;
  font-weight: 900;
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(15, 23, 42, 0.04);

  &[data-status="active"] { color: #22c55e; }
  &[data-status="away"] { color: #f59e0b; }
  &[data-status="blocked"] { color: #ef4444; }

  html[data-theme="dark"] & {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
  }
`;

/* icons */
// function MailIcon() {
//   return (
//     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//       <rect x="3" y="5" width="18" height="14" rx="2" />
//       <path d="M3 7l9 6 9-6" />
//     </svg>
//   );
// }
// function ChatIcon() {
//   return (
//     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//       <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
//     </svg>
//   );
// }
// function EditIcon() {
//   return (
//     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//       <path d="M12 20h9" />
//       <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
//     </svg>
//   );
// }
// function MoreIcon() {
//   return (
//     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//       <path d="M12 12h.01" />
//       <path d="M19 12h.01" />
//       <path d="M5 12h.01" />
//     </svg>
//   );
// }
