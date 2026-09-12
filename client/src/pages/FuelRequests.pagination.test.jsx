import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ token: 'session', user: { role: 'DEMANDEUR' } }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../utils/api.js', () => ({ apiFetch: vi.fn() }));
vi.mock('../components/Modal.jsx', () => ({
  default: ({ children }) => <div role="dialog">{children}</div>,
}));

import { apiFetch } from '../utils/api.js';
import FuelRequests from './FuelRequests.jsx';
import FuelRequestsManage from './FuelRequestsManage.jsx';
import FuelRequestsRaf from './FuelRequestsRaf.jsx';

function request(id) {
  return {
    id,
    request_no: `CARB-${id}`,
    request_date: '2026-09-11',
    request_type: 'MISSION',
    objet: id === 61 ? 'Ancienne mission unique' : `Mission ${id}`,
    status: 'SUBMITTED',
    requester_name: 'Demandeur',
    amount_estimated_ar: 10000,
  };
}

function listResponse(path, rows) {
  const params = new URL(path, 'http://localhost').searchParams;
  const page = Number(params.get('page'));
  const limit = Number(params.get('limit'));
  const q = params.get('q')?.toLowerCase();
  const matches = q ? rows.filter((row) => row.objet.toLowerCase().includes(q)) : rows;
  return {
    requests: matches.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total: matches.length, pages: Math.ceil(matches.length / limit) },
  };
}

