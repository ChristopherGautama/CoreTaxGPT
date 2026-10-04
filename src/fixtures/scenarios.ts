import type { AppState, Invoice, Scenario, TaxReturnVersion } from '../domain/types';
import { calculateTax, calculateReturn } from '../rules/tax';

export const scenarios: Scenario[] = [
  { id: 'kb', title: '01 · PPN kurang bayar', description: 'Penjualan Rp500 juta; pembelian eligible Rp200 juta; kompensasi September Rp3 juta. Hasil KB Rp30 juta.', expectedVat: '30000000', expectedLuxury: '0', expectedStatus: 'KB', tasks: ['Periksa faktur dan keputusan PM', 'Posting SPT Oktober', 'Bayar penuh dengan billing atau deposit', 'Tandatangani dan unduh BPE simulasi'] },
  { id: 'lb', title: '02 · PPN lebih bayar', description: 'Penjualan Rp100 juta dan pembelian eligible Rp250 juta. LB Rp16,5 juta tetap harus dilaporkan.', expectedVat: '-16500000', expectedLuxury: '0', expectedStatus: 'LB', tasks: ['Posting SPT Oktober', 'Periksa LB dan kompensasi', 'Sampaikan SPT tanpa billing', 'Periksa BPE dan ledger kompensasi'] },
  { id: 'nihil', title: '03 · PPN nihil', description: 'Penjualan dan pembelian eligible masing-masing Rp200 juta. PPN nihil tetap harus dilaporkan.', expectedVat: '0', expectedLuxury: '0', expectedStatus: 'NIHIL', tasks: ['Posting SPT Oktober', 'Bandingkan PK dan PM', 'Sampaikan SPT nihil', 'Periksa BPE simulasi'] },
  { id: 'ppnbm', title: '04 · PPnBM pedagogis', description: 'ASSUMPTION: produsen BKP sah tergolong mewah; harga Rp1 miliar; PPnBM latihan 20%. PM Rp22 juta hanya mengurangi PPN.', expectedVat: '98000000', expectedLuxury: '200000000', expectedStatus: 'KB', tasks: ['Periksa PPN 12% dan PPnBM latihan 20%', 'Posting PPN Rp98 juta dan PPnBM Rp200 juta', 'Lunasi dua tax bucket', 'Sampaikan dan unduh BPE simulasi'] },
  { id: 'noneligible', title: '05 · PM tidak dapat dikreditkan', description: 'Kasus dasar; dari PM Rp22 juta, Rp5 juta tidak eligible. PM kredit Rp17 juta; hasil KB Rp35 juta.', expectedVat: '35000000', expectedLuxury: '0', expectedStatus: 'KB', tasks: ['Periksa alasan PM nonkredit Rp5 juta', 'Posting lampiran B3 serta B2', 'Verifikasi KB Rp35 juta', 'Bayar dan sampaikan SPT'] },
  { id: 'compensation', title: '06 · Penyesuaian kompensasi', description: 'Contoh resmi: LB Oktober Rp200 ribu menjadi Rp100 ribu; LB November Rp300 ribu diteruskan ke Desember. Hasil kompensasi Rp200 ribu tanpa KB semu.', expectedVat: '-200000', expectedLuxury: '0', expectedStatus: 'LB', tasks: ['Periksa sumber LB Oktober dan November', 'Jalankan penyesuaian kompensasi', 'Baca ledger Desember Rp200 ribu', 'Pahami batas kesiapan produksi yang belum diverifikasi'] },
];

function invoice(id: string, direction: 'OUTPUT' | 'INPUT', net: string, luxury = false, eligible = true): Invoice {
  const tax = calculateTax({ net, regime: luxury ? 'luxury' : 'nonLuxury', ppnbmRate: luxury ? '0.20' : '0' });
  return { id, number: id, taxpayerId: 'wp-niaga', direction, counterparty: direction === 'OUTPUT' ? 'PT Pelanggan Latihan Sejahtera' : 'PT Pemasok Simulasi Mandiri', date: '2026-10-10', period: '2026-10', transactionCode: luxury ? '01' : '04', regime: luxury ? 'luxury' : 'nonLuxury', ppnbmRate: luxury ? '0.20' : '0', lines: [{ id: `${id}-01`, description: luxury ? 'BKP mewah pedagogis: klasifikasi diasumsikan sah' : 'Barang dagangan nonmewah sintetis', quantity: '1', unitPrice: net, discount: '0' }], net: tax.net, dpp: tax.dpp, vat: tax.vat, luxuryTax: tax.luxuryTax, total: tax.total, unroundedVat: tax.unroundedVat, unroundedLuxuryTax: tax.unroundedLuxuryTax, status: 'APPROVED', eligible, legalRuleVersion: tax.legalRuleVersion, formulaSource: tax.formulaSource, createdBy: 'pic', approvedAt: '2026-10-15T09:00:00+07:00' };
}
function returnVersion(id: string, period: string, inputVat = '0', status: TaxReturnVersion['status'] = 'DRAFT', compensation = '0'): TaxReturnVersion {
  return { id, taxpayerId: 'wp-niaga', period, version: 0, status, amounts: calculateReturn({ outputVat: '0', inputVat }), lineage: [], sourceFingerprint: '', legalRuleVersion: period === '2026-08' ? 'PER-11/PJ/2025' : 'PER-12/PJ/2026', uiEvidenceVersion: 'DJP-manual-2025+research-2026-10-04', compensation, advance: '0', excessCollection: '0', refundVat: '0', refundLuxury: '0', ...(status === 'FILED' ? { submittedAt: period === '2026-08' ? '2026-09-25T09:00:00+07:00' : '2026-10-25T09:00:00+07:00' } : {}) };
}

