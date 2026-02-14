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

export default function NotificationBell() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const [toasts, setToasts] = useState([]);
  const prevCountRef = useRef(0);
  const dropdownRef = useRef(null);

  async function fetchNotifications() {
    if (!token) return;
    try {
      const data = await apiFetch('/api/notifications', { token });
      const newNotifs = data.notifications || [];
      const newCount = Number(data.count || 0);

      setNotifications(newNotifs);
      setUnread(newCount);

      const prev = prevCountRef.current;
      if (prev > 0 && newCount > prev) {
        const delta = newCount - prev;
        pushToast({
          title: 'Nouvelle notification',
          message: `🔔 ${delta} nouvelle(s) notification(s)`,
          severity: 'info'
        });
      }
      prevCountRef.current = newCount;
    } catch (e) {
      console.error('Notifications: fetch failed', e);
    }
  }

  function pushToast(t) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = { id, timestamp: new Date().toISOString(), ...t };
    setToasts((prev) => [toast, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 3500);
  }

  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setUnread(0);
      setOpen(false);
      prevCountRef.current = 0;
      return;
    }

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    const onDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const latest = useMemo(() => notifications.slice(0, 10), [notifications]);

  function handleClickNotif(n) {
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
            if (next) fetchNotifications();
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
                borderBottom: '1px solid var(--border)'
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 13, color: 'var(--text)' }}>Notifications</div>
              <div className="badge badge-info">{unread} non lue(s)</div>
            </div>

            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {latest.length === 0 ? (
                <div style={{ padding: 14 }} className="muted">
                  Rien pour le moment.
                </div>
              ) : (
                latest.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClickNotif(n)}
                    className="btn"
                    style={{
                      width: '100%',
                      background: 'transparent',
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
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: severityToDot(n.severity) }} />
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
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
