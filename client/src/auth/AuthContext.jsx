import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../utils/api.js';

const AuthContext = createContext(null);

const LS_KEY = 'prirtem_auth';

function normalizeToken(token) {
  if (!token) return null;
  if (typeof token !== 'string') return null;
  const t = token.trim();
  if (!t) return null;
  if (t === 'undefined' || t === 'null') return null;
  return t;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  // loading = "auth state not yet validated"
  const [loading, setLoading] = useState(true);

  const hydratedRef = useRef(false);

  const persist = useCallback((tokenNew, userNew) => {
    if (!tokenNew) {
      localStorage.removeItem(LS_KEY);
      return;
    }
    localStorage.setItem(LS_KEY, JSON.stringify({ token: tokenNew, user: userNew || null }));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  // Hydrate from localStorage once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const t = normalizeToken(parsed?.token);
        if (t) {
          setToken(t);
          if (parsed?.user) setUser(parsed.user);
          // keep loading=true until /me validates
        } else {
          // garbage token in storage -> clear
          localStorage.removeItem(LS_KEY);
          setToken(null);
          setUser(null);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch {
      // ignore parsing errors
      setLoading(false);
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  // Global "401 unauthorized" hook emitted by apiFetch/apiUpload
  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('prirtem:unauthorized', onUnauthorized);
    return () => window.removeEventListener('prirtem:unauthorized', onUnauthorized);
  }, [logout]);

  // Validate token => /me (prevents pages from firing tons of 401 on refresh)
  useEffect(() => {
    if (!hydratedRef.current) return;

    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    apiFetch('/api/auth/me', { token })
      .then((d) => {
        if (cancelled) return;
        if (d?.user) {
          setUser(d.user);
          persist(token, d.user);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Token expired/invalid -> logout (and stop the app from spamming 401)
        if (err?.status === 401) {
          logout();
          return;
        }
        // other errors: keep session but unblock UI
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, logout, persist]);

  const login = useCallback((tokenNew, userNew) => {
    const t = normalizeToken(tokenNew);
    if (!t) {
      // avoid storing an invalid token (prevents "Bearer undefined")
      logout();
      return;
    }
    setToken(t);
    setUser(userNew || null);
    persist(t, userNew || null);
    // loading will be handled by /me validation effect
  }, [logout, persist]);

  const value = useMemo(() => {
    return {
      token,
      user,
      loading,
      isAuthed: !!token && !!user,
      login,
      // Backward-compat: older pages call setSession(token,user)
      setSession: login,
      logout
    };
  }, [token, user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
