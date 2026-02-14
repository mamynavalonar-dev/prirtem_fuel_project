import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

function typeDefaults(type) {
  switch (type) {
    case "success":
      return { title: "Succès", duration: 3500 };
    case "error":
      return { title: "Erreur", duration: 6500 };
    case "warning":
      return { title: "Attention", duration: 5000 };
    case "loading":
      return { title: "Chargement", duration: 5000 };
    default:
      return { title: "Info", duration: 4200 };
  }
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const tm = timersRef.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message, type = "info", options = {}) => {
      const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const def = typeDefaults(type);

      const toast = {
        id,
        type,
        title: options.title ?? def.title,
        message: String(message ?? ""),
        duration: Number.isFinite(options.duration) ? options.duration : def.duration,
        createdAt: Date.now(),
      };

      setToasts((prev) => [...prev, toast]);

      const tm = setTimeout(() => removeToast(id), toast.duration);
      timersRef.current.set(id, tm);

      return id;
    },
    [removeToast]
  );

  const value = useMemo(() => ({ addToast, removeToast }), [addToast, removeToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* HOST */}
      <div className="toastHost" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            style={{ ["--toast-ms"]: `${t.duration}ms` }}
            role="status"
          >
            <div className="toastRow">
              {t.type === "loading" ? <span className="toastSpinner" /> : <span className="toastDot" />}
              <div className="toastBody">
                <div className="toastTitle">{t.title}</div>
                <div className="toastMsg">{t.message}</div>
              </div>

              <button className="toastClose" onClick={() => removeToast(t.id)} aria-label="Fermer">
                ×
              </button>
            </div>

            {/* Loader / durée (bien visible) */}
            <div className="toastBar" aria-hidden="true">
              <span />
            </div>
          </div>
        ))}
      </div>

      {/* STYLES (override solide, lisible dark/light) */}
      <style>{`
        .toastHost{
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 100000;
          display: flex;
          flex-direction: column;
          gap: 12px;
          pointer-events: none;
        }

        @media (max-width: 700px){
          .toastHost{
            left: 12px;
            right: 12px;
            bottom: 12px;
          }
        }

        /* base theme tokens */
        :root{
          --toast-bg: rgba(255,255,255,.92);
          --toast-fg: #0f172a;
          --toast-muted: rgba(15,23,42,.78);
          --toast-border: rgba(15,23,42,.14);
          --toast-shadow: 0 18px 55px rgba(15,23,42,.16);
          --toast-bar-bg: rgba(15,23,42,.14);
        }

        html[data-theme="dark"]{
          --toast-bg: rgba(11,18,32,.92);
          --toast-fg: rgba(255,255,255,.95);
          --toast-muted: rgba(255,255,255,.78);
          --toast-border: rgba(255,255,255,.14);
          --toast-shadow: 0 22px 70px rgba(0,0,0,.45);
          --toast-bar-bg: rgba(255,255,255,.18);
        }

        .toast{
          pointer-events: auto;
          width: min(520px, 92vw);
          background: var(--toast-bg);
          color: var(--toast-fg);
          border: 1px solid var(--toast-border);
          border-radius: 16px;
          padding: 14px 14px 12px;
          box-shadow: var(--toast-shadow);
          backdrop-filter: blur(10px);
          animation: toastIn .18s ease-out;
        }

        @keyframes toastIn{
          from{ transform: translateY(10px); opacity: 0; }
          to{ transform: translateY(0); opacity: 1; }
        }

        .toastRow{
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .toastBody{ flex: 1; min-width: 0; }

        /* 👇 police + visibilité (ton problème) */
        .toastTitle{
          font-weight: 900;
          font-size: 13.5px;
          letter-spacing: .2px;
          line-height: 1.1;
        }
        .toastMsg{
          margin-top: 3px;
          font-weight: 700;
          font-size: 13px;
          color: var(--toast-muted);
          line-height: 1.25;
          word-break: break-word;
        }

        .toastClose{
          border: 1px solid var(--toast-border);
          background: transparent;
          color: var(--toast-fg);
          width: 34px;
          height: 34px;
          border-radius: 12px;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          opacity: .85;
          transition: transform .08s ease, opacity .15s ease, background .15s ease;
        }
        .toastClose:hover{ opacity: 1; background: rgba(255,255,255,.06); }
        .toastClose:active{ transform: translateY(1px); }

        /* dot color by type */
        .toastDot{
          width: 12px;
          height: 12px;
          border-radius: 999px;
          margin-top: 4px;
          flex: 0 0 auto;
          background: #60a5fa;
          box-shadow: 0 0 0 4px rgba(96,165,250,.18);
        }
        .toast-success .toastDot{ background: #22c55e; box-shadow: 0 0 0 4px rgba(34,197,94,.18); }
        .toast-error   .toastDot{ background: #ef4444; box-shadow: 0 0 0 4px rgba(239,68,68,.18); }
        .toast-warning .toastDot{ background: #f59e0b; box-shadow: 0 0 0 4px rgba(245,158,11,.18); }

        /* spinner (type=loading) */
        .toastSpinner{
          width: 16px;
          height: 16px;
          margin-top: 2px;
          border-radius: 999px;
          border: 2px solid var(--toast-bar-bg);
          border-top-color: #60a5fa;
          animation: spin .7s linear infinite;
          flex: 0 0 auto;
        }
        @keyframes spin{ to{ transform: rotate(360deg); } }

        /* ✅ loader / durée (ton “petit chargement”) */
        .toastBar{
          margin-top: 10px;
          height: 4px;
          border-radius: 999px;
          background: var(--toast-bar-bg);
          overflow: hidden;
        }
        .toastBar > span{
          display: block;
          height: 100%;
          width: 100%;
          transform-origin: left center;
          animation: toastBar linear forwards;
          animation-duration: var(--toast-ms, 4000ms);
          background: #60a5fa;
        }
        .toast-success .toastBar > span{ background: #22c55e; }
        .toast-error   .toastBar > span{ background: #ef4444; }
        .toast-warning .toastBar > span{ background: #f59e0b; }
        .toast-loading .toastBar > span{ background: #60a5fa; }

        @keyframes toastBar{
          from{ transform: scaleX(1); }
          to{ transform: scaleX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
