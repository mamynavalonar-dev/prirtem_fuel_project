/**
 * ────────────────── client/src/utils/api.js ──────────────────
 * CORRECTIF APPLIQUÉ : Gestion robuste du parsing JSON et des erreurs HTTP.
 */
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function getApiUrl() {
  return API_URL;
}

/**
 * Helper interne pour parser la réponse
 */
async function parseResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (e) {
    // Si ce n'est pas du JSON, on renvoie le texte brut (utile pour debug 500/502)
    return { raw: text, error: 'INVALID_JSON_RESPONSE' };
  }
}

export async function apiFetch(path, { token, method = 'GET', body, headers } = {}) {
  const h = {
    'Content-Type': 'application/json',
    ...(headers || {})
  };

  if (token) {
    h.Authorization = `Bearer ${token}`;
  }

  const config = {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined
  };

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, config);
  } catch (networkErr) {
    // Erreur réseau (serveur éteint, pas d'internet)
    throw new Error('Erreur réseau : Impossible de joindre le serveur.');
  }

  const data = await parseResponse(res);

  if (!res.ok) {
    // On construit une erreur propre
    const msg = data?.message || data?.error || `Erreur HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

export async function apiUpload(path, { token, formData, method = 'POST' }) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Note: Ne PAS mettre 'Content-Type': 'multipart/form-data', 
  // le navigateur le fait automatiquement avec le boundary.

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData
    });
  } catch (networkErr) {
    throw new Error('Erreur réseau lors de l\'upload.');
  }

  const data = await parseResponse(res);

  if (!res.ok) {
    const msg = data?.message || data?.error || `Upload échoué (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}