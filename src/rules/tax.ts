import Decimal from 'decimal.js';

// A local Decimal constructor keeps this module independent of application-global
// configuration. DPP 11/12 remains fractional; tax is evaluated as a rational
// expression before rounding the final SPT amount.
const D = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });

export const RULE_EVIDENCE = Object.freeze({
  cutoff: '2026-10-04',
  statutoryVatRate: '0.12',
  nonLuxuryDppNumerator: '11',
  nonLuxuryDppDenominator: '12',
  rounding: 'PER-11/PJ/2025, Lampiran, halaman PDF 190: rupiah penuh, half-up',
  tax: 'PMK 131/2024 Pasal 2–3; klasifikasi PPnBM latihan merupakan ASSUMPTION',
  amendment: 'Materi resmi PER-12/PJ/2026, halaman PDF 39–44',
  compensation: 'Materi resmi PER-12/PJ/2026, halaman PDF 45–49',
  billing: 'PER-8/PJ/2026: 336 jam sejak penerbitan',
});

function decimal(value: string | number, label = 'Nilai'): Decimal {
  if ((typeof value === 'number' && !Number.isFinite(value)) || !/^-?\d+(?:\.\d+)?$/.test(String(value))) {
    throw new Error(`${label} harus berupa angka desimal hingga tanpa pemisah ribuan.`);
  }
  const result = new D(value);
  if (!result.isFinite()) throw new Error(`${label} tidak valid.`);
  return result;
}

function nonnegative(value: string | number, label: string): Decimal {
  const result = decimal(value, label);
  if (result.isNegative() && !result.isZero()) throw new Error(`${label} tidak boleh negatif.`);
  return result;
}

function amount(value: Decimal): string {
  return value.isZero() ? '0' : value.toFixed();
}

