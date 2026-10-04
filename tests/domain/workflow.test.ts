import { describe, it, expect } from 'vitest';
import { createInitialState } from '../../src/fixtures/scenarios';
import { execute, currentReturn, activeInvoices, availableDeposit, needsRepost, activeRole, type Command, type InvoiceDraft } from '../../src/domain/workflow';
import type { AppState } from '../../src/domain/types';
import Decimal from 'decimal.js';
const login = (scenario = 'kb', userId = 'pic') => execute(createInitialState(scenario), { type: 'LOGIN', userId });
const certified = (scenario = 'kb') => execute(login(scenario), { type: 'ACTIVATE_CERTIFICATE' });
const run = (state: AppState, ...commands: Command[]) => commands.reduce(execute, state);
const draft: InvoiceDraft = { direction: 'OUTPUT', counterparty: 'PT Latihan', date: '2026-10-18', transactionCode: '04', regime: 'nonLuxury', net: '20000000' };
function post(state: AppState): AppState { return execute(state, { type: 'POST_RETURN', returnId: currentReturn(state)!.id }); }
function filed(scenario = 'kb'): AppState {
  let s = post(certified(scenario)); const rid = currentReturn(s)!.id;
  s = execute(s, { type: 'PREPARE_PAYMENT', returnId: rid });
  for (const bucket of ['PPN', 'PPNBM'] as const) {
    const amount = bucket === 'PPN' ? currentReturn(s)!.amounts.payableVat : currentReturn(s)!.amounts.payableLuxury;
    if (new Decimal(amount).gt(0)) { s = execute(s, { type: 'CREATE_BILLING', returnId: rid, bucket }); s = execute(s, { type: 'PAY_BILLING', billingId: s.billings.at(-1)!.id }); }
  }
  return execute(s, { type: 'FILE_RETURN', returnId: rid });
}
function replaceOutput(state: AppState, net: string): AppState {
  let s = execute(state, { type: 'REPLACE_INVOICE', invoiceId: 'SIM-FP-KELUAR-001', invoice: { ...draft, counterparty: state.invoices.find(i => i.id === 'SIM-FP-KELUAR-001')!.counterparty, net } });
  const invoiceId = s.invoices.at(-1)!.id;
  return run(s, { type: 'VALIDATE_INVOICE', invoiceId }, { type: 'SIGN_INVOICE', invoiceId }, { type: 'APPROVE_INVOICE', invoiceId });
}

describe('deterministic workflow / scoped permissions', () => {
  it('drafter may save and validate but direct signing and filing commands are rejected', () => {
    let s = execute(login('kb', 'drafter'), { type: 'CREATE_INVOICE', invoice: draft });
    const invoiceId = s.invoices.at(-1)!.id;
    s = execute(s, { type: 'VALIDATE_INVOICE', invoiceId });
    expect(() => execute(s, { type: 'SIGN_INVOICE', invoiceId })).toThrow('Drafter');
    expect(() => execute(s, { type: 'FILE_RETURN', returnId: currentReturn(s)!.id })).toThrow('Drafter');
    expect(activeRole(s)).toBe('DRAFTER');
  });
  it('scopes invoices, returns, and URL-equivalent commands to active WP', () => {
    const s = execute(login(), { type: 'SWITCH_TAXPAYER', taxpayerId: 'wp-personal' });
    expect(activeInvoices(s)).toEqual([]); expect(currentReturn(s)).toBeUndefined();
    expect(() => execute(s, { type: 'VALIDATE_INVOICE', invoiceId: 'SIM-FP-KELUAR-001' })).toThrow('Wajib Pajak');
    expect(() => execute(s, { type: 'POST_RETURN', returnId: 'SIM-SPT-2026-10-0' })).toThrow('Wajib Pajak');
    expect(() => execute(s, { type: 'CREATE_INVOICE', invoice: draft })).toThrow('PKP');
  });
  it('requires demo certificate, separately validates, signs and approves without mutating prior states', () => {
    const initial = login(); let s = execute(initial, { type: 'CREATE_INVOICE', invoice: draft }); const invoiceId = s.invoices.at(-1)!.id;
    expect(() => execute(s, { type: 'SIGN_INVOICE', invoiceId })).toThrow('KODJP');
    s = run(s, { type: 'ACTIVATE_CERTIFICATE' }, { type: 'VALIDATE_INVOICE', invoiceId }, { type: 'SIGN_INVOICE', invoiceId }, { type: 'APPROVE_INVOICE', invoiceId });
    expect(s.invoices.at(-1)!.status).toBe('APPROVED'); expect(initial.invoices).toHaveLength(2);
    expect(() => execute(s, { type: 'UPDATE_INVOICE', invoiceId, invoice: draft })).toThrow('draft');
    expect(s.audit.at(-1)).toMatchObject({ actorUserId: 'pic', actingTaxpayerId: 'wp-niaga', at: '2026-11-15T09:00:00+07:00' });
  });
  it('stores qty, unit price, discount and derives net using exact decimals', () => {
    const s = execute(login(), { type: 'CREATE_INVOICE', invoice: { ...draft, net: '1', lines: [{ id: 'line-a', description: 'Barang', quantity: '5', unitPrice: '21000000', discount: '5000000' }] } });
    expect(s.invoices.at(-1)).toMatchObject({ net: '100000000', vat: '11000000', total: '111000000' });
  });
});

