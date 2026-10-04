import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { createInitialState } from '../../src/fixtures/scenarios';
import { currentReturn, execute, type Command, type InvoiceDraft } from '../../src/domain/workflow';
import type { AppState } from '../../src/domain/types';

const baseDraft: InvoiceDraft = { direction: 'OUTPUT', counterparty: 'PT Pelanggan Latihan Sejahtera', date: '2026-10-18', transactionCode: '04', regime: 'nonLuxury', net: '500000000' };
const run = (state: AppState, ...commands: Command[]) => commands.reduce(execute, state);
const initial = (scenario = 'kb') => run(createInitialState(scenario), { type: 'LOGIN', userId: 'pic' }, { type: 'ACTIVATE_CERTIFICATE' });
const rid = (state: AppState, period = '2026-10') => currentReturn(state, period)!.id;
function issue(state: AppState, invoice: InvoiceDraft, originalId?: string): AppState {
  let next = originalId
    ? execute(state, { type: 'REPLACE_INVOICE', invoiceId: originalId, invoice })
    : execute(state, { type: 'CREATE_INVOICE', invoice });
  const invoiceId = next.invoices.at(-1)!.id;
  next = run(next, { type: 'VALIDATE_INVOICE', invoiceId }, { type: 'SIGN_INVOICE', invoiceId }, { type: 'APPROVE_INVOICE', invoiceId });
  return next;
}
function settle(state: AppState, period = '2026-10', file = true): AppState {
  const returnId = rid(state, period);
  let next = run(state, { type: 'POST_RETURN', returnId }, { type: 'PREPARE_PAYMENT', returnId });
  if (currentReturn(next, period)!.status === 'AWAITING_PAYMENT') {
    next = run(next, { type: 'ADD_DEPOSIT', amount: '1000000000', source: 'Fixture deposit regression' }, { type: 'PAY_DEPOSIT', returnId });
  }
  return file ? execute(next, { type: 'FILE_RETURN', returnId }) : next;
}

describe('independent regression review: immutable documents and periods', () => {
  it('requires cancellation rather than replacement when buyer identity changes', () => {
    const state = initial();
    expect(() => execute(state, { type: 'REPLACE_INVOICE', invoiceId: 'SIM-FP-KELUAR-001', invoice: { ...baseDraft, counterparty: 'PT Pembeli Berbeda' } })).toThrow();
  });

  it('does not allow a pending return of the old invoice to coexist with an incompatible replacement', () => {
    const state = execute(initial(), { type: 'CREATE_NOTE', invoiceId: 'SIM-FP-KELUAR-001', kind: 'RETURN', date: '2026-10-20', net: '200000000', reason: 'Retur barang menunggu persetujuan' });
    expect(() => execute(state, { type: 'REPLACE_INVOICE', invoiceId: 'SIM-FP-KELUAR-001', invoice: { ...baseDraft, net: '100000000' } })).toThrow();
  });

  it('keeps the legally assumed PPnBM rate in the saved invoice when the caller uses its supported default', () => {
    const state = execute(initial(), { type: 'CREATE_INVOICE', invoice: { ...baseDraft, regime: 'luxury', transactionCode: '01', net: '1000000000' } });
    expect(state.invoices.at(-1)).toMatchObject({ ppnbmRate: '0.20', luxuryTax: '200000000' });
  });

  it('rejects calendar dates that Date.parse would normalize into a different day', () => {
    expect(() => execute(initial(), { type: 'CREATE_INVOICE', invoice: { ...baseDraft, date: '2026-02-30' } })).toThrow();
  });

  it('approved partial returns cannot refund more VAT than the source invoice', () => {
    let state = issue(initial(), { ...baseDraft, net: '10' });
    const invoiceId = state.invoices.at(-1)!.id;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      state = execute(state, { type: 'CREATE_NOTE', invoiceId, kind: 'RETURN', date: '2026-10-25', net: '5', reason: 'Dua bagian retur sah mencakup seluruh transaksi' });
      state = execute(state, { type: 'DECIDE_NOTE', noteId: state.notes.at(-1)!.id, approve: true });
    }
    const returnedVat = state.notes.filter(n => n.invoiceId === invoiceId).reduce((sum, n) => sum.plus(n.vat), new Decimal(0));
    expect(returnedVat.toFixed()).toBe('1');
  });
});

