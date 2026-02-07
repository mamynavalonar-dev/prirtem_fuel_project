const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function getApiUrl() {
  return API_URL;
}

async function parseResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (e) {
    return { raw: text, error: 'INVALID_JSON_RESPONSE' };
  }
}

/**
 * Petit helper : attend N ms
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function apiFetch(path, { token, method = 'GET', body, headers, retries = 2 } = {}) {
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

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API_URL}${path}`, config);
      const data = await parseResponse(res);

      if (!res.ok) {
        const msg = data?.message || data?.error || `Erreur HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.payload = data;
        throw err;
      }

      return data;
    } catch (err) {
      lastError = err;
      // Si c'est une erreur réseau (serveur down/restart) ET qu'il reste des retries
      const isNetworkError = !err.status && (
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('NetworkError') ||
        err.message?.includes('ERR_CONNECTION_REFUSED') ||
        err.message?.includes('Impossible de joindre')
      );
      if (isNetworkError && attempt < retries) {
        await wait(1000 * (attempt + 1)); // 1s, puis 2s
        continue;
      }
      // Si c'est une erreur HTTP (401, 403...) on ne retry pas
      throw err;
    }
  }

  throw lastError;
}

export async function apiUpload(path, { token, formData, method = 'POST' }) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData
    });
  } catch (networkErr) {
    throw new Error("Erreur réseau lors de l'upload.");
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
