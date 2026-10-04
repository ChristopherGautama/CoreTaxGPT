import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState, scenarios } from '../../src/fixtures/scenarios';
import { execute, currentReturn, type Command } from '../../src/domain/workflow';
import { clearState, exportState, importState, loadState, MAX_IMPORT_BYTES, replaceState, saveState } from '../../src/storage/store';

const initial = () => createInitialState(scenarios[0]!.id);

beforeEach(async () => { await clearState(); });

describe('versioned atomic local storage', () => {
  it('returns null before the first write and reloads the full deterministic snapshot', async () => {
    expect(await loadState()).toBeNull();
    const state = initial();
    await saveState(state);
    expect(await loadState()).toEqual(state);
  });

  it('preserves leading-zero identities and string monetary precision in export/import', () => {
    const state = initial();
    const serialized = exportState(state);
    const restored = importState(serialized);
    expect(restored).toEqual(state);
    expect(serialized).toContain('SIMULASI BELAJAR • BUKAN LAYANAN DJP');
    expect(restored.taxpayers[0]!.npwp).toBe(state.taxpayers[0]!.npwp);
    expect(restored.taxpayers[0]!.npwp.startsWith('0')).toBe(true);
    expect(typeof restored.invoices[0]!.dpp).toBe('string');
    expect(restored.invoices[0]!.dpp).toBe(state.invoices[0]!.dpp);
  });

  it.each(scenarios.map((scenario) => scenario.id))('roundtrips the full %s fixture', (scenarioId) => {
    const state = createInitialState(scenarioId);
    expect(importState(exportState(state))).toEqual(state);
  });

  it('serializes rapid saves and awaits the committed latest snapshot', async () => {
    const snapshots = Array.from({ length: 8 }, (_, revision) => ({ ...initial(), revision, learning: { ...initial().learning, hints: revision } }));
    await Promise.all(snapshots.map((state) => saveState(state)));
    expect(await loadState()).toEqual(snapshots.at(-1));
  });

  it('rejects stale or conflicting writes without replacing newer progress', async () => {
    const state = initial();
    const newer = { ...state, revision: state.revision + 1 };
    await saveState(newer);
    await expect(saveState(state)).rejects.toThrow('lebih lama');
    await expect(saveState({ ...newer, mode: 'UJIAN' })).rejects.toThrow('Konflik revisi');
    expect(await loadState()).toEqual(newer);
    // A rejected write must not poison the serialization queue.
    await saveState({ ...newer, revision: newer.revision + 1 });
    expect((await loadState())!.revision).toBe(newer.revision + 1);
  });

  it('snapshots the caller data before a queued write', async () => {
    const state = initial();
    const pending = saveState(state);
    state.learning.hints = 99;
    await pending;
    expect((await loadState())!.learning.hints).toBe(0);
  });

  it('replaces import/reset atomically even when the incoming revision is lower', async () => {
    const fixture = initial();
    await saveState({ ...fixture, revision: 99 });
    const restored = importState(exportState(fixture));
    const replace = replaceState(restored);
    const reload = loadState();
    await replace;
    expect(await reload).toEqual(fixture);
    await clearState();
    expect(await loadState()).toBeNull();
  });
});

describe('strict imports do not alter saved progress on failure', () => {
  it.each([
    ['broken JSON', '{'],
    ['unknown schema', JSON.stringify({ schemaVersion: 2 })],
    ['missing envelope', JSON.stringify({ schemaVersion: 1 })],
  ])('rejects %s', async (_name, source) => {
    const state = initial();
    await saveState(state);
    expect(() => importState(source)).toThrow();
    expect(await loadState()).toEqual(state);
  });

  it('rejects files above the 5 MiB cap', () => {
    expect(() => importState(' '.repeat(MAX_IMPORT_BYTES + 1))).toThrow('5 MiB');
  });

  it('rejects timezone-free or calendar-invalid clocks rather than shifting an imported fixture', () => {
    for (const clock of ['2026-11-15T09:00:00', '2026-02-30T09:00:00+07:00']) {
      const envelope = JSON.parse(exportState(initial()));
      envelope.state.clock = clock;
      expect(() => importState(JSON.stringify(envelope))).toThrow('zona waktu');
    }
  });

  it('rejects secret/unknown fields instead of persisting actual credentials', async () => {
    const state = initial();
    await saveState(state);
    const envelope = JSON.parse(exportState(state));
    envelope.state.users[0].password = 'not-a-supported-field';
    expect(() => importState(JSON.stringify(envelope))).toThrow('tidak valid');
    expect(await loadState()).toEqual(state);
  });

  it('rejects nonfixture tax identities and account logins', () => {
    const identity = JSON.parse(exportState(initial()));
    identity.state.taxpayers[0].npwp = '1234567890123456';
    expect(() => importState(JSON.stringify(identity))).toThrow('sintetis');
    const login = JSON.parse(exportState(initial()));
    login.state.users[0].login = 'real-account@example.test';
    expect(() => importState(JSON.stringify(login))).toThrow('tidak valid');
  });

  it('rejects missing source references and duplicate IDs', () => {
    const envelope = JSON.parse(exportState(initial()));
    envelope.state.compensations[0].sourceReturnId = 'SIM-UNKNOWN';
    expect(() => importState(JSON.stringify(envelope))).toThrow('sumber kompensasi');
    const duplicate = JSON.parse(exportState(initial()));
    duplicate.state.users.push(duplicate.state.users[0]);
    expect(() => importState(JSON.stringify(duplicate))).toThrow('ID duplikat');
  });

  it('rejects amounts encoded as floating-point numbers and non-SIM document numbers', () => {
    const envelope = JSON.parse(exportState(initial()));
    envelope.state.invoices[0].net = 100000000;
    expect(() => importState(JSON.stringify(envelope))).toThrow('tidak valid');
    const document = JSON.parse(exportState(initial()));
    document.state.invoices[0].number = '0100000000000000';
    expect(() => importState(JSON.stringify(document))).toThrow('SIM-');
  });

  it('rejects a missing simulation watermark', () => {
    const envelope = JSON.parse(exportState(initial()));
    envelope.watermark = 'SPT resmi';
    expect(() => importState(JSON.stringify(envelope))).toThrow();
  });
});

