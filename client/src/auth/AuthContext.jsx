import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api.js';

const AuthContext = createContext(null);

const LS_KEY = 'prirtem_auth';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.token) setToken(parsed.token);
        if (parsed?.user) setUser(parsed.user);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    // refresh me (best effort)
    apiFetch('/api/auth/me', { token })
      .then((d) => {
        if (d?.user) {
          setUser(d.user);
          localStorage.setItem(LS_KEY, JSON.stringify({ token, user: d.user }));
        }
      })
      .catch((err) => {
        // Token may be expired or invalid (e.g. after DB reset / JWT_SECRET change)
        if (err?.status === 401) {
          setToken(null);
          setUser(null);
          localStorage.removeItem(LS_KEY);
        }
      });
  }, [token]);

  const value = useMemo(() => {
    return {
      token,
      user,
      loading,
      isAuthed: !!token,
      login: (tokenNew, userNew) => {
        setToken(tokenNew);
        setUser(userNew);
        localStorage.setItem(LS_KEY, JSON.stringify({ token: tokenNew, user: userNew }));
      },
      // Backward-compat: older pages call setSession(token,user)
      setSession: (tokenNew, userNew) => {
        setToken(tokenNew);
        setUser(userNew);
        localStorage.setItem(LS_KEY, JSON.stringify({ token: tokenNew, user: userNew }));
      },
      logout: () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem(LS_KEY);
      }
    };
  }, [token, user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