describe('independent regression review: PM, payment and correction integrity', () => {
  it('cannot credit November while an effective filed October SPT still claims the same PM', () => {
    let state = settle(initial());
    state = execute(state, { type: 'AMEND_RETURN', returnId: rid(state) });
    state = execute(state, { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'NONCREDIT', creditPeriod: '2026-10', reason: 'Rencana memindahkan kredit melalui pembetulan' });
    expect(() => execute(state, { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'CREDIT', creditPeriod: '2026-11', reason: 'SPT Oktober pembetulan belum dilaporkan' })).toThrow();
  });

  it('blocks unsupported later-period credit after an earlier approved purchase return', () => {
    let state = execute(initial(), { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'NONCREDIT', creditPeriod: '2026-10', reason: 'Belum dipilih kredit' });
    state = execute(state, { type: 'CREATE_NOTE', invoiceId: 'SIM-FP-MASUK-001', kind: 'RETURN', date: '2026-10-25', net: '20000000', reason: 'Barang sudah dikembalikan sebelum dipilih kredit' });
    state = execute(state, { type: 'DECIDE_NOTE', noteId: state.notes.at(-1)!.id, approve: true });
    expect(() => execute(state, { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'CREDIT', creditPeriod: '2026-11', reason: 'Tidak boleh mencatat gross credit masa berikutnya tanpa rekonsiliasi retur' })).toThrow();
  });

  it('cannot bypass cancellation credit-period restrictions by changing the decision after note creation', () => {
    let state = execute(initial(), { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'NONCREDIT', creditPeriod: '2026-10', reason: 'Belum kredit' });
    state = execute(state, { type: 'CREATE_NOTE', invoiceId: 'SIM-FP-MASUK-001', kind: 'CANCEL', date: '2026-10-25', net: '200000000', reason: 'Pembatalan transaksi' });
    const noteId = state.notes.at(-1)!.id;
    expect(() => run(state,
      { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'CREDIT', creditPeriod: '2026-11', reason: 'Perubahan setelah konsep pembatalan' },
      { type: 'DECIDE_NOTE', noteId, approve: true },
    )).toThrow();
  });

  it('cannot approve an October input replacement that would strand a paid November return', () => {
    let state = initial();
    state = execute(state, { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'NONCREDIT', creditPeriod: '2026-10', reason: 'Belum dipilih untuk kredit' });
    state = execute(state, { type: 'INPUT_DECISION', invoiceId: 'SIM-FP-MASUK-001', decision: 'CREDIT', creditPeriod: '2026-11', reason: 'Kredit sah satu masa berikutnya' });
    state = issue(state, { ...baseDraft, date: '2026-11-15' });
    state = run(state, { type: 'SET_CLOCK', clock: '2026-12-01T09:00:00+07:00' }, { type: 'CREATE_RETURN', period: '2026-11' });
    state = settle(state, '2026-11', false);
    state = execute(state, { type: 'REPLACE_INVOICE', invoiceId: 'SIM-FP-MASUK-001', invoice: { ...baseDraft, direction: 'INPUT', counterparty: 'PT Pemasok Simulasi Mandiri', net: '210000000' } });
    const invoiceId = state.invoices.at(-1)!.id;
    state = run(state, { type: 'VALIDATE_INVOICE', invoiceId }, { type: 'SIGN_INVOICE', invoiceId });
    expect(() => execute(state, { type: 'APPROVE_INVOICE', invoiceId })).toThrow();
    expect(execute(state, { type: 'FILE_RETURN', returnId: rid(state, '2026-11') }).returns.find(r => r.id === rid(state, '2026-11'))?.status).toBe('FILED');
  });

  it('re-amendment posts the change in liability, not the whole cumulative refundable balance again', () => {
    let state = settle(initial());
    state = execute(state, { type: 'AMEND_RETURN', returnId: rid(state) });
    state = issue(state, { ...baseDraft, net: '450000000' }, 'SIM-FP-KELUAR-001');
    state = settle(state);
    const replacementId = state.invoices.at(-1)!.id;
    state = execute(state, { type: 'AMEND_RETURN', returnId: rid(state) });
    state = issue(state, { ...baseDraft, net: '454545454.5454545454545454545454545454545454545454545454545' }, replacementId);
    state = settle(state);
    expect(currentReturn(state)!.amounts.III_E).toBe('25000000');
    const taxLiability = state.ledger.filter(e => e.kind === 'LIABILITY' && e.description.startsWith('Kewajiban PPN SPT 2026-10')).reduce((sum, entry) => sum.plus(entry.debit).minus(entry.credit), new Decimal(0));
    expect(taxLiability.toFixed()).toBe('25000000');
    const novemberCredit = state.compensations.filter(c => c.targetPeriod === '2026-11').reduce((sum, c) => sum.plus(c.amount), new Decimal(0));
    expect(novemberCredit.toFixed()).toBe('5000000');
  });

  it('allows finishing separate tax buckets after one is paid and the other billing is cancelled', () => {
    let state = initial('ppnbm');
    const returnId = rid(state);
    state = run(state, { type: 'POST_RETURN', returnId }, { type: 'PREPARE_PAYMENT', returnId }, { type: 'CREATE_BILLING', returnId, bucket: 'PPN' }, { type: 'CREATE_BILLING', returnId, bucket: 'PPNBM' });
    const vatBillingId = state.billings[0].id;
    const luxuryBillingId = state.billings[1].id;
    state = execute(state, { type: 'PAY_BILLING', billingId: vatBillingId });
    state = execute(state, { type: 'CANCEL_BILLING', billingId: luxuryBillingId });
    state = run(state, { type: 'PREPARE_PAYMENT', returnId }, { type: 'CREATE_BILLING', returnId, bucket: 'PPNBM' });
    state = execute(state, { type: 'PAY_BILLING', billingId: state.billings.at(-1)!.id });
    state = execute(state, { type: 'FILE_RETURN', returnId });
    expect(currentReturn(state)!.status).toBe('FILED');
    expect(state.payments.map(p => p.amount).sort()).toEqual(['200000000', '98000000']);
    expect(new Set(state.payments.map(p => p.id)).size).toBe(2);
  });

  it('an advance is deducted once across normal payment and the replacement return', () => {
    let state = execute(initial(), { type: 'SET_RETURN_FIELDS', returnId: rid(initial()), fields: { advance: '5000000' } });
    state = settle(state);
    expect(state.payments[0].amount).toBe('25000000');
    state = execute(state, { type: 'AMEND_RETURN', returnId: rid(state) });
    state = issue(state, { ...baseDraft, net: '520000000' }, 'SIM-FP-KELUAR-001');
    state = execute(state, { type: 'POST_RETURN', returnId: rid(state) });
    expect(currentReturn(state)!.amounts).toMatchObject({ III_B: '5000000', III_E: '27200000', III_F: '25000000', III_G: '2200000' });
  });

  it('re-amendment follows compensation already carried through December to its unused January destination', () => {
    let state = execute(initial('compensation'), { type: 'COMPENSATION_ADJUST' });
    state = run(state, { type: 'SET_CLOCK', clock: '2027-01-01T09:00:00+07:00' }, { type: 'CREATE_RETURN', period: '2026-12' });
    state = settle(state, '2026-12');
    const decemberSnapshot = structuredClone(currentReturn(state, '2026-12'));
    state = execute(state, { type: 'AMEND_RETURN', returnId: rid(state) });
    // The special example has no transaction fixtures; posting this next version
    // revises the October source entitlement to zero and must append a -100k adjustment.
    state = settle(state);
    const january = state.compensations.filter(c => c.targetPeriod === '2027-01').reduce((sum, c) => sum.plus(c.amount), new Decimal(0));
    expect(january.toFixed()).toBe('100000');
    expect(currentReturn(state, '2026-12')).toEqual(decemberSnapshot);
  });
});
