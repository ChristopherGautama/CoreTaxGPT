import { describe, expect, it } from 'vitest';
import {
  BILLING_ACTIVE_HOURS, calculateReturn, calculateTax, compensateChain,
  invoiceApprovalDeadline, isBillingExpired, mapFormSection, money,
  returnDeadline, selectRuleVersion, validateInputCredit,
  type TaxCalculationInput,
} from '../../src/rules/tax';

const basic = { outputVat: '55000000', inputVat: '22000000', compensation: '3000000' };
const eligible = { invoicePeriod: '2026-01', creditPeriod: '2026-04', eligible: true, approved: true, alreadyCredited: false };

describe('PMK 131/2024: legal rate, DPP and exact arithmetic', () => {
  it('Rp100 juta neto has fractional DPP, legal rate 12%, Rp11 juta PPN and Rp111 juta total', () => {
    const tax = calculateTax({ net: '100000000', regime: 'nonLuxury' });
    expect(tax).toMatchObject({ net: '100000000', vat: '11000000', total: '111000000', luxuryTax: '0', statutoryVatRate: '0.12', dppRatio: '11/12', transactionCode: '04' });
    expect(tax.dpp).toMatch(/^91666666\.66666/);
    expect(tax.unroundedVat).toBe('11000000');
    expect(tax.formulaSource).toContain('12%');
  });

  it('extracts Rp100 juta neto from Rp111 juta gross without applying 11/12 to gross', () => {
    expect(calculateTax({ gross: '111000000', regime: 'nonLuxury' })).toMatchObject({ net: '100000000', vat: '11000000', total: '111000000' });
  });

  it('does not round repeating DPP before tax; Rp50 gives VAT Rp5.50 → Rp6', () => {
    const tax = calculateTax({ net: '50', regime: 'nonLuxury' });
    expect(tax.unroundedVat).toBe('5.5');
    expect(tax.vat).toBe('6');
    expect(tax.dpp).toMatch(/^45\.83333/);
  });

  it('preserves values beyond floating-point safe integer range', () => {
    const tax = calculateTax({ net: '900719925474099300', regime: 'nonLuxury' });
    expect(tax.unroundedVat).toBe('99079191802150923');
    expect(tax.total).toBe('999799117276250223');
  });

  it.each([
    ['100.49', '100'], ['100.50', '101'], ['100.499999999999999', '100'],
    ['100.500000000000001', '101'], ['-100.50', '-101'], ['-0.49', '0'], ['0', '0'],
  ])('SPT half-up %s → %s', (value, expected) => {
    expect(money(value)).toBe(expected);
  });

  it.each(['NaN', 'Infinity', '1,000', '', 'Rp100', '1e3'])('rejects malformed monetary string %s', (value) => {
    expect(() => money(value)).toThrow();
  });

  it('rejects negative prices and ambiguous net/gross input', () => {
    expect(() => calculateTax({ net: '-1', regime: 'nonLuxury' })).toThrow('negatif');
    expect(() => calculateTax({ regime: 'nonLuxury' })).toThrow('tepat satu');
    expect(() => calculateTax({ net: '1', gross: '1', regime: 'nonLuxury' })).toThrow('tepat satu');
  });

  it('rejects unsupported treatment, facilities and mismatched code instead of applying a general fallback', () => {
    expect(() => calculateTax({ net: '1000', regime: 'facility' } as unknown as TaxCalculationInput)).toThrow('belum disimulasikan');
    for (const code of ['01', '02', '03', '05', '06', '07', '08', '09', '10']) {
      expect(() => calculateTax({ net: '1000', regime: 'nonLuxury', transactionCode: code })).toThrow('belum didukung');
    }
    expect(() => calculateTax({ net: '1000', regime: 'nonLuxury', ppnbmRate: '0.20' })).toThrow('tidak mengenakan PPnBM');
  });
});

