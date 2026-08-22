const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function getApiUrl() {
  return API_URL;
}

export function getCsrfToken() {
  if (typeof document === 'undefined') return '';
  const prefix = 'csrf_token=';
  const item = document.cookie.split('; ').find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}

function notifyUnauthorized(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent('prirtem:unauthorized', { detail }));
  } catch {
    // ignore (SSR / older browsers)
  }
}

async function parseResponse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (e) {
    return { raw: text, error: 'INVALID_JSON_RESPONSE' };
  }
}

const FIELD_LABELS = {
  first_name: 'Prénom',
  last_name: 'Nom',
  username: 'Identifiant',
  email: 'Email',
  role: 'Rôle',
  password: 'Mot de passe',
  permissions: 'Permissions',
  is_active: 'Compte actif',
  is_blocked: 'Compte bloqué'
};

const API_ERROR_MESSAGES = {
  INVALID_CREDENTIALS: 'Identifiant ou mot de passe incorrect.',
  UNAUTHORIZED: 'Votre session a expiré. Veuillez vous reconnecter.',
  FORBIDDEN: "Vous n'avez pas l'autorisation d'effectuer cette action.",
  FORBIDDEN_PERM: "Votre compte ne possède pas la permission nécessaire.",
  CSRF_TOKEN_INVALID: 'La session de sécurité a expiré. Rechargez la page.',
  INVALID_OR_EXPIRED_TOKEN: 'Ce lien est invalide ou a expiré.',
  INTERNAL_ERROR: 'Le serveur a rencontré une erreur interne.'
};

export function getApiErrorMessage(data, fallback) {
  const fieldErrors = data?.details?.fieldErrors;
  if (fieldErrors && typeof fieldErrors === 'object') {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      const firstMessage = Array.isArray(messages) ? messages.find(Boolean) : null;
      if (firstMessage) return `${FIELD_LABELS[field] || field} : ${firstMessage}`;
    }
  }

  const formError = Array.isArray(data?.details?.formErrors)
    ? data.details.formErrors.find(Boolean)
    : null;
  const code = data?.error;
  return formError || data?.message || API_ERROR_MESSAGES[code] || code || fallback;
}

function shouldInvalidateSession(path) {
  // A 401 during login/forgot/reset is a form error, not proof that the
  // current browser session became invalid. Invalidating it here used to log
  // another open tab out after a mistyped login.
  return !String(path).startsWith('/api/auth/');
}

/**
 * Petit helper : attend N ms
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function apiFetch(path, {
  method = 'GET',
  body,
  headers,
  retries,
  timeoutMs = 15_000
} = {}) {
  const normalizedMethod = method.toUpperCase();
  const maxRetries = retries ?? (['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod) ? 2 : 0);
  const h = {
    'Content-Type': 'application/json',
    ...(headers || {})
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) h['X-CSRF-Token'] = csrfToken;
  }

  const config = {
    method: normalizedMethod,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include'
  };

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(`${API_URL}${path}`, { ...config, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      const data = await parseResponse(res);

      if (!res.ok) {
        const msg = getApiErrorMessage(data, `Erreur HTTP ${res.status}`);
        const err = new Error(msg);
        err.status = res.status;
        err.payload = data;

        if (res.status === 401 && shouldInvalidateSession(path)) {
          notifyUnauthorized({ path, status: 401, error: data?.error || data?.message || msg });
        }

        throw err;
      }

      return data;
    } catch (err) {
      const normalizedError = err?.name === 'AbortError'
        ? Object.assign(
            new Error("Le serveur API ne répond pas. Démarrez-le puis réessayez."),
            { code: 'REQUEST_TIMEOUT' }
          )
        : err;
      lastError = normalizedError;

      // Si c'est une erreur réseau (serveur down/restart) ET qu'il reste des retries
      const isNetworkError = !normalizedError.status && normalizedError.code !== 'REQUEST_TIMEOUT' && (
        normalizedError.message?.includes('Failed to fetch') ||
        normalizedError.message?.includes('NetworkError') ||
        normalizedError.message?.includes('ERR_CONNECTION_REFUSED') ||
        normalizedError.message?.includes('Impossible de joindre')
      );

      if (isNetworkError && attempt < maxRetries) {
        // Backoff exponentiel : 1s, 2s, 4s, 8s, ...
        await wait(1000 * (2 ** attempt));
        continue;
      }

      // Si c'est une erreur HTTP (401, 403...) on ne retry pas
      throw normalizedError;
    }
  }

  throw lastError;
}

export async function apiUpload(path, { formData, method = 'POST' }) {
  const headers = {};

  const csrfToken = getCsrfToken();
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData,
      credentials: 'include'
    });
  } catch (networkErr) {
    throw new Error("Erreur réseau lors de l'upload.");
  }

  const data = await parseResponse(res);

  if (!res.ok) {
    const msg = getApiErrorMessage(data, `Upload échoué (${res.status})`);
    const err = new Error(msg);
    err.status = res.status;
    err.payload = data;

    if (res.status === 401) {
      notifyUnauthorized({ path, status: 401, error: data?.error || data?.message || msg });
    }

    throw err;
  }

  return data;
}