describe('persisting the end-to-end fiscal workflow', () => {
  it('posts and roundtrips a 20-invoice source snapshot larger than 10 KB', async () => {
    let state = initial();
    const run = (command: Command) => { state = execute(state, command); };
    run({ type: 'LOGIN', userId: 'pic' });
    run({ type: 'ACTIVATE_CERTIFICATE' });
    for (let index = 0; index < 18; index += 1) {
      run({ type: 'CREATE_INVOICE', invoice: { direction: 'OUTPUT', counterparty: 'PT Pelanggan Latihan Sejahtera', date: '2026-10-15', transactionCode: '04', regime: 'nonLuxury', net: '100000000', description: `Barang dagangan latihan ${index + 1}` } });
      const invoiceId = state.invoices.at(-1)!.id;
      run({ type: 'VALIDATE_INVOICE', invoiceId });
      run({ type: 'SIGN_INVOICE', invoiceId });
      run({ type: 'APPROVE_INVOICE', invoiceId });
    }
    run({ type: 'POST_RETURN', returnId: currentReturn(state)!.id });
    expect(state.invoices).toHaveLength(20);
    expect(currentReturn(state)!.sourceFingerprint.length).toBeGreaterThan(10_000);
    await saveState(state);
    expect(await loadState()).toEqual(state);
    const exported = exportState(state);
    expect(new TextEncoder().encode(exported).byteLength).toBeLessThan(MAX_IMPORT_BYTES);
    expect(importState(exported)).toEqual(state);
  });

  it('persists PPnBM deposit allocations per bucket and rejects over-allocation', async () => {
    let state = createInitialState('ppnbm');
    const run = (command: Command) => { state = execute(state, command); };
    run({ type: 'LOGIN', userId: 'pic' });
    run({ type: 'ACTIVATE_CERTIFICATE' });
    const returnId = currentReturn(state)!.id;
    run({ type: 'POST_RETURN', returnId });
    run({ type: 'PREPARE_PAYMENT', returnId });
    run({ type: 'ADD_DEPOSIT', amount: '298000000', source: 'Deposit sintetis untuk dua bucket' });
    run({ type: 'PAY_DEPOSIT', returnId });
    run({ type: 'FILE_RETURN', returnId });
    await saveState(state);
    expect(importState(exportState((await loadState())!))).toEqual(state);
    expect(state.payments.map((payment) => payment.amount)).toEqual(['98000000', '200000000']);
    const invalid = JSON.parse(exportState(state));
    invalid.state.deposits[0].amount = '1';
    expect(() => importState(JSON.stringify(invalid))).toThrow('melebihi lot');
  });

  it('persists signed compensation adjustments and their immutable origins', async () => {
    let state = createInitialState('compensation');
    state = execute(state, { type: 'LOGIN', userId: 'pic' });
    state = execute(state, { type: 'ACTIVATE_CERTIFICATE' });
    state = execute(state, { type: 'COMPENSATION_ADJUST' });
    await saveState(state);
    expect(importState(exportState((await loadState())!))).toEqual(state);
    expect(state.compensations.find((entry) => entry.adjustmentOf)!.amount).toBe('-100000');
  });

  it('reloads filed KB with payment/BPE, exports/restores it, then resets all state', async () => {
    let state = initial();
    const run = async (command: Command) => { state = execute(state, command); await saveState(state); };
    await run({ type: 'LOGIN', userId: 'pic' });
    await run({ type: 'ACTIVATE_CERTIFICATE' });
    if (!currentReturn(state)) await run({ type: 'CREATE_RETURN', period: '2026-10' });
    const returnId = currentReturn(state)!.id;
    await run({ type: 'POST_RETURN', returnId });
    await run({ type: 'PREPARE_PAYMENT', returnId });
    await run({ type: 'CREATE_BILLING', returnId, bucket: 'PPN' });
    await run({ type: 'PAY_BILLING', billingId: state.billings.at(-1)!.id });
    await run({ type: 'FILE_RETURN', returnId });
    const loaded = (await loadState())!;
    expect(currentReturn(loaded)!.status).toBe('FILED');
    expect(currentReturn(loaded)!.amounts.III_E).toBe('30000000');
    expect(currentReturn(loaded)!.amounts.status).toBe('KB');
    expect(loaded.receipts.some((receipt) => receipt.type === 'BPE' && receipt.objectId === returnId)).toBe(true);
    const exported = exportState(loaded);
    await replaceState(initial());
    await replaceState(importState(exported));
    expect(await loadState()).toEqual(loaded);
    await replaceState(execute(loaded, { type: 'RESET' }));
    expect(await loadState()).toEqual(initial());
  });
});