describe('normal SPT calculations retain sign, tax buckets and legal field meanings', () => {
  it('Rp500m sale / Rp200m purchase / Rp3m compensation produces KB Rp30m', () => {
    const output = calculateTax({ net: '500000000', regime: 'nonLuxury' });
    const input = calculateTax({ net: '200000000', regime: 'nonLuxury' });
    expect(calculateReturn({ outputVat: output.vat, inputVat: input.vat, compensation: '3000000' })).toMatchObject({ III_A: '55000000', III_B: '0', III_C: '25000000', III_D: '0', III_E: '30000000', status: 'KB', payableVat: '30000000' });
  });

  it('Rp100m sale / Rp250m purchase produces LB Rp16.5m', () => {
    expect(calculateReturn({ outputVat: '11000000', inputVat: '27500000' })).toMatchObject({ III_E: '-16500000', status: 'LB', payableVat: '0', compensationOut: '16500000' });
  });

  it('Rp200m sale / Rp200m purchase produces NIHIL', () => {
    expect(calculateReturn({ outputVat: '22000000', inputVat: '22000000' })).toMatchObject({ III_E: '0', status: 'NIHIL', payableVat: '0', compensationOut: '0' });
  });

  it('noneligible PM Rp5m is excluded and yields KB Rp35m', () => {
    expect(calculateReturn({ ...basic, inputVat: '17000000' })).toMatchObject({ III_C: '20000000', III_E: '35000000', status: 'KB' });
  });

  it('approved Rp20m October sales return reduces PK Rp2.2m and KB to Rp27.8m', () => {
    const adjustment = calculateTax({ net: '20000000', regime: 'nonLuxury' });
    expect(adjustment.vat).toBe('2200000');
    expect(calculateReturn({ ...basic, outputVat: '52800000' })).toMatchObject({ III_A: '52800000', III_E: '27800000' });
  });

  it('November return of an October sale affects November even without new November outputs', () => {
    expect(calculateReturn(basic).III_E).toBe('30000000');
    expect(calculateReturn({ outputVat: '-2200000', inputVat: '0' })).toMatchObject({ III_A: '-2200000', III_E: '-2200000', status: 'LB', compensationOut: '2200000' });
  });

  it('a purchase return reverses credit in its own period through signed PM aggregation', () => {
    expect(calculateReturn({ outputVat: '0', inputVat: '-2200000' })).toMatchObject({ III_C: '-2200000', III_E: '2200000', status: 'KB' });
  });

  it('III.B is advance, III.C is credit plus compensation, III.D is excess collection', () => {
    expect(calculateReturn({ ...basic, advance: '1000000', excessCollection: '500000' })).toMatchObject({ III_B: '1000000', III_C: '25000000', III_D: '500000', III_E: '28500000' });
  });

  it('normal KB remains KB after payment, while its outstanding amount becomes zero', () => {
    expect(calculateReturn({ ...basic, paidVat: '30000000' })).toMatchObject({ III_E: '30000000', III_F: '0', status: 'KB', payableVat: '0' });
  });

  it('handles signed compensation ledger adjustments without taking absolute values', () => {
    expect(calculateReturn({ outputVat: '11000000', inputVat: '10000000', compensation: '-100000' }).III_E).toBe('1100000');
  });
});

describe('input tax eligibility and credit period', () => {
  it.each(['2026-01', '2026-02', '2026-03', '2026-04'])('January invoice can be credited in %s', (creditPeriod) => {
    expect(() => validateInputCredit({ ...eligible, creditPeriod })).not.toThrow();
  });

  it('May blocks the ordinary route and explains amendment analysis rather than deleting credit rights', () => {
    expect(() => validateInputCredit({ ...eligible, creditPeriod: '2026-05' })).toThrow(/pembetulan.*hak kredit tidak otomatis hilang/);
  });

  it('handles the three following periods across year-end', () => {
    expect(() => validateInputCredit({ ...eligible, invoicePeriod: '2025-11', creditPeriod: '2026-02' })).not.toThrow();
    expect(() => validateInputCredit({ ...eligible, invoicePeriod: '2025-11', creditPeriod: '2026-03' })).toThrow('Jalur biasa');
  });

  it('rejects double credit, noneligible, unapproved and pre-invoice periods distinctly', () => {
    expect(() => validateInputCredit({ ...eligible, alreadyCredited: true })).toThrow('double credit');
    expect(() => validateInputCredit({ ...eligible, eligible: false })).toThrow('Tetap catat sebagai nonkredit');
    expect(() => validateInputCredit({ ...eligible, approved: false })).toThrow('belum disetujui');
    expect(() => validateInputCredit({ ...eligible, creditPeriod: '2025-12' })).toThrow('mendahului');
    expect(() => validateInputCredit({ ...eligible, creditPeriod: '2026-13' })).toThrow('YYYY-MM');
  });
});