export function createInitialState(scenarioId = 'kb'): AppState {
  if (!scenarios.some(s => s.id === scenarioId)) throw new Error('Skenario tidak tersedia.');
  const compensating = ['kb', 'noneligible'].includes(scenarioId);
  const output = scenarioId === 'lb' ? '100000000' : scenarioId === 'nihil' ? '200000000' : scenarioId === 'ppnbm' ? '1000000000' : '500000000';
  const input = scenarioId === 'lb' ? '250000000' : '200000000';
  const outputInvoice = invoice('SIM-FP-KELUAR-001', 'OUTPUT', output, scenarioId === 'ppnbm');
  const inputInvoice = invoice('SIM-FP-MASUK-001', 'INPUT', input);
  const invoices = [outputInvoice, inputInvoice];
  if (scenarioId === 'noneligible') {
    // Exact VAT Rp17m and Rp5m stored as rationally-derived decimal prices.
    // Long decimal values avoid truncation before the SPT whole-rupiah stage.
    invoices[1] = invoice('SIM-FP-MASUK-001', 'INPUT', '154545454.54545454545454545454545454545454545454545454545454545454545454545454545');
    invoices.push(invoice('SIM-FP-MASUK-002', 'INPUT', '45454545.454545454545454545454545454545454545454545454545454545454545454545454545', false, false));
  }
  const sept = returnVersion('SIM-SPT-2026-09-0', '2026-09', compensating ? '3000000' : '0', 'FILED');
  const august = returnVersion('SIM-SPT-2026-08-0', '2026-08', '0', 'FILED');
  const october = returnVersion('SIM-SPT-2026-10-0', '2026-10', '0', 'DRAFT', compensating ? '3000000' : '0');
  const state: AppState = {
    schemaVersion: 1, revision: 0, clock: '2026-11-15T09:00:00+07:00', observationDate: '2026-10-04', scenarioId, mode: 'TERPANDU', actorUserId: null, actingTaxpayerId: 'wp-niaga',
    users: [
      { id: 'pic', name: 'Ayu PIC Latihan', login: 'pic', role: 'PIC', activated: true, twoFactor: false },
      { id: 'drafter', name: 'Bima Drafter Latihan', login: 'drafter', role: 'DRAFTER', activated: true, twoFactor: false },
      { id: 'signer', name: 'Citra Signer Latihan', login: 'signer', role: 'SIGNER', activated: true, twoFactor: false },
    ],
    taxpayers: [
      { id: 'wp-niaga', name: 'PT Simulasi Niaga Nusantara', npwp: '0000000000000001', type: 'PKP', tkuId: 'tku-niaga' },
      { id: 'wp-personal', name: 'Ayu Pribadi • Data Sintetis', npwp: '0000000000000002', type: 'PERSONAL', tkuId: 'tku-personal' },
    ],
    relatedParties: [{ id: 'SIM-RELATED-01', taxpayerId: 'wp-niaga', userId: 'pic', relationship: 'Penanggung jawab badan / PIC demo' }],
    assignments: [
      { id: 'SIM-ROLE-01', userId: 'pic', taxpayerId: 'wp-niaga', role: 'PIC', active: true },
      { id: 'SIM-ROLE-02', userId: 'drafter', taxpayerId: 'wp-niaga', role: 'DRAFTER', active: true },
      { id: 'SIM-ROLE-03', userId: 'signer', taxpayerId: 'wp-niaga', role: 'SIGNER', active: true },
      { id: 'SIM-ROLE-04', userId: 'pic', taxpayerId: 'wp-personal', role: 'PIC', active: true },
    ],
    tkus: [{ id: 'tku-niaga', taxpayerId: 'wp-niaga', name: 'Kantor pusat simulasi', nitku: '0000000000000001000000' }, { id: 'tku-personal', taxpayerId: 'wp-personal', name: 'Profil pribadi simulasi', nitku: '0000000000000002000000' }],
    certificates: [
      { id: 'SIM-KODJP-PIC', userId: 'pic', status: 'INACTIVE', issuedAt: '', kind: 'KODJP_DEMO' },
      { id: 'SIM-KODJP-SIGNER', userId: 'signer', status: 'INACTIVE', issuedAt: '', kind: 'KODJP_DEMO' },
    ],
    counterparties: [{ id: 'SIM-CUST-01', name: 'PT Pelanggan Latihan Sejahtera', npwp: '0000000000000011' }, { id: 'SIM-SUPP-01', name: 'PT Pemasok Simulasi Mandiri', npwp: '0000000000000012' }],
    invoices, notes: [], otherDocuments: [],
    decisions: invoices.filter(i => i.direction === 'INPUT').map((i, n) => ({ id: `SIM-PM-00${n + 1}`, taxpayerId: 'wp-niaga', invoiceId: i.id, creditPeriod: '2026-10', decision: i.eligible ? 'CREDIT' : 'NONCREDIT', reason: i.eligible ? 'Fixture: syarat formal/material terpenuhi, approved, belum dikreditkan sebelumnya.' : 'Fixture: PM Rp5 juta tidak eligible; tetap dicatat B3 dan tidak dikreditkan.' })),
    returns: [august, sept, october],
    compensations: compensating ? [{ id: 'SIM-KOMP-SEPT-OCT', taxpayerId: 'wp-niaga', sourceReturnId: sept.id, sourcePeriod: '2026-09', targetPeriod: '2026-10', amount: '3000000' }] : [],
    billings: [], payments: [], deposits: [], allocations: [],
    ledger: compensating ? [{ id: 'SIM-LED-KOMP-SEPT', taxpayerId: 'wp-niaga', date: '2026-10-25T09:00:00+07:00', kind: 'COMPENSATION', debit: '0', credit: '3000000', referenceId: sept.id, description: 'SPT September telah dilaporkan; kompensasi Rp3 juta ke Oktober.' }] : [],
    notifications: [{ id: 'SIM-NOTIF-CONCEPT', taxpayerId: 'wp-niaga', title: 'Konsep SPT Oktober tersedia', text: 'Konsep normal tersedia otomatis sejak 1 November 2026. Semua tanggal dan identitas merupakan fixture sintetis.', read: false }],
    receipts: [august, sept].map(r => ({ id: `SIM-BPE-${r.period}`, taxpayerId: 'wp-niaga', type: 'BPE', number: `SIM-BPE-${r.period}`, objectId: r.id, date: r.submittedAt!, watermark: 'SIMULASI BELAJAR • BUKAN LAYANAN DJP' })),
    audit: [{ id: 'SIM-AUDIT-FIXTURE', actorUserId: 'pic', actingTaxpayerId: 'wp-niaga', objectId: scenarioId, action: 'FIXTURE_LOADED', at: '2026-11-15T09:00:00+07:00' }],
    learning: { hints: 0, attempts: 0, lastScore: null, answers: {} },
  };
  if (scenarioId === 'compensation') {
    state.invoices = []; state.decisions = [];
    const source = returnVersion('SIM-OFFICIAL-OCT-2026', '2026-10', '200000', 'FILED'); source.submittedAt = '2026-11-20T09:00:00+07:00';
    const forward = returnVersion('SIM-OFFICIAL-NOV-2026', '2026-11', '100000', 'FILED', '200000'); forward.amounts = calculateReturn({ outputVat: '0', inputVat: '100000', compensation: '200000' }); forward.submittedAt = '2026-12-20T09:00:00+07:00';
    state.returns = [august, sept, source, forward];
    state.clock = '2026-12-21T09:00:00+07:00';
    state.compensations = [{ id: 'SIM-KOMP-OCT-NOV', taxpayerId: 'wp-niaga', sourceReturnId: source.id, sourcePeriod: '2026-10', targetPeriod: '2026-11', amount: '200000', usedBy: forward.id }, { id: 'SIM-KOMP-NOV-DEC', taxpayerId: 'wp-niaga', sourceReturnId: forward.id, sourcePeriod: '2026-11', targetPeriod: '2026-12', amount: '300000' }];
    for (const r of [source, forward]) state.receipts.push({ id: `SIM-BPE-${r.period}`, taxpayerId: 'wp-niaga', type: 'BPE', number: `SIM-BPE-${r.period}`, objectId: r.id, date: r.submittedAt!, watermark: 'SIMULASI BELAJAR • BUKAN LAYANAN DJP' });
    state.notifications = [{ id: 'SIM-NOTIF-COMP', taxpayerId: 'wp-niaga', title: 'Contoh resmi kompensasi', text: 'Clock skenario tambahan 21 Desember 2026. LB Oktober/November adalah fixture yang telah dilaporkan. Simulasi berbasis aturan; kesiapan infrastruktur produksi belum diverifikasi.', read: false }];
  }
  return state;
}
