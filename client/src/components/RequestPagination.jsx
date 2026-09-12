import React from 'react';
import './RequestPagination.css';

export default function RequestPagination({ pagination, loading, error, onPageChange }) {
  const { page, limit, total, pages } = pagination;
  const first = total ? (page - 1) * limit + 1 : 0;
  const last = Math.min(page * limit, total);

  return (
    <nav className="requestPagination" aria-label="Pagination des demandes de carburant" aria-busy={loading}>
      <span className="requestPaginationCount" aria-live="polite" aria-atomic="true">
        {loading ? 'Chargement des demandes…' : error ? 'Nombre de demandes indisponible' : `${first}–${last} sur ${total} demande${total > 1 ? 's' : ''}`}
      </span>
      <div className="requestPaginationControls">
        <button type="button" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>
          Précédent
        </button>
        <span>Page {page}{!error && ` sur ${Math.max(1, pages)}`}</span>
        <button type="button" disabled={loading || page >= pages} onClick={() => onPageChange(page + 1)}>
          Suivant
        </button>
      </div>
    </nav>
  );
}
