import React, { useEffect, useRef } from 'react';

export default function Modal({ title, children, onClose, width = 720 }) {
  const closeBtnRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // keep latest onClose without re-running mount effects
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // ESC handler (mounted once)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Autofocus (mounted once) — prevents "déconnexion du champ" à chaque frappe
  useEffect(() => {
    const root = closeBtnRef.current?.closest?.('.modal');
    const target =
      root?.querySelector?.('[data-autofocus="true"]') ||
      root?.querySelector?.('input, textarea, select, button');
    (target || closeBtnRef.current)?.focus?.();
  }, []);

  return (
    <div className="modalOverlay" onMouseDown={() => onCloseRef.current?.()} role="presentation">
      <div
        className="modal"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button
            ref={closeBtnRef}
            className="btn btn-outline btn-sm"
            onClick={() => onCloseRef.current?.()}
            aria-label="Fermer"
          >
            Fermer
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}
