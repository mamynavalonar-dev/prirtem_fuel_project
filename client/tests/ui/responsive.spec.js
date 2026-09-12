import { test, expect } from '@playwright/test';

const vehicle = { id: 'vehicle-1', plate: '1234 TAA', brand: 'Toyota', model: 'Hilux', is_active: true };
const driver = { id: 'driver-1', full_name: 'Chauffeur de démonstration', name: 'Chauffeur de démonstration', is_active: true };
const book = { id: 'book-1', vehicle_id: vehicle.id, plate: vehicle.plate, logbook_type: 'SERVICE', status: 'DRAFT', period_start: '2026-09-01', period_end: '2026-09-30', objet: 'Déplacements de service', service_km: 100, mission_km: 0 };
const car = { id: 'car-1', request_no: 'N° 001/2026', request_type: 'SERVICE', objet: 'Mission de contrôle sur le terrain', departure_place: 'Antananarivo', destination_place: 'Antsirabe', passenger_count: 3, requester_username: 'demandeur', requester_name: 'Utilisateur Démonstration', requester_service: 'Technique', requester_id: 'user-1', request_date: '2026-09-12', start_date: '2026-09-12', end_date: '2026-09-13', departure_date: '2026-09-12', return_date: '2026-09-13', status: 'SUBMITTED', vehicle_id: vehicle.id, driver_id: driver.id, vehicle_plate: vehicle.plate, driver_name: driver.full_name };
const requests = Array.from({ length: 65 }, (_, index) => ({
  id: `fuel-${index + 1}`, request_no: `N° ${String(index + 1).padStart(3, '0')}/2026`,
  request_type: 'SERVICE', objet: index === 64 ? 'Mission unique de Mahajanga' : `Déplacement de service ${index + 1}`,
  request_date: '2026-09-12', end_date: '2026-09-13', status: 'SUBMITTED', requester_id: 'user-1',
  requester_username: 'demandeur', amount_estimated_ar: 250000, amount_estimated_words: 'Deux cent cinquante mille ariary',
}));

async function mockApi(page, role = 'DEMANDEUR') {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The test browser must never call the deployed API, SMTP or Supabase.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  const user = { id: 'user-1', username: 'utilisateur.demonstration', first_name: 'Utilisateur', last_name: 'Démonstration', email: 'demo@example.test', role, is_active: true, permissions: [] };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data;
    if (path === '/api/auth/me') {
      if (!role) return route.fulfill({ status: 401, json: { error: 'UNAUTHORIZED' } });
      data = { user };
    } else if (path === '/api/auth/demo-config') data = { enabled: true, roles: ['DEMANDEUR', 'LOGISTIQUE', 'RAF'] };
    else if (path === '/api/notifications') data = { notifications: [], count: 0, unread: 0 };
    else if (path === '/api/meta/vehicles' || path === '/api/vehicles') data = { vehicles: [vehicle] };
    else if (path === '/api/meta/drivers') data = { drivers: [driver] };
    else if (path === '/api/meta/assignments') data = { assignments: [] };
    else if (path === '/api/users') data = { users: [user] };
    else if (path === '/api/requests/fuel') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const rows = requests.filter((row) => `${row.objet} ${row.request_no}`.toLowerCase().includes(q));
      const pageNo = Number(url.searchParams.get('page') || 1);
      const limit = Number(url.searchParams.get('limit') || 50);
      data = { requests: rows.slice((pageNo - 1) * limit, pageNo * limit).map((row) => ({ ...row, status: url.searchParams.get('status') || row.status })), pagination: { page: pageNo, limit, total: rows.length, pages: Math.ceil(rows.length / limit) } };
    } else if (path.startsWith('/api/requests/fuel/')) data = { request: requests.find((row) => path.endsWith(row.id)) || requests[0] };
    else if (path === '/api/requests/car') data = { requests: [{ ...car, status: url.searchParams.get('status') || car.status }] };
    else if (path.startsWith('/api/requests/car/')) data = { request: car };
    else if (path === '/api/logbooks') data = { logbooks: [book], items: [book] };
    else if (path === '/api/logbooks/book-1') data = { logbook: book, trips: [], supplies: [] };
    else if (path === '/api/import/batches') data = { batches: [] };
    else if (path.startsWith('/api/trash/')) data = { items: [], total: 0 };
    else if (path === '/api/fuel/kpi/daily/bulk') data = { series: { [vehicle.id]: [] } };
    else if (path === '/api/fuel/kpi/simple/daily') data = { generator: [], other: [] };
    else if (path.startsWith('/api/fuel/')) data = { logs: [], rows: [], points: [], vehicles: [], totals: {} };
    else return route.fulfill({ status: 404, json: { error: `UNMOCKED ${path}` } });
    return route.fulfill({ json: data });
  });
  return errors;
}