/** SPT rounding only. Production invoice rounding has not been verified. */
export function money(value: string | number): string {
  return amount(decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
}

export interface TaxCalculationInput {
  net?: string;
  gross?: string;
  regime: 'nonLuxury' | 'luxury';
  /** Fraction, e.g. "0.20". Only the explicitly assumed 20% teaching case is supported. */
  ppnbmRate?: string;
  transactionCode?: string;
}

export interface TaxCalculation {
  net: string;
  dpp: string;
  vat: string;
  luxuryTax: string;
  total: string;
  unroundedVat: string;
  unroundedLuxuryTax: string;
  statutoryVatRate: string;
  dppRatio: string;
  transactionCode: string;
  legalRuleVersion: string;
  formulaSource: string;
}

export function calculateTax(input: TaxCalculationInput): TaxCalculation {
  if (input.regime !== 'nonLuxury' && input.regime !== 'luxury') {
    throw new Error('Rezim pajak ini belum disimulasikan. Tidak digunakan fallback rumus umum.');
  }
  if ((input.net === undefined) === (input.gross === undefined)) {
    throw new Error('Isi tepat satu harga: harga neto atau harga termasuk pajak.');
  }
  const nonLuxury = input.regime === 'nonLuxury';
  const transactionCode = input.transactionCode ?? (nonLuxury ? '04' : '01');
  if (transactionCode !== (nonLuxury ? '04' : '01')) {
    throw new Error(`Kode ${transactionCode} belum didukung untuk rezim ini. Latihan nonmewah umum DPP nilai lain memakai 04; contoh produsen BKP mewah memakai 01. Prioritas kode mengikuti fakta transaksi, bukan tarif saja.`);
  }
  const luxuryRate = nonnegative(input.ppnbmRate ?? (nonLuxury ? '0' : '0.20'), 'Tarif PPnBM');
  if (nonLuxury && !luxuryRate.isZero()) {
    throw new Error('Rezim nonmewah umum tidak mengenakan PPnBM.');
  }
  if (!nonLuxury && !luxuryRate.eq('0.20')) {
    throw new Error('Hanya asumsi PPnBM pedagogis 20% yang dispesifikasi; tarif dan klasifikasi lain belum disimulasikan.');
  }

  const vatRate = new D(RULE_EVIDENCE.statutoryVatRate);
  const ratioNumerator = new D(nonLuxury ? '11' : '12');
  const ratioDenominator = new D('12');
  // Gross is divided by (1 + VAT rate × DPP ratio + PPnBM rate).
  const grossFactor = new D(1).plus(vatRate.mul(ratioNumerator).div(ratioDenominator)).plus(luxuryRate);
  const net = input.net !== undefined
    ? nonnegative(input.net, 'Harga neto')
    : nonnegative(input.gross!, 'Harga termasuk pajak').div(grossFactor);
  const dpp = net.mul(ratioNumerator).div(ratioDenominator);
  // Multiplication precedes division so repeating DPP decimals cannot introduce
  // an early-rounding error (and the legal rate remains explicitly 12%).
  const unroundedVat = net.mul(ratioNumerator).mul(vatRate).div(ratioDenominator);
  const unroundedLuxuryTax = net.mul(luxuryRate);
  const vat = money(amount(unroundedVat));
  const luxuryTax = money(amount(unroundedLuxuryTax));

  return {
    net: amount(net), dpp: amount(dpp), vat, luxuryTax,
    total: amount(net.plus(vat).plus(luxuryTax)),
    unroundedVat: amount(unroundedVat), unroundedLuxuryTax: amount(unroundedLuxuryTax),
    statutoryVatRate: RULE_EVIDENCE.statutoryVatRate,
    dppRatio: nonLuxury ? '11/12' : '1', transactionCode,
    legalRuleVersion: nonLuxury ? 'PMK-131/2024-nonLuxury' : 'PMK-131/2024-luxury-PEDAGOGIS-20',
    formulaSource: nonLuxury
      ? 'PMK 131/2024 Pasal 3: DPP nilai lain = 11/12 × harga neto; PPN = 12% × DPP. Pembulatan SPT: Lampiran PER-11/PJ/2025 PDF 190.'
      : 'PMK 131/2024 Pasal 2: PPN = 12% × harga neto. ASSUMPTION: produsen, BKP sah tergolong mewah, PPnBM latihan 20%; bukan tarif semua barang mahal.',
  };
}

export interface ReturnCalculationInput {
  outputVat: string;
  inputVat: string;
  compensation?: string;
  advance?: string;
  excessCollection?: string;
  outputLuxury?: string;
  /** Legacy API alias for VI.B (kelebihan pemungutan), NOT a PPnBM advance. */
  luxuryAdvance?: string;
  luxuryExcessCollection?: string;
  /** Relevant paid amounts allocated to the prior obligation; exclude any same
   * payment already credited in III.B. Ledger must enforce unique allocation. */
  paidVat?: string;
  refundVat?: string;
  paidLuxury?: string;
  refundLuxury?: string;
  amendment?: boolean;
}

export interface ReturnCalculation {
  III_A: string; III_B: string; III_C: string; III_D: string;
  III_E: string; III_F: string; III_G: string;
  VI_A: string; VI_B: string; VI_C: string; VI_D: string; VI_E: string;
  status: 'KB' | 'LB' | 'NIHIL';
  payableVat: string; payableLuxury: string; compensationOut: string;
}

export function calculateReturn(input: ReturnCalculationInput): ReturnCalculation {
  const whole = (value: string | undefined, label: string): Decimal => new D(money(amount(nonnegative(value ?? '0', label))));
  // Aggregates can be negative when approved return notes in this period
  // reverse invoices from an earlier period. Transaction prices stay positive;
  // workflow lineage, approval and period checks authorize the signed adjustment.
  const signedWhole = (value: string | undefined): Decimal => new D(money(value ?? '0'));
  const III_A = signedWhole(input.outputVat);
  const III_B = whole(input.advance, 'PPN disetor di muka');
  const III_C = signedWhole(input.inputVat).plus(money(input.compensation ?? '0'));
  const III_D = whole(input.excessCollection, 'Kelebihan pemungutan PPN');
  const III_E = III_A.minus(III_B).minus(III_C).minus(III_D);
  const paidVat = whole(input.paidVat, 'Setoran PPN');
  const refundVat = whole(input.refundVat, 'Pengembalian PPN melalui SKPPKP');
  const III_F = input.amendment ? paidVat.minus(refundVat) : new D(0);
  const III_G = III_E.minus(III_F);
  const VI_A = signedWhole(input.outputLuxury);
  if (input.luxuryAdvance !== undefined && input.luxuryExcessCollection !== undefined) {
    throw new Error('VI.B diisi satu kali sebagai kelebihan pemungutan PPnBM.');
  }
  const VI_B = whole(input.luxuryExcessCollection ?? input.luxuryAdvance, 'Kelebihan pemungutan PPnBM');
  const VI_C = VI_A.minus(VI_B);
  const paidLuxury = whole(input.paidLuxury, 'Setoran PPnBM');
  const refundLuxury = whole(input.refundLuxury, 'Pengembalian PPnBM melalui SKPLB');
  const VI_D = input.amendment ? paidLuxury.minus(refundLuxury) : new D(0);
  const VI_E = VI_C.minus(VI_D);
  const vatResult = input.amendment ? III_G : III_E;
  const luxuryResult = input.amendment ? VI_E : VI_C;
  // Separate buckets: an excess VAT credit cannot pay PPnBM. Status describes
  // the return calculation; settling KB does not convert the return to NIHIL.
  const status = vatResult.gt(0) || luxuryResult.gt(0) ? 'KB'
    : vatResult.lt(0) || luxuryResult.lt(0) ? 'LB' : 'NIHIL';
  const outstandingVat = input.amendment ? III_G : III_E.minus(paidVat).plus(refundVat);
  const outstandingLuxury = input.amendment ? VI_E : VI_C.minus(paidLuxury).plus(refundLuxury);
  return {
    III_A: amount(III_A), III_B: amount(III_B), III_C: amount(III_C), III_D: amount(III_D),
    III_E: amount(III_E), III_F: amount(III_F), III_G: amount(III_G),
    VI_A: amount(VI_A), VI_B: amount(VI_B), VI_C: amount(VI_C), VI_D: amount(VI_D), VI_E: amount(VI_E),
    status,
    payableVat: amount(D.max(0, outstandingVat)),
    payableLuxury: amount(D.max(0, outstandingLuxury)),
    compensationOut: amount(D.max(0, vatResult.neg())),
  };
}

function periodIndex(period: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Masa harus berformat YYYY-MM.');
  const [year, month] = period.split('-').map(Number);
  return year! * 12 + month! - 1;
}

export interface InputCreditCheck {
  invoicePeriod: string;
  creditPeriod: string;
  eligible: boolean;
  approved: boolean;
  alreadyCredited: boolean;
}

export function validateInputCredit(input: InputCreditCheck): void {
  const months = periodIndex(input.creditPeriod) - periodIndex(input.invoicePeriod);
  if (input.alreadyCredited) throw new Error('Pajak Masukan sudah dikreditkan; double credit ditolak.');
  if (!input.approved) throw new Error('Dokumen belum disetujui. Status dokumen harus diperiksa sebelum pengkreditan.');
  if (!input.eligible) throw new Error('Pajak Masukan tidak eligible: syarat material/formal belum terpenuhi. Tetap catat sebagai nonkredit.');
  if (months < 0) throw new Error('Masa kredit tidak boleh mendahului masa faktur.');
  if (months > 3) {
    throw new Error('Jalur biasa hanya masa faktur dan tiga masa berikutnya. Faktur Januari dapat dikreditkan Januari–April. Untuk Mei atau sesudahnya, analisis jalur pembetulan dan syarat terkait; hak kredit tidak otomatis hilang.');
  }
}

function instant(value: string): number {
  // Require explicit timezone for instants; date-only values are deterministic UTC.
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw new Error('Waktu harus ISO dengan zona waktu eksplisit atau tanggal YYYY-MM-DD.');
  }
  const time = Date.parse(value);
  const civilDate = value.slice(0, 10);
  const normalizedDate = new Date(`${civilDate}T00:00:00Z`);
  if (!Number.isFinite(time) || !Number.isFinite(normalizedDate.getTime()) || normalizedDate.toISOString().slice(0, 10) !== civilDate) {
    throw new Error('Tanggal/waktu tidak valid.');
  }
  return time;
}

