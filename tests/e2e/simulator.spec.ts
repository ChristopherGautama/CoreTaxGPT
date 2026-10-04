import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { AppState } from '../../src/domain/types';

const diagnostics = new WeakMap<Page, { errors: string[]; external: string[] }>();
test.beforeEach(async ({ page }) => {
  const captured = { errors: [] as string[], external: [] as string[] };
  diagnostics.set(page, captured);
  page.on('pageerror', (error) => captured.errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') captured.errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) captured.external.push(url.href);
  });
});
test.afterEach(async ({ page }, info) => {
  const captured = diagnostics.get(page)!;
  await info.attach('console-network-audit', { body: JSON.stringify(captured, null, 2), contentType: 'application/json' });
  expect(captured.external, 'No request may leave loopback').toEqual([]);
  expect(captured.errors, 'No browser runtime or console errors').toEqual([]);
});

async function persisted(page: Page): Promise<AppState> {
  return page.evaluate(async () => new Promise<AppState>((resolve, reject) => {
    const request = indexedDB.open('coretax-learning-simulator', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('snapshots')) { db.close(); reject(new Error('Storage not initialized')); return; }
      const transaction = db.transaction('snapshots', 'readonly');
      const snapshot = transaction.objectStore('snapshots').get('current');
      snapshot.onsuccess = () => resolve(snapshot.result as AppState);
      snapshot.onerror = () => reject(snapshot.error);
      transaction.oncomplete = () => db.close();
    };
  }));
}

async function login(page: Page, actor = 'pic', path = '/') {
  await page.goto(path);
  await page.getByLabel('ID Pengguna', { exact: true }).fill(actor);
  await page.getByLabel('Kata Sandi', { exact: true }).fill('Belajar123!');
  await page.getByLabel(/Saya siap berlatih/).check();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect.poll(async () => (await persisted(page))?.actorUserId).toBe(actor);
}

async function activateCertificate(page: Page) {
  await page.goto('/profil');
  await page.getByLabel('Passphrase demo', { exact: true }).fill('Simulasi123!');
  await page.getByRole('button', { name: 'Aktifkan KODJP demo', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).certificates.some((certificate) => certificate.userId === 'pic' && certificate.status === 'ACTIVE')).toBe(true);
}

async function resetScenario(page: Page, scenarioId: string) {
  await page.goto('/belajar');
  await page.getByLabel('Pilih kasus untuk replay / reset', { exact: true }).selectOption(scenarioId);
  await page.getByRole('button', { name: 'Mulai ulang kasus', exact: true }).click();
  await page.getByRole('button', { name: 'Reset atomic & mulai ulang', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).scenarioId).toBe(scenarioId);
  // Reset returns to the unauthenticated deterministic fixture.
  await login(page);
}

async function post(page: Page) {
  await page.goto('/spt');
  await page.getByRole('button', { name: 'Posting SPT', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).returns.find((taxReturn) => taxReturn.period === '2026-10' && taxReturn.version === 0)?.status).toBe('POSTED');
}

function amountRow(page: Page, field: string) {
  return page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: field, exact: true }) });
}

test('login verification, visibility, demo activation and 2FA protect the demo flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Centang verifikasi');
  await page.getByRole('button', { name: 'Tampilkan kata sandi', exact: true }).click();
  await expect(page.getByLabel('Kata Sandi', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: /Belum Aktivasi/ }).click();
  await page.getByLabel('Kode verifikasi demo').fill('123456');
  await page.getByRole('button', { name: 'Aktifkan persona latihan', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('Akses latihan aktif');
  await page.keyboard.press('Escape');
  await login(page);
  await page.goto('/profil');
  await page.getByLabel('Aktifkan 2FA demo untuk login berikutnya').check();
  await expect.poll(async () => (await persisted(page)).users.find((user) => user.id === 'pic')?.twoFactor).toBe(true);
  await page.getByRole('button', { name: /Keluar/ }).click();
  await page.getByLabel(/Saya siap berlatih/).check();
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('2FA demo aktif');
  await page.getByLabel('Kode 2FA demo (123456)').fill('123456');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).actorUserId).toBe('pic');
});

test('drafter saves a draft and direct URL access cannot authorize signing', async ({ page }) => {
  await login(page, 'drafter', '/efaktur');
  await page.goto('/efaktur');
  await page.getByRole('button', { name: /Buat faktur latihan/ }).click();
  await page.getByRole('button', { name: 'Simpan draf', exact: true }).click();
  await page.getByRole('button', { name: 'Validasi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tanda tangani', exact: true })).toBeDisabled();
  await expect.poll(async () => (await persisted(page)).invoices.filter((invoice) => invoice.status === 'VALIDATED').length).toBe(1);
  await page.goto('/efaktur?tab=output');
  await expect(page.getByRole('button', { name: 'Tanda tangani', exact: true })).toBeDisabled();
});