describe('Fuel request pagination', () => {
  let renderer;
  let rows;

  const button = (label) => renderer.root.findAllByType('button')
    .find((node) => node.children.join('') === label);
  const rendered = () => JSON.stringify(renderer.toJSON());
  const listCalls = () => apiFetch.mock.calls.filter(([path]) => path.startsWith('/api/requests/fuel?'));
  const mount = async (Component = FuelRequests) => {
    await act(async () => { renderer = TestRenderer.create(<Component />); });
  };
  const click = async (label) => {
    await act(async () => { await button(label).props.onClick(); });
  };
  const search = async (value) => {
    await act(async () => {
      renderer.root.findByProps({ 'aria-label': 'Rechercher les demandes de carburant' })
        .props.onChange({ target: { value } });
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('window', { confirm: vi.fn(() => true) });
    auth.user = { role: 'DEMANDEUR' };
    rows = Array.from({ length: 65 }, (_, index) => request(index + 1));
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (path) => listResponse(path, rows));
  });

  afterEach(() => {
    if (renderer) act(() => renderer.unmount());
    renderer = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('loads a second page from the API and exposes the total and navigation boundaries', async () => {
    await mount();
    expect(rendered()).toContain('1–20 sur 65 demandes');
    expect(button('Précédent').props.disabled).toBe(true);
    expect(renderer.root.findByType('tbody').findAllByType('tr')).toHaveLength(20);

    await click('Suivant');
    expect(listCalls()[1][0]).toBe('/api/requests/fuel?page=2&limit=20');
    expect(rendered()).toContain('CARB-21');
    expect(rendered()).toContain('21–40 sur 65 demandes');
    expect(button('Précédent').props.disabled).toBe(false);

    await click('Précédent');
    expect(rendered()).toContain('1–20 sur 65 demandes');
  });

  it('searches beyond the first 50 requests and resets the page after a short debounce', async () => {
    await mount();
    await click('Suivant');
    await search('Ancienne mission');
    expect(button('Suivant').props.disabled).toBe(true);
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(listCalls()).toHaveLength(2);
    await act(async () => { vi.advanceTimersByTime(1); });

    expect(listCalls()[2][0]).toBe('/api/requests/fuel?page=1&limit=20&q=Ancienne+mission');
    expect(rendered()).toContain('CARB-61');
    expect(rendered()).toContain('1–1 sur 1 demande');
    expect(button('Suivant').props.disabled).toBe(true);
    expect(button('Précédent').props.disabled).toBe(true);
  });

  it('keeps a newer search result when the previous request responds late', async () => {
    await mount();
    let resolveOld;
    let resolveNew;
    apiFetch.mockImplementation((path) => new Promise((resolve) => {
      if (path.includes('q=ancienne')) resolveOld = resolve;
      else resolveNew = resolve;
    }));

    await search('ancienne');
    await act(async () => { vi.advanceTimersByTime(300); });
    await search('unique');
    await act(async () => { vi.advanceTimersByTime(300); });

    await act(async () => {
      resolveNew({ requests: [request(61)], pagination: { page: 1, limit: 20, total: 1, pages: 1 } });
    });
    expect(rendered()).toContain('CARB-61');
    await act(async () => {
      resolveOld({ requests: [request(1)], pagination: { page: 1, limit: 20, total: 1, pages: 1 } });
    });
    expect(rendered()).toContain('CARB-61');
    expect(rendered()).not.toContain('CARB-1"');
  });

  it('shows a failed load with a retry instead of claiming that the list is empty', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Service indisponible'));
    await mount();
    expect(renderer.root.findByProps({ role: 'alert' }).children).toContain('Service indisponible');
    expect(rendered()).not.toContain('Aucune demande');
    expect(rendered()).toContain('Nombre de demandes indisponible');
    await click('Réessayer');
    expect(rendered()).toContain('1–20 sur 65 demandes');
  });

  it('allows returning to the previous page when the next page fails to load', async () => {
    await mount();
    apiFetch.mockRejectedValueOnce(new Error('Service indisponible'));
    await click('Suivant');
    expect(button('Précédent').props.disabled).toBe(false);
    await click('Précédent');
    expect(listCalls().at(-1)[0]).toBe('/api/requests/fuel?page=1&limit=20');
    expect(rendered()).toContain('1–20 sur 65 demandes');
  });

  it('creates a request with an initialized end date and reloads the first page', async () => {
    apiFetch.mockImplementation(async (path, options) => {
      if (options?.method === 'POST') return { request: request(66) };
      return listResponse(path, rows);
    });
    await mount();
    await click('Suivant');
    await click('+ Nouvelle demande');
    const date = renderer.root.findByProps({ id: 'fuel-request-date' }).props.value;
    expect(renderer.root.findByProps({ id: 'fuel-end-date' }).props.value).toBe(date);
    await act(async () => {
      renderer.root.findByProps({ id: 'fuel-objet' }).props.onChange({ target: { value: 'Nouvelle mission' } });
      renderer.root.findByProps({ id: 'fuel-amount' }).props.onChange({ target: { value: '50000' } });
    });
    await act(async () => {
      await renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() });
    });
    const createCall = apiFetch.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(createCall[1].body).toMatchObject({ request_date: date, end_date: date, objet: 'Nouvelle mission', amount_estimated_ar: 50000 });
    expect(listCalls().at(-1)[0]).toBe('/api/requests/fuel?page=1&limit=20');
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
    expect(globalThis.alert).not.toHaveBeenCalled();
  });

  it.each([
    [FuelRequestsManage, 'LOGISTIQUE', 'SUBMITTED', 'Visa Logistique', 'verify'],
    [FuelRequestsManage, 'LOGISTIQUE', 'SUBMITTED', 'Supprimer', ''],
    [FuelRequestsRaf, 'RAF', 'VERIFIED', 'Approuver', 'approve'],
  ])('returns to the last available page after an action while retaining the status filter (%s, %s)', async (Component, role, status, action, route) => {
    auth.user = { role };
    rows = rows.slice(0, 21);
    apiFetch.mockImplementation(async (path, options) => {
      if (options?.method) {
        expect(path).toBe(`/api/requests/fuel/21${route ? `/${route}` : ''}`);
        rows = rows.filter((row) => row.id !== 21);
        return { ok: true };
      }
      expect(new URL(path, 'http://localhost').searchParams.get('status')).toBe(status);
      return listResponse(path, rows);
    });
    await mount(Component);
    await click('Suivant');
    expect(rendered()).toContain('21–21 sur 21 demandes');
    await click(action);

    expect(listCalls().map(([path]) => Number(new URL(path, 'http://localhost').searchParams.get('page'))))
      .toEqual([1, 2, 2, 1]);
    expect(rendered()).toContain('1–20 sur 20 demandes');
    expect(rendered()).toContain('CARB-1');
    expect(rendered()).not.toContain('CARB-21');
    expect(button('Suivant').props.disabled).toBe(true);
  });
});
