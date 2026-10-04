import { test, expect, type Page } from '@playwright/test';
import type { AppState } from '../../src/domain/types';

type Diagnostics = { errors: string[]; external: string[]; outsideBase: string[]; failures: string[]; assets: string[] };
const diagnostics = new WeakMap<Page, Diagnostics>();

test.beforeEach(async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('Pages base URL is required');
  const base = new URL(baseURL);
  const result: Diagnostics = { errors: [], external: [], outsideBase: [], failures: [], assets: [] };
  diagnostics.set(page, result);
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    if (url.origin !== base.origin) result.external.push(url.href);
    if (url.origin === base.origin && !url.pathname.startsWith(base.pathname)) result.outsideBase.push(url.href);
    if (['script', 'stylesheet', 'image', 'font'].includes(request.resourceType())) result.assets.push(url.href);
  });
  page.on('response', response => { if (response.status() >= 400) result.failures.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => result.failures.push(`${request.failure()?.errorText} ${request.url()}`));
});

test.afterEach(async ({ page }, info) => {
  const result = diagnostics.get(page)!;
  await info.attach('pages-console-network', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.errors, 'No browser runtime or console errors').toEqual([]);
  expect(result.external, 'Application requests stay on the static hosting origin').toEqual([]);
  expect(result.outsideBase, 'Every requested asset/document stays under the repository base path').toEqual([]);
  expect(result.failures, 'No failed network responses or requests').toEqual([]);
});

async function persisted(page: Page): Promise<AppState> {
  return page.evaluate(() => new Promise<AppState>((resolve, reject) => {
    const open = indexedDB.open('coretax-learning-simulator', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('snapshots', 'readonly');
      const request = tx.objectStore('snapshots').get('current');
      request.onsuccess = () => resolve(request.result as AppState);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    };
  }));
}

async function login(page: Page) {
  await page.goto('');
  await page.getByLabel('ID Pengguna', { exact: true }).fill('pic');
  await page.getByLabel('Kata Sandi', { exact: true }).fill('Belajar123!');
  await page.getByLabel(/Saya siap berlatih/).check();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Selamat datang/ })).toBeVisible();
  await expect.poll(async () => (await persisted(page)).actorUserId).toBe('pic');
}

test('static host does not silently rewrite missing paths to the application', async ({ request, baseURL }) => {
  test.skip(!!process.env.PAGES_TEST_URL, 'Strict server implementation is verified only against the local fixture.');
  const base = new URL(baseURL!);
  expect((await request.get(base.href)).status()).toBe(200);
  expect((await request.get(new URL('spt', base).href)).status()).toBe(404);
  expect((await request.get(new URL('missing-file.js', base).href)).status()).toBe(404);
  expect((await request.get(base.origin + '/')).status()).toBe(404);
});

test('production project URL loads its bundled assets and favicon inside the base path', async ({ page, request, baseURL }) => {
  await page.goto('');
  await expect(page.getByLabel('ID Pengguna', { exact: true })).toBeVisible();
  await expect(page.locator('.simulation-banner')).toContainText('SIMULASI BELAJAR • BUKAN LAYANAN DJP');
  const base = new URL(baseURL!);
  const favicon = await page.locator('link[rel="icon"]').evaluate(link => (link as HTMLLinkElement).href);
  expect(favicon).toBe(new URL('favicon.svg', base).href);
  const response = await request.get(favicon);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  expect(await response.text()).toContain('<svg');
  const assets = diagnostics.get(page)!.assets;
  expect(assets.some(url => /\/assets\/.*\.js$/.test(url))).toBe(true);
  expect(assets.some(url => /\/assets\/.*\.css$/.test(url))).toBe(true);
});

test('login, SPT posting and reload work on a host without history fallback', async ({ page, baseURL }) => {
  await login(page);
  await page.getByRole('navigation', { name: 'Navigasi utama' }).getByRole('link', { name: 'SPT', exact: true }).click();
  await expect(page).toHaveURL(new URL('#/spt', baseURL).href);
  await expect(page.getByRole('heading', { name: 'SPT Masa PPN', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Posting SPT', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).returns.find(item => item.period === '2026-10')?.amounts.III_E).toBe('30000000');
  await expect.poll(async () => (await persisted(page)).returns.find(item => item.period === '2026-10')?.status).toBe('POSTED');
  const before = await persisted(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'SPT Masa PPN', exact: true })).toBeVisible();
  expect((await persisted(page)).returns).toEqual(before.returns);
  expect((await persisted(page)).actorUserId).toBe('pic');
  await expect(page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'III.E', exact: true }) })).toContainText('30.000.000');
  await page.screenshot({ path: 'qa/screenshots/pages-spt-1366x768.png', fullPage: true });
});

test('browser back and forward preserve hash routes and direct hash links reopen after reload', async ({ page, baseURL }) => {
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
  await nav.getByRole('link', { name: 'e-Faktur', exact: true }).click();
  await expect(page).toHaveURL(new URL('#/efaktur', baseURL).href);
  await nav.getByRole('link', { name: 'SPT', exact: true }).click();
  await expect(page).toHaveURL(new URL('#/spt', baseURL).href);
  await page.goBack();
  await expect(page).toHaveURL(new URL('#/efaktur', baseURL).href);
  await expect(page.getByRole('button', { name: /Buat faktur latihan/ })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(new URL('#/spt', baseURL).href);
  await expect(page.getByRole('heading', { name: 'SPT Masa PPN', exact: true })).toBeVisible();
  await page.goto(new URL('#/efaktur?tab=input', baseURL).href);
  await expect(page.getByRole('button', { name: 'Detail SIM-FP-MASUK-001', exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new URL('#/efaktur?tab=input', baseURL).href);
  await expect(page.getByRole('button', { name: 'Detail SIM-FP-MASUK-001', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retur & Pembatalan', exact: true }).click();
  await expect(page).toHaveURL(new URL('#/efaktur?tab=notes', baseURL).href);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Retur & Pembatalan', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pajak Masukan', exact: true }).click();
  await expect(page).toHaveURL(new URL('#/efaktur?tab=input', baseURL).href);
  await expect(page.getByRole('button', { name: 'Detail SIM-FP-MASUK-001', exact: true })).toBeVisible();
});

test('learning mode remains in IndexedDB after navigating and reloading a direct hosted link', async ({ page, baseURL }) => {
  await login(page);
  await page.getByLabel('Mode belajar', { exact: true }).selectOption('MANDIRI');
  await expect.poll(async () => (await persisted(page)).mode).toBe('MANDIRI');
  await page.goto(new URL('#/belajar', baseURL).href);
  await page.reload();
  await expect(page.getByLabel('Mode belajar', { exact: true })).toHaveValue('MANDIRI');
  expect((await persisted(page)).mode).toBe('MANDIRI');
  expect((await persisted(page)).actorUserId).toBe('pic');
});
