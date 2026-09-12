import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../utils/api.js';

const PAGE_SIZE = 20;

export default function useFuelRequests({ token, status = '' }) {
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState({ page: 1, query: '' });
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 0 });
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSelection((current) => current.query === query.trim()
        ? current
        : { page: 1, query: query.trim() });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    // Each request belongs to one selection. A slow response must never replace
    // a newer search/page, nor update state after leaving this screen.
    let active = true;
    if (!token) {
      setRows([]);
      setPagination({ page: 1, limit: PAGE_SIZE, total: 0, pages: 0 });
      setFetching(false);
      setError(null);
      return () => { active = false; };
    }

    setFetching(true);
    setError(null);
    const params = new URLSearchParams({ page: String(selection.page), limit: String(PAGE_SIZE) });
    if (status) params.set('status', status);
    if (selection.query) params.set('q', selection.query);

    apiFetch(`/api/requests/fuel?${params}`, { token }).then((data) => {
      if (!active) return;
      const total = Math.max(0, Number(data?.pagination?.total) || 0);
      const pages = Math.ceil(total / PAGE_SIZE);
      const lastPage = Math.max(1, pages);
      if (selection.page > lastPage) {
        // A deletion or validation may remove the final row on the last page.
        setSelection((current) => ({ ...current, page: lastPage }));
        return;
      }
      setRows(Array.isArray(data?.requests) ? data.requests : []);
      setPagination({ page: selection.page, limit: PAGE_SIZE, total, pages });
      setFetching(false);
    }).catch((err) => {
      if (!active) return;
      setRows([]);
      setError(err?.message || 'Impossible de charger les demandes.');
      setFetching(false);
    });

    return () => { active = false; };
  }, [token, status, selection, revision]);

  const setPage = useCallback((page) => {
    setSelection((current) => ({ ...current, page: Math.max(1, page) }));
  }, []);

  const reload = useCallback(({ firstPage = false } = {}) => {
    if (firstPage) setSelection((current) => ({ ...current, page: 1 }));
    setRevision((current) => current + 1);
  }, []);

  return {
    rows,
    pagination: { ...pagination, page: selection.page },
    loading: fetching || query.trim() !== selection.query,
    error,
    query,
    setQuery,
    setPage,
    reload,
  };
}