test('switching taxpayer isolates invoice, SPT, payment and audit views', async ({ page }) => {
  await login(page);
  await page.goto('/efaktur');
  await expect(page.getByRole('button', { name: 'Detail SIM-FP-KELUAR-001', exact: true })).toBeVisible();
  await page.getByLabel('Wajib Pajak aktif', { exact: true }).selectOption('wp-personal');
  await expect(page.getByRole('button', { name: 'Detail SIM-FP-KELUAR-001', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await persisted(page)).actingTaxpayerId).toBe('wp-personal');
  await page.goto('/spt');
  await expect(page.getByRole('button', { name: /^Buka SPT / })).toHaveCount(0);
  await page.goto('/buku-besar');
  await expect(page.getByText('SIM-SPT-2026-09-0', { exact: true })).toHaveCount(0);
  await page.getByLabel('Wajib Pajak aktif', { exact: true }).selectOption('wp-niaga');
  await expect.poll(async () => (await persisted(page)).actingTaxpayerId).toBe('wp-niaga');
  await page.goto('/efaktur');
  await expect(page.getByRole('button', { name: 'Detail SIM-FP-KELUAR-001', exact: true })).toBeVisible();
});

test('January PM rejects May ordinary credit, accepts April and rejects double credit', async ({ page }) => {
  await login(page);
  await activateCertificate(page);
  await page.goto('/efaktur?tab=input');
  await page.getByRole('button', { name: /Buat faktur latihan/ }).click();
  await page.getByLabel('Tanggal faktur', { exact: true }).fill('2026-01-15');
  await page.getByRole('button', { name: 'Simpan draf', exact: true }).click();
  await page.getByRole('button', { name: 'Hapus filter', exact: true }).click();
  await page.getByRole('button', { name: 'Validasi', exact: true }).click();
  await page.getByRole('button', { name: 'Tanda tangani', exact: true }).click();
  await page.getByRole('button', { name: 'Approval simulasi', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).invoices.at(-1)?.status).toBe('APPROVED');
  const invoice = (await persisted(page)).invoices.at(-1)!;
  const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: `Detail ${invoice.number}`, exact: true }) });
  await row.getByRole('button', { name: 'Keputusan PM', exact: true }).click();
  await page.getByLabel('Masa kredit / pencatatan', { exact: true }).fill('2026-05');
  await page.getByLabel('Alasan keputusan', { exact: true }).fill('Seluruh syarat dokumen sintetis diperiksa.');
  await page.getByLabel('Syarat formal dan status dokumen telah diperiksa.').check();
  await page.getByLabel('Syarat material terpenuhi dan bukan pengkreditan ganda.').check();
  await page.getByRole('button', { name: 'Simpan keputusan PM', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/pembetulan/i);
  await page.getByLabel('Masa kredit / pencatatan', { exact: true }).fill('2026-04');
  await page.getByRole('button', { name: 'Simpan keputusan PM', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await persisted(page)).decisions.find((decision) => decision.invoiceId === invoice.id)?.creditPeriod).toBe('2026-04');
  await row.getByRole('button', { name: 'Keputusan PM', exact: true }).click();
  await page.getByLabel('Masa kredit / pencatatan', { exact: true }).fill('2026-04');
  await page.getByLabel('Alasan keputusan', { exact: true }).fill('Percobaan pengkreditan kedua untuk uji penolakan.');
  await page.getByLabel('Syarat formal dan status dokumen telah diperiksa.').check();
  await page.getByLabel('Syarat material terpenuhi dan bukan pengkreditan ganda.').check();
  await page.getByRole('button', { name: 'Simpan keputusan PM', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(/ganda|sudah dikreditkan/i);
});

test('invoice gross conversion and staged signing publish an immutable synthetic invoice', async ({ page }) => {
  await login(page);
  await activateCertificate(page);
  await page.goto('/efaktur');
  await page.getByRole('button', { name: /Buat faktur latihan/ }).click();
  await page.getByLabel('Harga pada rincian', { exact: true }).selectOption('gross');
  await page.getByLabel('Harga satuan 1', { exact: true }).fill('111000000');
  const preview = page.getByRole('dialog').locator('.calculation');
  await expect(preview).toContainText(/100\.000\.000/);
  await expect(preview).toContainText(/11\.000\.000/);
  await expect(preview).toContainText('tarif hukum 12%');
  await page.getByRole('button', { name: 'Simpan draf', exact: true }).click();
  await page.getByRole('button', { name: 'Validasi', exact: true }).click();
  await page.getByRole('button', { name: 'Tanda tangani', exact: true }).click();
  await page.getByRole('button', { name: 'Approval simulasi', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).invoices.at(-1)?.status).toBe('APPROVED');
  const invoice = (await persisted(page)).invoices.at(-1)!;
  expect(invoice.net).toBe('100000000');
  expect(invoice.vat).toBe('11000000');
  await page.getByRole('button', { name: `Detail ${invoice.number}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Dokumen disetujui bersifat immutable');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unduh faktur simulasi', exact: true }).click();
  const document = await download;
  expect(document.suggestedFilename()).toMatch(/^SIM-/);
  expect(await readFile((await document.path())!, 'utf8')).toContain('SIMULASI BELAJAR');
});

test('KB 30 million posts, pays, files, reloads and exports a watermarked BPE', async ({ page }) => {
  await login(page);
  await activateCertificate(page);
  await post(page);
  await expect(amountRow(page, 'III.A')).toContainText('55.000.000');
  await expect(amountRow(page, 'III.C')).toContainText('25.000.000');
  await expect(amountRow(page, 'III.E')).toContainText('30.000.000');
  await expect(page.getByRole('button', { name: 'Unduh BPE simulasi', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Bayar dan Lapor', exact: true }).click();
  await page.getByRole('link', { name: 'Buat / bayar billing', exact: true }).click();
  await page.getByText('Kontrol clock simulasi (WIB)', { exact: true }).click();
  await expect(page.getByLabel('Waktu fixture dalam WIB', { exact: true })).toHaveValue('2026-11-15T09:00');
  const beforeClockUpdate = await persisted(page);
  const originalInstant = Date.parse(beforeClockUpdate.clock);
  await page.getByRole('button', { name: 'Terapkan clock latihan', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).revision).toBeGreaterThan(beforeClockUpdate.revision);
  await expect.poll(async () => Date.parse((await persisted(page)).clock)).toBe(originalInstant);
  await page.getByRole('button', { name: 'Buat billing PPN', exact: true }).click();
  await page.getByRole('button', { name: /^Bayar simulasi SIM-/ }).click();
  await page.getByRole('link', { name: 'Lanjut tanda tangan & lapor', exact: true }).click();
  await page.getByRole('button', { name: 'Tanda tangan & lapor', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).returns.find((taxReturn) => taxReturn.period === '2026-10')?.status).toBe('FILED');
  await expect(amountRow(page, 'III.E')).toContainText('30.000.000');
  await page.reload();
  await expect(page.getByText('Versi dilaporkan terkunci.', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unduh BPE simulasi', exact: true }).click();
  const document = await download;
  expect(document.suggestedFilename()).toMatch(/^SIM-/);
  expect(await readFile((await document.path())!, 'utf8')).toContain('SIMULASI BELAJAR');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'qa/screenshots/spt-filed-1366x768.png', fullPage: true });
});

for (const scenario of [{ id: 'lb', value: '-16500000', status: 'LB' }, { id: 'nihil', value: '0', status: 'NIHIL' }]) {
  test(`${scenario.status} still requires filing before a BPE exists`, async ({ page }) => {
    await login(page);
    await resetScenario(page, scenario.id);
    await activateCertificate(page);
    await post(page);
    expect((await persisted(page)).returns.find((taxReturn) => taxReturn.period === '2026-10')!.amounts.III_E).toBe(scenario.value);
    await expect(page.getByRole('button', { name: 'Unduh BPE simulasi', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Bayar dan Lapor', exact: true }).click();
    await page.getByRole('button', { name: 'Tanda tangan & lapor', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Unduh BPE simulasi', exact: true })).toBeVisible();
    expect((await persisted(page)).billings).toHaveLength(0);
  });
}

test('approved October return changes KB to 27.8 million while the draft is neutral', async ({ page }) => {
  await login(page);
  await activateCertificate(page);
  await post(page);
  await page.goto('/efaktur');
  await page.getByRole('button', { name: 'Detail SIM-FP-KELUAR-001', exact: true }).click();
  await page.getByRole('button', { name: 'Buat retur', exact: true }).click();
  await page.getByRole('button', { name: 'Simpan draf retur', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).notes.length).toBe(1);
  expect((await persisted(page)).returns.find((taxReturn) => taxReturn.period === '2026-10')!.amounts.III_E).toBe('30000000');
  await page.getByRole('button', { name: 'Setujui', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).notes[0]!.status).toBe('APPROVED');
  await post(page);
  await expect(amountRow(page, 'III.E')).toContainText('27.800.000');
});

test('noneligible PM remains on B3 and raises the baseline KB to 35 million', async ({ page }) => {
  await login(page);
  await resetScenario(page, 'noneligible');
  await post(page);
  await expect(amountRow(page, 'III.E')).toContainText('35.000.000');
  await page.getByRole('tab', { name: 'B3', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('SIM-FP-MASUK-002');
  await expect(page.getByRole('tabpanel')).toContainText('5.000.000');
});

test('a paid filed return remains immutable and amendment reports only the extra liability', async ({ page }) => {
  await login(page);
  await activateCertificate(page);
  await post(page);
  await page.getByRole('button', { name: 'Bayar dan Lapor', exact: true }).click();
  await page.getByRole('link', { name: 'Buat / bayar billing', exact: true }).click();
  await page.getByRole('button', { name: 'Buat billing PPN', exact: true }).click();
  await page.getByRole('button', { name: /^Bayar simulasi SIM-/ }).click();
  await page.getByRole('link', { name: 'Lanjut tanda tangan & lapor', exact: true }).click();
  await page.getByRole('button', { name: 'Tanda tangan & lapor', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).returns.find((taxReturn) => taxReturn.period === '2026-10')?.status).toBe('FILED');
  const original = (await persisted(page)).returns.find((taxReturn) => taxReturn.period === '2026-10')!;
  await page.goto('/efaktur');
  await page.getByRole('button', { name: /Buat faktur latihan/ }).click();
  await page.getByLabel('Harga satuan 1', { exact: true }).fill('20000000');
  await page.getByRole('button', { name: 'Simpan draf', exact: true }).click();
  await page.getByRole('button', { name: 'Validasi', exact: true }).click();
  await page.getByRole('button', { name: 'Tanda tangani', exact: true }).click();
  await page.getByRole('button', { name: 'Approval simulasi', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).invoices.at(-1)?.status).toBe('APPROVED');
  await page.goto('/spt');
  await page.getByRole('button', { name: 'Buat pembetulan', exact: true }).click();
  await page.getByRole('button', { name: 'Posting SPT', exact: true }).click();
  await expect(amountRow(page, 'III.E')).toContainText('32.200.000');
  await expect(amountRow(page, 'III.F')).toContainText('30.000.000');
  await expect(amountRow(page, 'III.G')).toContainText('2.200.000');
  await expect.poll(async () => (await persisted(page)).returns.find((taxReturn) => taxReturn.period === '2026-10' && taxReturn.version === 1)?.amounts.III_G).toBe('2200000');
  expect((await persisted(page)).returns.find((taxReturn) => taxReturn.id === original.id)).toEqual(original);
});

test('billing expires exactly at 336 hours and may be cancelled and reissued', async ({ page }) => {
  await login(page);
  await post(page);
  await page.getByRole('button', { name: 'Bayar dan Lapor', exact: true }).click();
  await page.getByRole('link', { name: 'Buat / bayar billing', exact: true }).click();
  await page.getByRole('button', { name: 'Buat billing PPN', exact: true }).click();
  await page.getByText('Uji batas 336 jam', { exact: true }).click();
  await page.getByRole('button', { name: 'Atur clock 335 jam 59 menit', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Bayar simulasi SIM-/ })).toBeEnabled();
  await page.getByRole('button', { name: 'Atur clock tepat 336 jam', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Bayar simulasi SIM-/ })).toBeDisabled();
  await page.getByRole('button', { name: /^Batalkan SIM-/ }).click();
  await page.getByRole('button', { name: 'Bayar dan Lapor', exact: true }).click();
  await page.getByRole('button', { name: 'Buat billing PPN', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).billings.length).toBe(2);
  expect((await persisted(page)).billings[0]!.status).toBe('CANCELLED');
});

test('PPnBM is a separate bucket and full deposit allocation pays both taxes', async ({ page }) => {
  await login(page);
  await resetScenario(page, 'ppnbm');
  await activateCertificate(page);
  await post(page);
  await expect(amountRow(page, 'III.A')).toContainText('120.000.000');
  await expect(amountRow(page, 'III.E')).toContainText('98.000.000');
  await expect(amountRow(page, 'VI.C')).toContainText('200.000.000');
  await page.getByRole('button', { name: 'Bayar dan Lapor', exact: true }).click();
  await page.getByRole('link', { name: 'Buat / bayar billing', exact: true }).click();
  await page.getByLabel('Jumlah deposit sintetis (Rp)', { exact: true }).fill('298000000');
  await page.getByRole('button', { name: 'Tambah deposit simulasi', exact: true }).click();
  await page.getByRole('button', { name: 'Lunasi seluruh SPT dengan deposit', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).payments.length).toBe(2);
  expect((await persisted(page)).payments.map((payment) => [payment.bucket, payment.amount])).toEqual([['PPN', '98000000'], ['PPNBM', '200000000']]);
  await page.getByRole('link', { name: 'Lanjut tanda tangan & lapor', exact: true }).click();
  await page.getByRole('button', { name: 'Tanda tangan & lapor', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unduh BPE simulasi', exact: true })).toBeVisible();
});

test('compensation adjustment preserves the source and yields 200 thousand for December', async ({ page }) => {
  await login(page);
  await resetScenario(page, 'compensation');
  await activateCertificate(page);
  await page.goto('/spt');
  await page.getByRole('tab', { name: 'Kompensasi', exact: true }).click();
  await page.getByRole('button', { name: 'Catat contoh penyesuaian kompensasi', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).compensations.filter((entry) => entry.targetPeriod === '2026-12').reduce((total, entry) => total + Number(entry.amount), 0)).toBe(200000);
  const state = await persisted(page);
  expect(state.returns.find((taxReturn) => taxReturn.id === 'SIM-OFFICIAL-OCT-2026')!.amounts.III_E).toBe('-200000');
  expect(state.returns.find((taxReturn) => taxReturn.period === '2026-10' && taxReturn.version === 1)!.amounts.III_G).toBe('-100000');
  await expect(page.getByRole('button', { name: 'Catat contoh penyesuaian kompensasi', exact: true })).toBeDisabled();
});

test('learning export, reset, import and exam grading preserve local progress', async ({ page }) => {
  await login(page);
  await page.goto('/belajar');
  await page.getByRole('button', { name: /Buka petunjuk berikutnya/ }).click();
  await expect.poll(async () => (await persisted(page)).learning.hints).toBe(1);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Ekspor progres/ }).click();
  const exported = await download;
  const exportedPath = (await exported.path())!;
  const text = await readFile(exportedPath, 'utf8');
  expect(JSON.parse(text).watermark).toBe('SIMULASI BELAJAR • BUKAN LAYANAN DJP');
  await resetScenario(page, 'nihil');
  await page.goto('/belajar');
  await page.getByLabel('Berkas progres simulasi').setInputFiles(exportedPath);
  await expect.poll(async () => (await persisted(page)).scenarioId).toBe('kb');
  expect((await persisted(page)).learning.hints).toBe(1);
  await page.getByRole('button', { name: /Ujian.*Selesaikan kasus/ }).click();
  await expect(page.getByRole('button', { name: /Buka petunjuk berikutnya/ })).toHaveCount(0);
  await page.getByLabel('Hasil PPN (rupiah tanpa pemisah, LB negatif)').fill('30000000');
  await page.getByLabel('Hasil PPnBM (rupiah tanpa pemisah)').fill('0');
  await page.getByLabel('Status penghitungan', { exact: true }).selectOption('KB');
  await page.getByRole('button', { name: 'Nilai jawaban', exact: true }).click();
  await expect.poll(async () => (await persisted(page)).learning.lastScore).toBe(100);
  await page.reload();
  await expect(page.getByText('Ketiga jawaban sesuai.', { exact: true })).toBeVisible();
  await page.getByLabel('Berkas progres simulasi').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":99}') });
  await expect(page.getByRole('alert')).toContainText('tidak didukung');
  expect((await persisted(page)).learning.lastScore).toBe(100);
});

for (const viewport of [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 1265, height: 712 }]) {
  test(`visual and keyboard inspection at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.simulation-banner')).toContainText('SIMULASI BELAJAR • BUKAN LAYANAN DJP');
    await expect(page.getByRole('button', { name: 'Ganti tema', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ganti tema', exact: true }).click();
    await page.getByRole('button', { name: 'Ganti tema', exact: true }).click();
    await page.getByLabel('Bahasa', { exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByLabel('ID Pengguna', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Kata Sandi', { exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.screenshot({ path: `qa/screenshots/login-${viewport.width}x${viewport.height}.png`, fullPage: true });
    if (viewport.width === 1265) await page.screenshot({ path: 'qa/screenshots/login-reference-1265x712.png', fullPage: false });
    await login(page);
    await page.screenshot({ path: `qa/screenshots/portal-${viewport.width}x${viewport.height}.png`, fullPage: true });
    await page.goto('/efaktur');
    await expect(page.getByRole('button', { name: /Buat faktur latihan/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `qa/screenshots/faktur-${viewport.width}x${viewport.height}.png`, fullPage: true });
  });
}