describe('billing expiration is exactly 336 hours', () => {
  const issued = '2026-11-15T09:00:00+07:00';
  it('is active at 335h59m, expires at 336h and remains expired', () => {
    expect(BILLING_ACTIVE_HOURS).toBe(336);
    expect(isBillingExpired(issued, '2026-11-29T08:59:00+07:00')).toBe(false);
    expect(isBillingExpired(issued, '2026-11-29T09:00:00+07:00')).toBe(true);
    expect(isBillingExpired(issued, '2026-11-29T09:00:01+07:00')).toBe(true);
  });
  it('uses an instant independent of timezone representation', () => {
    expect(isBillingExpired(issued, '2026-11-29T02:00:00Z')).toBe(true);
    expect(() => isBillingExpired('2026-11-15T09:00:00', '2026-11-29T02:00:00Z')).toThrow('zona waktu');
    expect(() => isBillingExpired('2026-02-30', '2026-11-29T02:00:00Z')).toThrow('tidak valid');
  });
});

describe('PER-12/PJ/2026 signed replacement calculation and compensation chain', () => {
  it('III.E Rp32.2m less paid Rp30m gives additional KB Rp2.2m', () => {
    expect(calculateReturn({ ...basic, outputVat: '57200000', paidVat: '30000000', amendment: true })).toMatchObject({ III_E: '32200000', III_F: '30000000', III_G: '2200000', status: 'KB', payableVat: '2200000' });
  });

  it('III.E Rp24.5m less paid Rp30m gives signed LB Rp5.5m', () => {
    expect(calculateReturn({ ...basic, outputVat: '49500000', paidVat: '30000000', amendment: true })).toMatchObject({ III_E: '24500000', III_F: '30000000', III_G: '-5500000', status: 'LB', payableVat: '0', compensationOut: '5500000' });
  });

  it('refund Rp10m and III.E −Rp8m produces additional KB Rp2m', () => {
    expect(calculateReturn({ outputVat: '0', inputVat: '8000000', refundVat: '10000000', amendment: true })).toMatchObject({ III_E: '-8000000', III_F: '-10000000', III_G: '2000000', status: 'KB', payableVat: '2000000' });
  });

  it('shrinking LB source remains LB and adjusts the carried amount without fictitious KB', () => {
    expect(calculateReturn({ outputVat: '0', inputVat: '100000', amendment: true })).toMatchObject({ III_E: '-100000', III_F: '0', III_G: '-100000', status: 'LB', payableVat: '0' });
    expect(compensateChain({ originalSource: '200000', revisedSource: '100000', forwarded: '300000' })).toBe('200000');
  });

  it('preserves negative ledger adjustments for explicit handling instead of silently clipping them', () => {
    expect(compensateChain({ originalSource: '200000', revisedSource: '0', forwarded: '100000' })).toBe('-100000');
  });

  it('selects the amendment rule using submission date for an August 2026 return', () => {
    expect(selectRuleVersion('2026-08', '2026-09-30')).toBe('PER-11/PJ/2025');
    expect(selectRuleVersion('2026-08', '2026-10-01')).toBe('PER-12/PJ/2026');
    expect(selectRuleVersion('2026-08', '2026-09-30T16:59:59Z')).toBe('PER-11/PJ/2025');
    expect(selectRuleVersion('2026-08', '2026-09-30T17:00:00Z')).toBe('PER-12/PJ/2026');
  });

  it('identifies pre-2025 periods as unsupported legacy and does not apply new rules blindly', () => {
    expect(selectRuleVersion('2024-12', '2026-10-01')).toBe('LEGACY-UNSUPPORTED');
    expect(selectRuleVersion('2025-01', '2026-10-01')).toBe('PER-12/PJ/2026');
  });
});

