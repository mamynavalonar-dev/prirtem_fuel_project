import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

function severityToDot(sev) {
  if (sev === 'error') return 'var(--danger)';
  if (sev === 'warning') return 'var(--warning)';
  if (sev === 'success') return 'var(--success)';
  if (sev === 'info') return 'var(--accent)';
  return 'var(--muted)';
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return String(ts);

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

  const LIMIT = 10;
  const DAYS = 7;

  const [open, setOpen] = useState(false);

  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [toasts, setToasts] = useState([]);
  const dropdownRef = useRef(null);

  const knownIdsRef = useRef(new Set());
  const hasFetchedRef = useRef(false);
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const hasMore = useMemo(() => {
    return items.length < totalCount;
  }, [items.length, totalCount]);

  function pushToast(t) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = { id, timestamp: new Date().toISOString(), ...t };
    setToasts((prev) => [toast, ...prev].slice(0, 4));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3500);
  }

  function recomputeUnread(list) {
    const n = (list || []).filter((x) => !x?.is_read).length;
    setUnread(n);
    return n;
  }

  async function fetchPage({ reset = false } = {}) {
    if (!token) return;

    const nextOffset = reset ? 0 : offset;
    const isMore = !reset;

    try {
      if (isMore) setLoadingMore(true);
      else setLoading(true);

      const qs = `?limit=${LIMIT}&offset=${nextOffset}&days=${DAYS}`;
      const data = await apiFetch(`/api/notifications${qs}`, { token });

      const page = Array.isArray(data?.notifications) ? data.notifications : [];
      const count = Number.isFinite(Number(data?.count)) ? Number(data.count) : (reset ? page.length : totalCount);

      setTotalCount(count);

      setItems((prev) => {
        const merged = reset ? page : [...prev, ...page];
        // dédoublonnage par id (au cas où)
        const seen = new Set();
        const out = [];
        for (const n of merged) {
          const id = String(n?.id || '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          out.push(n);
        }
        recomputeUnread(out);
        return out;
      });

      // Toast "nouvelles notifs" (uniquement après 1er fetch + quand dropdown fermé)
      if (hasFetchedRef.current && !openRef.current) {
        let delta = 0;
        const known = knownIdsRef.current;

        for (const n of page) {
          const id = String(n?.id || '');
          if (!id) continue;
          if (!known.has(id) && !n?.is_read) delta += 1;
        }

        if (delta > 0) {
          pushToast({
            title: 'Nouvelle notification',
            message: `🔔 ${delta} nouvelle(s) notification(s)`,
            severity: 'info',
          });
        }
      }

      // mettre à jour known ids
      {
        const known = knownIdsRef.current;
        for (const n of page) {
          const id = String(n?.id || '');
          if (id) known.add(id);
        }
      }

      hasFetchedRef.current = true;
      setOffset(nextOffset + page.length);
    } catch (e) {
      console.error('Notifications: fetch failed', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function markIdsAsRead(ids) {
    if (!token) return;
    const clean = (ids || []).map(String).map((s) => s.trim()).filter(Boolean);
    if (clean.length === 0) return;

    try {
      await apiFetch('/api/notifications/read-all', {
        token,
        method: 'POST',
        body: { ids: clean },
      });

      // update local state
      setItems((prev) => {
        const next = prev.map((n) => (clean.includes(String(n.id)) ? { ...n, is_read: true } : n));
        recomputeUnread(next);
        return next;
      });
    } catch (e) {
      console.error('Notifications: read-all failed', e);
    }
  }

  async function markOneAsRead(id) {
    if (!token) return;
    const nid = String(id || '').trim();
    if (!nid) return;

    try {
      await apiFetch(`/api/notifications/${encodeURIComponent(nid)}/read`, {
        token,
        method: 'POST',
      });

      setItems((prev) => {
        const next = prev.map((n) => (String(n.id) === nid ? { ...n, is_read: true } : n));
        recomputeUnread(next);
        return next;
      });
    } catch (e) {
      console.error('Notifications: read-one failed', e);
    }
  }

  function handleClickNotif(n) {
    const id = String(n?.id || '').trim();

    setOpen(false);
    if (id && !n?.is_read) markOneAsRead(id);

    if (n?.link) navigate(n.link);
  }

  // Init / Poll
  useEffect(() => {
    if (!token) {
      setOpen(false);
      setItems([]);
      setUnread(0);
      setOffset(0);
      setTotalCount(0);
      knownIdsRef.current = new Set();
      hasFetchedRef.current = false;
      return;
    }

    // 1er fetch
    setOffset(0);
    fetchPage({ reset: true });

    // Polling (plus soft)
    const interval = setInterval(() => {
      // on refresh la page 1 (reset) pour récupérer les nouvelles notifs
      fetchPage({ reset: true });
    }, 15000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // close on outside click
  useEffect(() => {
    const onDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // À l'ouverture : on charge page 1 + (option) on considère "vu = lu"
  async function openDropdown() {
    setOpen(true);
    setOffset(0);
    await fetchPage({ reset: true });

    // ✅ Option "pro" que tu aimais déjà : ouvrir = vu => on marque la page chargée comme lue
    // (si tu veux enlever ce comportement, supprime juste ce bloc)
    const unreadIds = (items || []).filter((x) => x && !x.is_read).map((x) => x.id);
    if (unreadIds.length > 0) {
      markIdsAsRead(unreadIds);
    }
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
          type="button"
          className="iconBtn"
          onClick={() => {
            const next = !open;
            if (next) openDropdown();
            else setOpen(false);
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
                boxShadow: '0 0 0 2px var(--surface)',
              }}
            />
          )}
        </button>

        {open && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              right: 0,
              top: 48,
              width: 380,
              maxWidth: '92vw',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              boxShadow: 'var(--shadow)',
              overflow: 'hidden',
              zIndex: 9999,
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 13, color: 'var(--text)' }}>
                Notifications
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {unread > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const unreadIds = items.filter((x) => x && !x.is_read).map((x) => x.id);
                      markIdsAsRead(unreadIds);
                    }}
                  >
                    Tout marquer lu
                  </button>
                )}
                <div className="badge badge-info">{unread} non lue(s)</div>
              </div>
            </div>

            {/* Body */}
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {loading && items.length === 0 ? (
                <div style={{ padding: 14, color: 'var(--muted)' }}>Chargement...</div>
              ) : items.length === 0 ? (
                <div style={{ padding: 14, color: 'var(--muted)' }}>Rien pour le moment.</div>
              ) : (
                items.map((n) => {
                  const isUnread = !n?.is_read;

                  return (
                    <button
                      type="button"
                      key={n.id}
                      onClick={() => handleClickNotif(n)}
                      style={{
                        width: '100%',
                        background: isUnread ? 'rgba(59,130,246,.08)' : 'transparent',
                        color: 'var(--text)',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        textAlign: 'left',
                        padding: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                        <div style={{ width: 10, display: 'flex', justifyContent: 'center', paddingTop: 4 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 99,
                              background: severityToDot(n.severity),
                              boxShadow: isUnread ? '0 0 0 3px rgba(59,130,246,.10)' : 'none',
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
                              color: 'var(--text)',
                            }}
                            title={n.title}
                          >
                            {n.title}
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--muted)',
                              marginBottom: 6,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={n.message}
                          >
                            {n.message}
                          </div>

                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {formatTimestamp(n.timestamp)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}

              {/* Footer: Voir plus */}
              {items.length > 0 && (
                <div style={{ padding: 10, display: 'flex', justifyContent: 'center' }}>
                  {hasMore ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={loadingMore}
                      onClick={() => fetchPage({ reset: false })}
                    >
                      {loadingMore ? 'Chargement...' : 'Voir plus'}
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Fin des notifications</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
