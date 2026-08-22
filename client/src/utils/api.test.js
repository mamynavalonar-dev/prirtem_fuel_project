import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, getApiErrorMessage, getCsrfToken } from './api.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.CustomEvent;
});

describe('apiFetch', () => {
  it('shows the first detailed validation error returned by the API', () => {
    expect(getApiErrorMessage({
      error: 'VALIDATION',
      details: {
        fieldErrors: {
          password: ['Doit contenir au moins une lettre majuscule']
        },
        formErrors: []
      }
    }, 'Erreur HTTP 400')).toBe(
      'Mot de passe : Doit contenir au moins une lettre majuscule'
    );
  });

  it('translates invalid credentials instead of exposing an internal code', () => {
    expect(getApiErrorMessage({ error: 'INVALID_CREDENTIALS' }, 'Erreur HTTP 401'))
      .toBe('Identifiant ou mot de passe incorrect.');
  });

  it('sends cookies and the CSRF token on mutations', async () => {
    globalThis.document = { cookie: 'theme=dark; csrf_token=csrf-value' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true })
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/api/example', { method: 'POST', body: { value: 1 } });

    expect(getCsrfToken()).toBe('csrf-value');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-value' })
    });
  });

  it('does not retry a non-idempotent request after a network error', async () => {
    globalThis.document = { cookie: '' };
    const fetchMock = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/api/example', { method: 'POST', body: { value: 1 } }))
      .rejects.toThrow('Failed to fetch');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate an existing session after rejected login credentials', async () => {
    globalThis.document = { cookie: '' };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    };
    const dispatchEvent = vi.fn();
    globalThis.window = { dispatchEvent };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'INVALID_CREDENTIALS' })
    }));

    await expect(apiFetch('/api/auth/login', {
      method: 'POST',
      body: { username: 'wrong', password: 'wrong' }
    })).rejects.toThrow('Identifiant ou mot de passe incorrect.');
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