async function assertContained(page) {
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => {
    const roots = [document.documentElement, document.querySelector('.app-content')].filter(Boolean);
    return roots.map((element) => ({ name: element.className || element.tagName, width: element.clientWidth, scroll: element.scrollWidth }))
      .filter((item) => item.scroll > item.width + 2);
  });
  expect(overflow, 'The document and main content must not scroll horizontally; tables have their own scroll areas').toEqual([]);
}

async function assertModalFits(page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  const size = page.viewportSize();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width + 1);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height + 1);
  const overflow = await dialog.evaluate((root) => Array.from(root.querySelectorAll('input, select, textarea')).filter((field) => {
    const rect = field.getBoundingClientRect();
    const outer = root.getBoundingClientRect();
    return rect.width && (rect.left < outer.left - 1 || rect.right > outer.right + 1);
  }).map((field) => field.id || field.name || field.tagName));
  expect(overflow, 'All form controls must remain inside the dialog horizontally').toEqual([]);
}

test('login fits the viewport with accessible controls', async ({ page }, testInfo) => {
  const errors = await mockApi(page, null);
  await page.goto('/login');
  await expect(page.locator('#login-username')).toBeVisible();
  await expect(page.locator('#login-password')).toBeVisible();
  await assertContained(page);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
});

test('menu opens, closes, restores focus and permits navigation', async ({ page }) => {
  const errors = await mockApi(page);
  await page.goto('/app/requests/fuel');
  await expect(page.getByRole('navigation', { name: 'Pagination des demandes de carburant' })).toBeVisible();
  if (page.viewportSize().width <= 1024) {
    const sidebar = page.locator('.asb-sidebar');
    await expect.poll(async () => (await sidebar.boundingBox()).x + (await sidebar.boundingBox()).width).toBeLessThanOrEqual(0);
    const opener = page.getByRole('button', { name: 'Ouvrir le menu', exact: true });
    await opener.click();
    await expect(sidebar).toHaveClass(/mobile-open/);
    await page.keyboard.press('Escape');
    await expect(sidebar).not.toHaveClass(/mobile-open/);
    await expect(opener).toBeFocused();
    await opener.click();
    await sidebar.getByRole('link', { name: 'Demande voiture', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/requests\/car$/);
    await expect(sidebar).not.toHaveClass(/mobile-open/);
  }
  await assertContained(page);
  expect(errors).toEqual([]);
});

test('fuel forms and pagination remain usable beyond the first fifty requests', async ({ page }, testInfo) => {
  const errors = await mockApi(page);
  await page.goto('/app/requests/fuel');
  await page.getByRole('button', { name: 'Suivant', exact: true }).click();
  await expect(page.getByText('21–40 sur 65 demandes', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Rechercher les demandes de carburant' }).fill('Mahajanga');
  await expect(page.getByText('Mission unique de Mahajanga', { exact: true })).toBeVisible();
  await assertContained(page);
  const opener = page.getByRole('button', { name: /Nouvelle demande/ });
  await opener.click();
  await assertModalFits(page);
  await page.getByLabel('Montant prévisionnel (Ar)', { exact: true }).fill('300000');
  await expect(page.getByLabel('Montant prévisionnel (Ar)', { exact: true })).toHaveValue('300000');
  await page.screenshot({ path: testInfo.outputPath('fuel-form.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(errors).toEqual([]);
});

test('administration pages keep wide tables inside their own scroll areas', async ({ page }, testInfo) => {
  const errors = await mockApi(page, 'ADMIN');
  for (const path of ['/app', '/app/fuel', '/app/calendar', '/app/import', '/app/users', '/app/meta', '/app/logbooks', '/app/logbooks/book-1', '/app/trash']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('.app-content')).not.toContainText('Chargement de la page');
    await assertContained(page);
    expect(errors, path).toEqual([]);
    if (path === '/app') await page.screenshot({ path: testInfo.outputPath('dashboard.png') });
  }
});

for (const [role, paths] of [
  ['LOGISTIQUE', ['/app/requests/fuel/manage', '/app/requests/car/manage']],
  ['RAF', ['/app/requests/fuel/raf', '/app/requests/car/raf']],
]) {
  test(`${role} validation lists remain readable`, async ({ page }) => {
    const errors = await mockApi(page, role);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator('tbody tr').first()).toBeVisible();
      await assertContained(page);
      expect(errors).toEqual([]);
    }
  });
}
