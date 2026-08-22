import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../utils/api.js';

const AuthContext = createContext(null);
const SESSION_MARKER = 'http-only-cookie';
const AUTH_CHANNEL_NAME = 'prirtem-auth';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const broadcast = useCallback((type) => {
    channelRef.current?.postMessage({ type, at: Date.now() });
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', retries: 0 });
    } catch {
      // The local state must still be cleared if the server is unavailable.
    }
    clearSession();
    localStorage.removeItem('rememberLogin');
    localStorage.removeItem('savedUsername');
    localStorage.removeItem('prirtem_auth');
    broadcast('SESSION_CLEARED');
  }, [broadcast, clearSession]);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/auth/me', { retries: 0, timeoutMs: 5_000 })
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        setToken(SESSION_MARKER);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });
    return () => { cancelled = true; };
  }, [clearSession]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const channel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event) => {
      if (event.data?.type === 'SESSION_CLEARED') {
        clearSession();
        return;
      }
      if (event.data?.type !== 'SESSION_CHANGED') return;

      apiFetch('/api/auth/me', { retries: 0, timeoutMs: 5_000 })
        .then((data) => {
          setUser(data.user);
          setToken(SESSION_MARKER);
          setLoading(false);
        })
        .catch(clearSession);
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [clearSession]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearSession();
      broadcast('SESSION_CLEARED');
    };
    window.addEventListener('prirtem:unauthorized', onUnauthorized);
    return () => window.removeEventListener('prirtem:unauthorized', onUnauthorized);
  }, [broadcast, clearSession]);

  const login = useCallback((userNew) => {
    setUser(userNew || null);
    setToken(userNew ? SESSION_MARKER : null);
    setLoading(false);
    if (userNew) broadcast('SESSION_CHANGED');
  }, [broadcast]);

  const value = useMemo(() => ({
    token,
    user,
    loading,
    isAuthed: Boolean(user),
    login,
    setSession: (_ignoredToken, userNew) => login(userNew),
    logout
  }), [token, user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