export const BILLING_ACTIVE_HOURS = 336;

export function isBillingExpired(issuedAt: string, now: string): boolean {
  return instant(now) >= instant(issuedAt) + BILLING_ACTIVE_HOURS * 60 * 60 * 1000;
}

/** Rule selection depends on BOTH tax period and filing date (Jakarta civil day).
 * Legacy version is identified but its amended-return calculation is unsupported. */
export function selectRuleVersion(period: string, submittedAt: string): string {
  const index = periodIndex(period);
  const time = instant(submittedAt);
  const filingDate = submittedAt.length === 10
    ? submittedAt : new Date(time + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (index < periodIndex('2025-01')) return 'LEGACY-UNSUPPORTED';
  return filingDate >= '2026-10-01' ? 'PER-12/PJ/2026' : 'PER-11/PJ/2025';
}

export function compensateChain(input: { originalSource: string; revisedSource: string; forwarded: string }): string {
  const original = nonnegative(input.originalSource, 'Kompensasi sumber awal');
  const revised = nonnegative(input.revisedSource, 'Kompensasi sumber revisi');
  const forwarded = decimal(input.forwarded, 'Kompensasi diteruskan');
  // A signed ledger adjustment; never reinterpret a shrinking LB as fictitious KB.
  return money(amount(forwarded.minus(original).plus(revised)));
}

export function invoiceApprovalDeadline(period: string): string {
  const next = periodIndex(period) + 1;
  return `${String(Math.floor(next / 12)).padStart(4, '0')}-${String(next % 12 + 1).padStart(2, '0')}-20`;
}

/** Nominal deadline only. Official holiday-shift calendar is not yet verified. */
export function returnDeadline(period: string): string {
  const next = periodIndex(period) + 1;
  return new Date(Date.UTC(Math.floor(next / 12), next % 12 + 1, 0)).toISOString().slice(0, 10);
}

/** Form mapping is broader than the calculation scenarios currently supported. */
export function mapFormSection(attachment: 'A1' | 'A2' | 'B1' | 'B2' | 'B3' | 'C', transactionCode?: string, isPihakLain = false): string {
  if (attachment === 'A1') return 'I.A.1';
  if (attachment === 'B1') return 'II.A';
  if (attachment === 'B3') return 'II.H';
  if (attachment === 'C') {
    if (!isPihakLain) throw new Error('Lampiran C hanya untuk PKP yang bertindak sebagai Pihak Lain Pasal 32A UU KUP, bukan otomatis Pemungut Pasal 16A.');
    return 'VIII.A';
  }
  const map = attachment === 'A2'
    ? { '04': 'I.A.2', '05': 'I.A.2', '06': 'I.A.3', '01': 'I.A.4', '09': 'I.A.4', '10': 'I.A.4', '02': 'I.A.6', '03': 'I.A.6', '07': 'I.A.7', '08': 'I.A.8' }
    : { '04': 'II.B', '05': 'II.B', '01': 'II.C', '09': 'II.C', '10': 'II.C', '02': 'II.D', '03': 'II.D' };
  const mapped = (map as Record<string, string>)[transactionCode ?? ''];
  if (!mapped) throw new Error('Mapping kode transaksi untuk lampiran ini belum diverifikasi.');
  return mapped;
}
