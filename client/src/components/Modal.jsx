import React, { useEffect, useId, useRef } from 'react';

export default function Modal({ title, children, onClose, width = 720 }) {
  const closeBtnRef = useRef(null);
  const modalRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  // keep latest onClose without re-running mount effects
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // ESC handler (mounted once)
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = Array.from(modalRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      ) || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  // Autofocus (mounted once) — prevents "déconnexion du champ" à chaque frappe
  useEffect(() => {
    const root = modalRef.current;
    const target =
      root?.querySelector?.('[data-autofocus="true"]') ||
      root?.querySelector?.('input, textarea, select, button');
    (target || closeBtnRef.current)?.focus?.();
  }, []);

  return (
    <div className="modalOverlay" onMouseDown={() => onCloseRef.current?.()} role="presentation">
      <div
        ref={modalRef}
        className="modal"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitle" id={titleId}>{title}</div>
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
