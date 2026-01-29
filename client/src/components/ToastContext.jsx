import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: '12px'
      }}>
        {toasts.map((t) => (
          <div key={t.id} onClick={() => removeToast(t.id)} style={{
            minWidth: '300px',
            padding: '16px 20px',
            borderRadius: '12px',
            background: 'white',
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
            borderLeft: `6px solid ${
              t.type === 'success' ? '#10b981' : 
              t.type === 'error' ? '#ef4444' : 
              '#3b82f6'
            }`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            animation: 'slideInRight 0.3s ease-out',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            color: '#1e293b'
          }}>
            <span>{t.message}</span>
            <span style={{ marginLeft: '12px', opacity: 0.5 }}>✕</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}