describe('PPnBM pedagogic producer case stays separate from VAT credit', () => {
  it('Rp1bn sale produces VAT Rp120m, PPnBM Rp200m and total Rp1.32bn', () => {
    expect(calculateTax({ net: '1000000000', regime: 'luxury', ppnbmRate: '0.20' })).toMatchObject({ net: '1000000000', dpp: '1000000000', vat: '120000000', luxuryTax: '200000000', total: '1320000000', dppRatio: '1' });
  });

  it('can extract net from total inclusive of both separate taxes', () => {
    expect(calculateTax({ gross: '1320000000', regime: 'luxury' })).toMatchObject({ net: '1000000000', vat: '120000000', luxuryTax: '200000000' });
  });

  it('input VAT Rp22m reduces VAT only to Rp98m', () => {
    expect(calculateReturn({ outputVat: '120000000', inputVat: '22000000', outputLuxury: '200000000' })).toMatchObject({ III_E: '98000000', VI_A: '200000000', VI_C: '200000000', payableVat: '98000000', payableLuxury: '200000000' });
  });

  it('a VAT credit cannot offset PPnBM payable', () => {
    expect(calculateReturn({ outputVat: '0', inputVat: '22000000', outputLuxury: '200000000' })).toMatchObject({ status: 'KB', payableVat: '0', payableLuxury: '200000000', compensationOut: '22000000' });
  });

  it('VI uses excess collection, payments and SKPLB refunds independently', () => {
    expect(calculateReturn({ outputVat: '0', inputVat: '0', outputLuxury: '200000000', luxuryExcessCollection: '10000000', paidLuxury: '180000000', refundLuxury: '5000000', amendment: true })).toMatchObject({ VI_A: '200000000', VI_B: '10000000', VI_C: '190000000', VI_D: '175000000', VI_E: '15000000', payableLuxury: '15000000' });
  });

  it('does not generalize pedagogical 20% to arbitrary luxury rates', () => {
    expect(() => calculateTax({ net: '1000000', regime: 'luxury', ppnbmRate: '0.40' })).toThrow('belum disimulasikan');
  });
});

describe('form mapping and nominal deadlines', () => {
  it.each([
    ['04', 'I.A.2', 'II.B'], ['05', 'I.A.2', 'II.B'],
    ['01', 'I.A.4', 'II.C'], ['09', 'I.A.4', 'II.C'], ['10', 'I.A.4', 'II.C'],
    ['02', 'I.A.6', 'II.D'], ['03', 'I.A.6', 'II.D'],
  ])('maps code %s to correct output %s and input %s sections', (code, output, input) => {
    expect(mapFormSection('A2', code)).toBe(output);
    expect(mapFormSection('B2', code)).toBe(input);
  });

  it('distinguishes tourist code06, B3 and Pihak Lain attachment C', () => {
    expect(mapFormSection('A1')).toBe('I.A.1');
    expect(mapFormSection('A2', '06')).toBe('I.A.3');
    expect(mapFormSection('B1')).toBe('II.A');
    expect(mapFormSection('B3')).toBe('II.H');
    expect(() => mapFormSection('C')).toThrow('Pasal 32A');
    expect(mapFormSection('C', undefined, true)).toBe('VIII.A');
  });

  it('distinguishes next-month day20 approval from month-end tax deadline', () => {
    expect(invoiceApprovalDeadline('2026-10')).toBe('2026-11-20');
    expect(returnDeadline('2026-10')).toBe('2026-11-30');
    expect(invoiceApprovalDeadline('2026-12')).toBe('2027-01-20');
    expect(returnDeadline('2026-12')).toBe('2027-01-31');
    expect(returnDeadline('2028-01')).toBe('2028-02-29');
    expect(returnDeadline('2027-01')).toBe('2027-02-28');
  });
});
