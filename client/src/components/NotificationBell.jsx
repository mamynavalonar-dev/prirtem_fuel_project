import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

function severityToDot(sev) {
  if (sev === 'error') return 'var(--danger)';
  if (sev === 'warning') return 'var(--warning)';
  if (sev === 'success') return 'var(--success)';
  if (sev === 'info') return 'var(--accent)';
  return 'rgba(255,255,255,.55)';
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function toMs(ts) {
  const d = new Date(ts);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export default function NotificationBell() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const [toasts, setToasts] = useState([]);
  const dropdownRef = useRef(null);

  // ✅ Lecture mémorisée par user
  const readKey = useMemo(() => {
    const uid = user?.id ? String(user.id) : '';
    return uid ? `prirtem_notif_lastRead_${uid}` : '';
  }, [user?.id]);

  const lastReadMsRef = useRef(0);
  const hasFetchedRef = useRef(false);
  const prevUnreadRef = useRef(0);

  function loadLastRead() {
    if (!readKey) {
      lastReadMsRef.current = 0;
      return 0;
    }
    try {
      const raw = localStorage.getItem(readKey);
      const ms = raw ? Number(raw) : 0;
      lastReadMsRef.current = Number.isFinite(ms) ? ms : 0;
      return lastReadMsRef.current;
    } catch {
      lastReadMsRef.current = 0;
      return 0;
    }
  }

  function saveLastRead(ms) {
    lastReadMsRef.current = ms;
    if (!readKey) return;
    try {
      localStorage.setItem(readKey, String(ms));
    } catch {
      // ignore
    }
  }

  function markAllRead() {
    const nowMs = Date.now();
    saveLastRead(nowMs);
    // recalcul immédiat
    setUnread(0);
  }

  function computeUnreadCount(list) {
    const cut = lastReadMsRef.current || 0;
    return (list || []).filter((n) => toMs(n.timestamp) > cut).length;
  }

  function pushToast(t) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = { id, timestamp: new Date().toISOString(), ...t };
    setToasts((prev) => [toast, ...prev].slice(0, 4));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3500);
  }

  async function fetchNotifications() {
    if (!token) return;
    try {
      const data = await apiFetch('/api/notifications', { token });
      const newNotifs = data.notifications || [];

      setNotifications(newNotifs);

      const newUnread = computeUnreadCount(newNotifs);
      setUnread(newUnread);

      // Toast uniquement après 1er fetch
      if (hasFetchedRef.current) {
        const prevUnread = prevUnreadRef.current;
        if (newUnread > prevUnread) {
          const delta = newUnread - prevUnread;
          pushToast({
            title: 'Nouvelle notification',
            message: `🔔 ${delta} nouvelle(s) notification(s)`,
            severity: 'info'
          });
        }
      }
      hasFetchedRef.current = true;
      prevUnreadRef.current = newUnread;
    } catch (e) {
      console.error('Notifications: fetch failed', e);
    }
  }

  // Init / Poll
  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setUnread(0);
      setOpen(false);
      hasFetchedRef.current = false;
      prevUnreadRef.current = 0;
      lastReadMsRef.current = 0;
      return;
    }

    // charge lastRead quand user dispo
    loadLastRead();

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, readKey]);

  // close on outside click
  useEffect(() => {
    const onDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const latest = useMemo(() => notifications.slice(0, 10), [notifications]);

  function handleClickNotif(n) {
    // En pratique, ouvrir la cloche marque déjà tout lu.
    // Mais on garde un recalcul propre au clic.
    const nowMs = Date.now();
    saveLastRead(nowMs);
    setUnread(0);

    setOpen(false);
    if (n?.link) navigate(n.link);
  }

  return (
    <>
      {toasts.length > 0 && (
        <div className="toastHost" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              <div className="toastRow">
                <div className="toastDot" style={{ background: severityToDot(t.severity) }} />
                <div style={{ flex: 1 }}>
                  <div className="toastTitle">{t.title}</div>
                  <div className="toastMsg">{t.message}</div>
                  <div className="toastTime">{formatTimestamp(t.timestamp)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }} ref={dropdownRef}>
        <button
          className="iconBtn"
          onClick={() => {
            const next = !open;
            setOpen(next);

            if (next) {
              // ✅ quand tu ouvres : tu as "vu" => badge doit disparaître
              markAllRead();
              // et on rafraîchit
              fetchNotifications();
            }
          }}
          aria-label="Notifications"
          style={{ position: 'relative' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Zm6-6V11a6 6 0 0 0-5-5.9V4a1 1 0 1 0-2 0v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>

          {unread > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 9,
                height: 9,
                borderRadius: 999,
                background: 'var(--danger)',
                boxShadow: '0 0 0 2px var(--surface)'
              }}
            />
          )}
        </button>

        {open && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 48,
              width: 360,
              maxWidth: '92vw',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              boxShadow: 'var(--shadow)',
              overflow: 'hidden',
              zIndex: 9999
            }}
          >
            <div
              style={{
                padding: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                borderBottom: '1px solid var(--border)'
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 13, color: 'var(--text)' }}>Notifications</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {unread > 0 && (
                  <button className="btn btn-secondary btn-sm" onClick={markAllRead}>
                    Marquer tout lu
                  </button>
                )}
                <div className="badge badge-info">{unread} non lue(s)</div>
              </div>
            </div>

            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {latest.length === 0 ? (
                <div style={{ padding: 14 }} className="muted">
                  Rien pour le moment.
                </div>
              ) : (
                latest.map((n) => {
                  const isUnread = toMs(n.timestamp) > (lastReadMsRef.current || 0);

                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClickNotif(n)}
                      className="btn"
                      style={{
                        width: '100%',
                        background: isUnread ? 'rgba(59,130,246,.06)' : 'transparent',
                        color: 'inherit',
                        border: 'none',
                        borderBottom: '1px solid rgba(255,255,255,.06)',
                        textAlign: 'left',
                        padding: 12,
                        borderRadius: 0,
                        justifyContent: 'flex-start'
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                        <div style={{ width: 10, display: 'flex', justifyContent: 'center' }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 99,
                              background: severityToDot(n.severity),
                              boxShadow: isUnread ? '0 0 0 2px rgba(59,130,246,.12)' : 'none'
                            }}
                          />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 900,
                              fontSize: 13,
                              marginBottom: 3,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: 'var(--text)'
                            }}
                          >
                            {n.title}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{n.message}</div>
                          <div style={{ fontSize: 11, color: 'rgba(229,231,235,.55)' }}>{formatTimestamp(n.timestamp)}</div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