describe('posting and pedagogic expected results', () => {
  it.each([['kb', '55000000', '25000000', '30000000', 'KB'], ['lb', '11000000', '27500000', '-16500000', 'LB'], ['nihil', '22000000', '22000000', '0', 'NIHIL'], ['noneligible', '55000000', '20000000', '35000000', 'KB']])('%s produces correct totals without posting duplicates', (scenario, pk, pmWithComp, result, status) => {
    const s = post(login(scenario)); const r = currentReturn(s)!; const again = post(s);
    expect(r.amounts).toMatchObject({ III_A: pk, III_C: pmWithComp, III_E: result, status });
    expect(currentReturn(again)!.lineage).toEqual(r.lineage); expect(currentReturn(again)!.amounts).toEqual(r.amounts);
  });
  it('PPnBM remains separate; PM only reduces VAT', () => {
    const r = currentReturn(post(login('ppnbm')))!;
    expect(r.amounts).toMatchObject({ III_A: '120000000', III_C: '22000000', III_E: '98000000', VI_A: '200000000', VI_C: '200000000' });
  });
  it('concept exists automatically and duplicate creation is refused', () => {
    const s = login(); expect(currentReturn(s)?.status).toBe('DRAFT');
    expect(() => execute(s, { type: 'CREATE_RETURN', period: '2026-10' })).toThrow('sudah ada');
    expect(() => execute(s, { type: 'CREATE_RETURN', period: '2026-11' })).toThrow('tanggal 1');
  });
  it('invalid/noncredit states remain recorded; source change requires repost', () => {
    let s = post(login()); s = execute(s, { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'INVALID', creditPeriod: '2026-10', reason: 'Bukan transaksi pembeli' });
    expect(needsRepost(s, currentReturn(s)!)).toBe(true);
    expect(() => execute(s, { type: 'PREPARE_PAYMENT', returnId: currentReturn(s)!.id })).toThrow('Sumber berubah');
    s = post(s); expect(currentReturn(s)!.amounts.III_E).toBe('52000000'); expect(s.invoices).toHaveLength(2);
  });
  it('ordinary January credit permits April, blocks May, and prevents double credit', () => {
    let s = login(); s.invoices[1].date = '2026-01-10'; s.invoices[1].period = '2026-01'; s.decisions = [];
    expect(() => execute(s, { type: 'INPUT_DECISION', invoiceId: s.invoices[1].id, decision: 'CREDIT', creditPeriod: '2026-05', reason: 'Uji' })).toThrow('pembetulan');
    s = execute(s, { type: 'INPUT_DECISION', invoiceId: s.invoices[1].id, decision: 'CREDIT', creditPeriod: '2026-04', reason: 'Syarat formal/material terpenuhi' });
    expect(() => execute(s, { type: 'INPUT_DECISION', invoiceId: s.invoices[1].id, decision: 'CREDIT', creditPeriod: '2026-04', reason: 'Uji ulang' })).toThrow('double credit');
    const denied = login('noneligible'); expect(() => execute(denied, { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-002', decision: 'CREDIT', creditPeriod: '2026-10', reason: 'Uji' })).toThrow('eligible');
  });
});

describe('return, cancellation, and replacement lineage', () => {
  it('October approved return reduces KB to 27.8m; rejection changes no totals; rejects over-return', () => {
    const initial = certified(); let s = execute(initial, { type: 'CREATE_NOTE', invoiceId: 'SIM-FP-KELUAR-001', kind: 'RETURN', date: '2026-10-25', net: '20000000', reason: 'Barang dikembalikan' }); const noteId = s.notes.at(-1)!.id;
    expect(currentReturn(post(s))!.amounts.III_E).toBe('30000000');
    const rejected = execute(s, { type: 'DECIDE_NOTE', noteId, approve: false }); expect(currentReturn(post(rejected))!.amounts.III_E).toBe('30000000');
    s = execute(s, { type: 'DECIDE_NOTE', noteId, approve: true }); expect(currentReturn(post(s))!.amounts.III_E).toBe('27800000');
    expect(() => execute(s, { type: 'CREATE_NOTE', invoiceId: 'SIM-FP-KELUAR-001', kind: 'RETURN', date: '2026-10-26', net: '500000000', reason: 'Berlebih' })).toThrow('melebihi');
  });
  it('November return affects November, never October', () => {
    let s = certified(); s = execute(s, { type: 'CREATE_NOTE', invoiceId: 'SIM-FP-KELUAR-001', kind: 'RETURN', date: '2026-11-10', net: '20000000', reason: 'Retur masa berikutnya' }); s = execute(s, { type: 'DECIDE_NOTE', noteId: s.notes[0].id, approve: true });
    expect(currentReturn(post(s))!.amounts.III_E).toBe('30000000');
    s = run(s, { type: 'SET_CLOCK', clock: '2026-12-01T09:00:00+07:00' }, { type: 'CREATE_RETURN', period: '2026-11' });
    s = execute(s, { type: 'POST_RETURN', returnId: currentReturn(s, '2026-11')!.id }); expect(currentReturn(s, '2026-11')!.amounts.III_E).toBe('-2200000');
  });
  it('replacement keeps original approved snapshot and invoice period', () => {
    const original = certified(); const frozen = structuredClone(original.invoices[0]);
    const s = replaceOutput(original, '520000000'); expect(s.invoices[0]).toEqual(frozen); expect(currentReturn(post(s))!.amounts.III_E).toBe('32200000');
    expect(currentReturn(post(s))!.lineage).not.toContain(frozen.id);
  });
});

describe('billing, deposit, reporting and immutable receipts', () => {
  it('billing is active at 335h59m, expires exactly336h, and cannot be paid expired or twice', () => {
    let s = post(certified()); const returnId = currentReturn(s)!.id;
    s = run(s, { type: 'PREPARE_PAYMENT', returnId }, { type: 'CREATE_BILLING', returnId, bucket: 'PPN' }); const billingId = s.billings[0].id;
    const before = execute(s, { type: 'SET_CLOCK', clock: '2026-11-29T08:59:00+07:00' }); expect(execute(before, { type: 'PAY_BILLING', billingId }).billings[0].status).toBe('PAID');
    const atExpiry = execute(s, { type: 'SET_CLOCK', clock: '2026-11-29T09:00:00+07:00' }); expect(() => execute(atExpiry, { type: 'PAY_BILLING', billingId })).toThrow('expired');
    const paid = execute(s, { type: 'PAY_BILLING', billingId }); expect(() => execute(paid, { type: 'PAY_BILLING', billingId })).toThrow('ulang'); expect(() => execute(paid, { type: 'CANCEL_BILLING', billingId })).toThrow('dibatalkan');
  });
  it('cancel returns to concept; reissue creates a different SIM billing', () => {
    let s = post(certified()); const returnId = currentReturn(s)!.id;
    s = run(s, { type: 'PREPARE_PAYMENT', returnId }, { type: 'CREATE_BILLING', returnId, bucket: 'PPN' }); const billingId = s.billings[0].id;
    s = execute(s, { type: 'CANCEL_BILLING', billingId }); expect(currentReturn(s)!.status).toBe('POSTED');
    s = run(s, { type: 'POST_RETURN', returnId }, { type: 'PREPARE_PAYMENT', returnId }, { type: 'CREATE_BILLING', returnId, bucket: 'PPN' }); expect(s.billings[1].id).not.toBe(billingId);
  });
  it('deposit requires full sum and is allocated with origin; no mixing with billing', () => {
    let s = post(certified()); const returnId = currentReturn(s)!.id;
    s = run(s, { type: 'PREPARE_PAYMENT', returnId }, { type: 'ADD_DEPOSIT', amount: '10000000', source: 'Fixture deposit1' });
    expect(() => execute(s, { type: 'PAY_DEPOSIT', returnId })).toThrow('cukup');
    s = execute(s, { type: 'ADD_DEPOSIT', amount: '20000000', source: 'Fixture deposit2' }); s = execute(s, { type: 'PAY_DEPOSIT', returnId });
    expect(availableDeposit(s)).toBe('0'); expect(s.allocations).toHaveLength(2); expect(s.payments[0].amount).toBe('30000000'); expect(currentReturn(s)!.amounts.status).toBe('KB');
  });
  it.each(['kb', 'lb', 'nihil', 'ppnbm'])('files %s only after ready, stores BPE and immutable return', scenario => {
    const initial = post(certified(scenario)); const returnId = currentReturn(initial)!.id;
    expect(initial.receipts.filter(r => r.objectId === returnId)).toEqual([]);
    expect(() => execute(initial, { type: 'FILE_RETURN', returnId })).toThrow('siap lapor');
    const s = filed(scenario); expect(currentReturn(s)!.status).toBe('FILED'); expect(s.receipts.some(r => r.type === 'BPE' && r.objectId === returnId)).toBe(true);
    expect(() => execute(s, { type: 'POST_RETURN', returnId })).toThrow('immutable'); expect(() => execute(s, { type: 'FILE_RETURN', returnId })).toThrow('immutable');
  });
});

describe('signed amendments and compensation chain', () => {
  it.each([['520000000', '32200000', '2200000', 'KB'], ['450000000', '24500000', '-5500000', 'LB']])('net%s revises paid return using signed balance', (net, expectedE, expectedG, status) => {
    const original = filed(); const oldReturn = structuredClone(currentReturn(original)!); let s = replaceOutput(original, net);
    s = execute(s, { type: 'AMEND_RETURN', returnId: oldReturn.id }); s = post(s);
    expect(currentReturn(s)!.amounts).toMatchObject({ III_E: expectedE, III_F: '30000000', III_G: expectedG, status });
    expect(s.returns.find(r => r.id === oldReturn.id)).toEqual(oldReturn);
  });
  it('refund10m with E-8m creates additional2m and no advance double count', () => {
    let s = filed('lb'); const oldReturn = currentReturn(s)!; s = execute(s, { type: 'AMEND_RETURN', returnId: oldReturn.id });
    s = replaceOutput(s, '177272727.2727272727272727272727272727272727272727272727');
    s = execute(s, { type: 'SET_RETURN_FIELDS', returnId: currentReturn(s)!.id, fields: { refundVat: '10000000' } });
    s = post(s); expect(currentReturn(s)!.amounts).toMatchObject({ III_E: '-8000000', III_F: '-10000000', III_G: '2000000' });
  });
  it('August historical normal is filed; Sep30 amendment guarded and Oct1 gets new pack', () => {
    let s = certified(); s = execute(s, { type: 'SET_CLOCK', clock: '2026-09-30T23:59:59+07:00' });
    s = execute(s, { type: 'AMEND_RETURN', returnId: 'SIM-SPT-2026-08-0' }); const returnId = currentReturn(s, '2026-08')!.id;
    expect(currentReturn(s, '2026-08')!.legalRuleVersion).toBe('PER-11/PJ/2025'); expect(() => execute(s, { type: 'POST_RETURN', returnId })).toThrow('aturan lama');
    s = run(s, { type: 'SET_CLOCK', clock: '2026-10-01T00:00:00+07:00' }, { type: 'POST_RETURN', returnId }); expect(currentReturn(s, '2026-08')!.legalRuleVersion).toBe('PER-12/PJ/2026');
  });
  it('official chain preserves source history and adjusts December300k by -100k to200k without KB', () => {
    const initial = certified('compensation'); const s = execute(initial, { type: 'COMPENSATION_ADJUST' });
    const december = s.compensations.filter(c => c.targetPeriod === '2026-12').reduce((n, c) => n.plus(c.amount), new Decimal(0));
    expect(december.toFixed()).toBe('200000'); expect(s.compensations.at(-1)!.amount).toBe('-100000');
    expect(currentReturn(s)!.amounts).toMatchObject({ III_G: '-100000', status: 'LB' });
    expect(s.returns.find(r => r.id === 'SIM-OFFICIAL-OCT-2026')).toEqual(initial.returns.find(r => r.id === 'SIM-OFFICIAL-OCT-2026'));
    expect(() => execute(s, { type: 'COMPENSATION_ADJUST' })).toThrow('tidak digandakan');
  });
});

describe('preserved decision history and sources after settlement', () => {
  it('credit corrections require amendment and preserve old filed decision lineage', () => {
    let s = filed(); const normal = currentReturn(s)!; const originalDecision = s.decisions[0];
    expect(() => execute(s, { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'NONCREDIT', creditPeriod: '2026-10', reason: 'Koreksi syarat formal' })).toThrow('pembetulan');
    s = execute(s, { type: 'AMEND_RETURN', returnId: normal.id });
    s = execute(s, { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'NONCREDIT', creditPeriod: '2026-10', reason: 'Koreksi syarat formal' });
    expect(s.decisions).toHaveLength(2); expect(s.decisions[0]).toEqual(originalDecision); expect(s.decisions[1].previousId).toBe(originalDecision.id);
    s = post(s); expect(currentReturn(s)!.amounts.III_G).toBe('22000000'); expect(s.returns.find(r => r.id === normal.id)!.lineage).toContain(originalDecision.id);
  });
  it('cannot strand paid draft by accepting changed source before filing', () => {
    let s = post(certified()); const returnId = currentReturn(s)!.id;
    s = run(s, { type: 'PREPARE_PAYMENT', returnId }, { type: 'CREATE_BILLING', returnId, bucket: 'PPN' }); s = execute(s, { type: 'PAY_BILLING', billingId: s.billings[0].id });
    s = execute(s, { type: 'CREATE_NOTE', invoiceId: 'SIM-FP-KELUAR-001', kind: 'RETURN', date: '2026-10-25', net: '20000000', reason: 'Retur' });
    expect(() => execute(s, { type: 'DECIDE_NOTE', noteId: s.notes[0].id, approve: true })).toThrow('belum dilaporkan');
    expect(execute(s, { type: 'FILE_RETURN', returnId }).returns.find(r => r.id === returnId)!.status).toBe('FILED');
  });
  it('PPnBM has separate immutable posted liability in the ledger', () => {
    const s = filed('ppnbm'); const entries = s.ledger.filter(e => e.kind === 'LIABILITY');
    expect(entries.find(e => e.description.startsWith('Kewajiban PPN SPT'))!.debit).toBe('98000000');
    expect(entries.find(e => e.description.startsWith('Kewajiban PPnBM SPT'))!.debit).toBe('200000000');
  });
  it('changing compensation source marks existing draft stale and posting takes ledger sum', () => {
    let s = certified('compensation'); s = execute(s, { type: 'SET_CLOCK', clock: '2027-01-01T09:00:00+07:00' }); s = execute(s, { type: 'CREATE_RETURN', period: '2026-12' }); const returnId = currentReturn(s, '2026-12')!.id;
    s = execute(s, { type: 'POST_RETURN', returnId }); expect(currentReturn(s, '2026-12')!.compensation).toBe('300000');
    s = execute(s, { type: 'COMPENSATION_ADJUST' }); expect(needsRepost(s, returnId)).toBe(true);
    s = execute(s, { type: 'POST_RETURN', returnId }); expect(currentReturn(s, '2026-12')!.compensation).toBe('200000');
  });
});

describe('validation of time and submitted learning answers', () => {
  it('rejects invalid calendar dates and clocks without explicit timezone', () => {
    const s = login();
    expect(() => execute(s, { type: 'SET_CLOCK', clock: '2026-11-15T09:00' })).toThrow('zona waktu');
    expect(() => execute(s, { type: 'CREATE_INVOICE', invoice: { ...draft, date: '2026-02-31' } })).toThrow('Tanggal');
    expect(() => execute(s, { type: 'SET_CLOCK', clock: '2026-02-31T09:00:00+07:00' })).toThrow('Tanggal');
  });
  it('does not turn a decimal answer into a different order of magnitude', () => {
    const s = login();
    expect(execute(s, { type: 'GRADE', answers: { ppn: '300000.00', ppnbm: '0', status: 'KB' } }).learning.lastScore).toBe(67);
    expect(execute(s, { type: 'GRADE', answers: { ppn: '30000000', ppnbm: '0', status: ' kb ' } }).learning.lastScore).toBe(100);
  });
});

describe('filing date selects rule version and preserves pre-rounding taxes', () => {
  it('normal posted September30 and filed October1 persists the filing-date rule', () => {
    let s = execute(certified(), { type: 'SET_CLOCK', clock: '2026-09-30T23:59:59+07:00' });
    s = execute(s, { type: 'CREATE_RETURN', period: '2026-07' }); const returnId = currentReturn(s, '2026-07')!.id;
    s = run(s, { type: 'POST_RETURN', returnId }, { type: 'PREPARE_PAYMENT', returnId });
    expect(currentReturn(s, '2026-07')!.legalRuleVersion).toBe('PER-11/PJ/2025');
    s = run(s, { type: 'SET_CLOCK', clock: '2026-10-01T00:00:00+07:00' }, { type: 'FILE_RETURN', returnId });
    expect(currentReturn(s, '2026-07')!).toMatchObject({ status: 'FILED', legalRuleVersion: 'PER-12/PJ/2026', submittedAt: '2026-10-01T00:00:00+07:00' });
  });
  it('rejects filing an amendment after rewinding clock into unsupported legacy rules', () => {
    let s = execute(certified(), { type: 'SET_CLOCK', clock: '2026-10-01T00:00:00+07:00' });
    s = execute(s, { type: 'AMEND_RETURN', returnId: 'SIM-SPT-2026-08-0' }); const returnId = currentReturn(s, '2026-08')!.id;
    s = run(s, { type: 'POST_RETURN', returnId }, { type: 'PREPARE_PAYMENT', returnId }, { type: 'SET_CLOCK', clock: '2026-09-30T23:59:59+07:00' });
    const snapshot = structuredClone(s);
    expect(() => execute(s, { type: 'FILE_RETURN', returnId })).toThrow('Tanggal penyampaian pembetulan');
    expect(s).toEqual(snapshot); expect(s.receipts.some(r => r.objectId === returnId)).toBe(false);
  });
  it('also rejects the compensation teaching shortcut under an unsupported filing-date rule', () => {
    const s = execute(certified('compensation'), { type: 'SET_CLOCK', clock: '2026-09-30T23:59:59+07:00' });
    expect(() => execute(s, { type: 'COMPENSATION_ADJUST' })).toThrow('Tanggal penyampaian pembetulan kompensasi');
  });
  it('persists both pre-rounding tax values in fixtures and newly created invoices', () => {
    expect(createInitialState('ppnbm').invoices[0]).toMatchObject({ unroundedVat: '120000000', unroundedLuxuryTax: '200000000' });
    const s = execute(login(), { type: 'CREATE_INVOICE', invoice: { ...draft, regime: 'luxury', transactionCode: '01', ppnbmRate: '0.20', net: '2.75' } });
    expect(s.invoices.at(-1)).toMatchObject({ unroundedVat: '0.33', unroundedLuxuryTax: '0.55', vat: '0', luxuryTax: '1' });
  });
});
