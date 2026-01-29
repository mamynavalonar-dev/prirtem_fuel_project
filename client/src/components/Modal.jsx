import React, { useEffect, useRef } from 'react';

export default function Modal({ title, children, onClose, width = 720 }) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    // focus close btn by default
    closeBtnRef.current?.focus?.();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="modalOverlay" onMouseDown={onClose} role="presentation">
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
          <button ref={closeBtnRef} className="btn btn-outline btn-sm" onClick={onClose} aria-label="Fermer">
            Fermer
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}
