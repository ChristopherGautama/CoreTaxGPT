import DecimalBase from 'decimal.js';
const Decimal = DecimalBase.clone({ precision: 80, rounding: DecimalBase.ROUND_HALF_UP });
type Decimal = DecimalBase;
import type { AppState, Invoice, Mode, Role, TaxReturnVersion, InputTaxDecision, ReturnNote, Billing, InvoiceLine } from './types';
import { calculateTax, calculateReturn, validateInputCredit, isBillingExpired, selectRuleVersion, compensateChain } from '../rules/tax';
import { createInitialState, scenarios } from '../fixtures/scenarios';

export interface InvoiceDraft { direction: 'OUTPUT' | 'INPUT'; counterparty: string; date: string; transactionCode: string; regime: 'nonLuxury' | 'luxury'; ppnbmRate?: string; net: string; description?: string; eligible?: boolean; lines?: InvoiceLine[] }
export type ReturnFields = Partial<Pick<TaxReturnVersion, 'compensation' | 'advance' | 'excessCollection' | 'refundVat' | 'refundLuxury'>>;
export type Command =
  | { type: 'LOGIN'; userId: string } | { type: 'LOGOUT' }
  | { type: 'ACTIVATE' | 'RESET_PASSWORD'; userId: string }
  | { type: 'SET_TWO_FACTOR'; enabled: boolean } | { type: 'ACTIVATE_CERTIFICATE' }
  | { type: 'SWITCH_TAXPAYER'; taxpayerId: string }
  | { type: 'ASSIGN_ROLE'; userId: string; taxpayerId: string; role: Role }
  | { type: 'SET_MODE'; mode: Mode } | { type: 'SET_CLOCK'; clock: string }
  | { type: 'CREATE_INVOICE'; invoice: InvoiceDraft }
  | { type: 'UPDATE_INVOICE' | 'REPLACE_INVOICE'; invoiceId: string; invoice: InvoiceDraft }
  | { type: 'VALIDATE_INVOICE' | 'SIGN_INVOICE' | 'APPROVE_INVOICE'; invoiceId: string }
  | { type: 'CREATE_NOTE'; invoiceId: string; kind: ReturnNote['kind']; date: string; net: string; reason: string }
  | { type: 'DECIDE_NOTE'; noteId: string; approve: boolean }
  | { type: 'INPUT_DECISION'; invoiceId: string; decision: InputTaxDecision['decision']; creditPeriod: string; reason: string }
  | { type: 'CREATE_RETURN'; period: string }
  | { type: 'POST_RETURN' | 'PREPARE_PAYMENT' | 'PAY_DEPOSIT' | 'FILE_RETURN' | 'AMEND_RETURN'; returnId: string }
  | { type: 'SET_RETURN_FIELDS'; returnId: string; fields: ReturnFields }
  | { type: 'CREATE_BILLING'; returnId: string; bucket: Billing['bucket'] }
  | { type: 'PAY_BILLING' | 'CANCEL_BILLING'; billingId: string }
  | { type: 'ADD_DEPOSIT'; amount: string; source: string }
  | { type: 'COMPENSATION_ADJUST'; original?: string; revised?: string; subsequent?: string }
  | { type: 'HINT' } | { type: 'GRADE'; answers: Record<string, string> }
  | { type: 'RESET'; scenarioId?: string };

export const activeRole = (state: AppState): Role | null => state.assignments.find(a => a.active && a.userId === state.actorUserId && a.taxpayerId === state.actingTaxpayerId)?.role ?? null;
export const activeInvoices = (state: AppState): Invoice[] => state.invoices.filter(i => i.taxpayerId === state.actingTaxpayerId);
export const currentReturn = (state: AppState, period = '2026-10'): TaxReturnVersion | undefined => state.returns.filter(r => r.taxpayerId === state.actingTaxpayerId && r.period === period).sort((a, b) => b.version - a.version)[0];
export function currentInputDecision(state: AppState, invoiceId: string, returnId?: string): InputTaxDecision | undefined {
  const invoice = state.invoices.find(i => i.id === invoiceId && i.taxpayerId === state.actingTaxpayerId);
  if (!invoice) return undefined;
  const r = returnId ? state.returns.find(v => v.id === returnId && v.taxpayerId === invoice.taxpayerId) : undefined;
  const decisions = state.decisions.filter(d => d.taxpayerId === invoice.taxpayerId && d.invoiceId === invoiceId);
  return r && r.status !== 'DRAFT' ? decisions.filter(d => r.lineage.includes(d.id)).at(-1) : decisions.at(-1);
}
export const availableDeposit = (state: AppState): string => state.deposits.filter(d => d.taxpayerId === state.actingTaxpayerId).reduce((n, d) => n.plus(d.amount), new Decimal(0)).minus(state.allocations.filter(a => a.taxpayerId === state.actingTaxpayerId).reduce((n, a) => n.plus(a.amount), new Decimal(0))).toFixed(0);

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function money(value: string, allowZero = true): Decimal { let n: Decimal; try { n = new Decimal(value); } catch { throw new Error('Nilai rupiah harus berupa angka.'); } assert(n.isFinite() && (allowZero ? n.gte(0) : n.gt(0)), 'Nilai rupiah harus positif dan valid.'); return n; }
function periodOf(date: string): string { assert(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date, 'Tanggal tidak valid.'); return date.slice(0, 7); }
function periodValid(period: string): void { assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(period), 'Masa pajak tidak valid.'); }
function canEdit(state: AppState): void { assert(state.actorUserId && activeRole(state), 'Tidak memiliki akses ke Wajib Pajak aktif.'); }
function canSign(state: AppState): void { canEdit(state); assert(['PIC', 'SIGNER'].includes(activeRole(state)!), 'Drafter hanya dapat menyimpan: penandatanganan memerlukan PIC atau signer.'); assert(state.certificates.some(c => c.userId === state.actorUserId && c.status === 'ACTIVE'), 'Aktifkan KODJP demo sebelum menandatangani.'); }
function scoped<T extends { id: string; taxpayerId: string }>(state: AppState, items: T[], id: string): T { const item = items.find(i => i.id === id && i.taxpayerId === state.actingTaxpayerId); assert(item, 'Objek tidak tersedia untuk Wajib Pajak aktif.'); return item; }
function editableReturn(state: AppState, id: string): TaxReturnVersion { const r = scoped(state, state.returns, id); assert(r.status !== 'FILED', 'SPT dilaporkan bersifat immutable. Buat pembetulan.'); return r; }
function id(state: AppState, type: string): string { return `SIM-${type}-${String(state.revision).padStart(6, '0')}-${String(state.audit.length + state.invoices.length + state.payments.length + state.ledger.length + state.receipts.length).padStart(4, '0')}`; }
function audit(state: AppState, action: string, objectId: string): void { state.audit.push({ id: id(state, 'AUD'), actorUserId: state.actorUserId ?? 'DEMO', actingTaxpayerId: state.actingTaxpayerId, objectId, action, at: state.clock }); }
function signedPaymentTotal(state: AppState, r: TaxReturnVersion, bucket: Billing['bucket']): string { const family = new Set(state.returns.filter(v => v.taxpayerId === r.taxpayerId && v.period === r.period).map(v => v.id)); return state.payments.filter(p => p.taxpayerId === r.taxpayerId && family.has(p.returnId) && p.bucket === bucket).reduce((n, p) => n.plus(p.amount), new Decimal(0)).toFixed(0); }
function outstanding(state: AppState, r: TaxReturnVersion, bucket: Billing['bucket']): Decimal { const liability = new Decimal(bucket === 'PPN' ? r.amounts.III_E : r.amounts.VI_C); const refund = new Decimal(bucket === 'PPN' ? r.refundVat : r.refundLuxury); return Decimal.max(0, liability.minus(signedPaymentTotal(state, r, bucket)).plus(refund)); }
function newReturn(state: AppState, period: string, version = 0, previous?: TaxReturnVersion): TaxReturnVersion {
  return { id: id(state, 'SPT'), taxpayerId: state.actingTaxpayerId, period, version, status: 'DRAFT', amounts: { III_A: '0', III_B: '0', III_C: '0', III_D: '0', III_E: '0', III_F: '0', III_G: '0', VI_A: '0', VI_B: '0', VI_C: '0', VI_D: '0', VI_E: '0', status: 'NIHIL', payableVat: '0', payableLuxury: '0', compensationOut: '0' }, lineage: [], sourceFingerprint: '', legalRuleVersion: selectRuleVersion(period, state.clock), uiEvidenceVersion: 'DJP-manual-2025+research-2026-10-04', ...(previous ? { previousId: previous.id } : {}), compensation: previous?.compensation ?? state.compensations.filter(c => c.taxpayerId === state.actingTaxpayerId && c.targetPeriod === period).reduce((n, c) => n.plus(c.amount), new Decimal(0)).toFixed(0), advance: previous?.advance ?? '0', excessCollection: previous?.excessCollection ?? '0', refundVat: previous?.refundVat ?? '0', refundLuxury: previous?.refundLuxury ?? '0' };
}

function sourceData(state: AppState, r: TaxReturnVersion) {
  const inv = state.invoices.filter(i => i.taxpayerId === r.taxpayerId && i.status === 'APPROVED');
  const superseded = new Set(inv.flatMap(i => i.originalId ? [i.originalId] : []));
  const outputs = inv.filter(i => i.direction === 'OUTPUT' && i.period === r.period && !superseded.has(i.id));
  const latestDecisions = new Map<string, InputTaxDecision>();
  for (const d of state.decisions.filter(d => d.taxpayerId === r.taxpayerId)) latestDecisions.set(d.invoiceId, d);
  const decisions = [...latestDecisions.values()].filter(d => d.creditPeriod === r.period);
  const inputs = inv.filter(i => i.direction === 'INPUT' && !superseded.has(i.id) && decisions.some(d => d.invoiceId === i.id && d.decision === 'CREDIT'));
  const notes = state.notes.filter(n => n.taxpayerId === r.taxpayerId && n.period === r.period && n.status === 'APPROVED');
  const noteDecisions = notes.flatMap(note => { const decision = latestDecisions.get(note.invoiceId); return decision ? [decision] : []; });
  return { outputs, inputs, decisions, notes, noteDecisions };
}
function fingerprint(state: AppState, r: TaxReturnVersion): string { const data = sourceData(state, r); return JSON.stringify({ ...data, compensationLedger: state.compensations.filter(c => c.taxpayerId === r.taxpayerId && c.targetPeriod === r.period).map(c => ({ id: c.id, amount: c.amount })), compensation: r.compensation, advance: r.advance, excessCollection: r.excessCollection, refundVat: r.refundVat, refundLuxury: r.refundLuxury }); }
export const needsRepost = (state: AppState, value: string | TaxReturnVersion): boolean => { const r = typeof value === 'string' ? state.returns.find(v => v.id === value) : value; return !!r && r.status !== 'FILED' && r.sourceFingerprint !== fingerprint(state, r); };

function invoiceFromDraft(state: AppState, draft: InvoiceDraft, originalId?: string): Invoice {
  periodOf(draft.date); assert(draft.counterparty.trim(), 'Nama lawan transaksi wajib diisi.');
  assert(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].includes(draft.transactionCode), 'Kode transaksi tidak dikenali.');
  assert(['01', '04', '10'].includes(draft.transactionCode), 'Rezim/fasilitas/kode transaksi ini belum didukung: tidak memakai fallback rumus umum.');
  assert(draft.regime !== 'nonLuxury' || draft.transactionCode === '04', 'Nonmewah umum menggunakan kode 04 DPP nilai lain dalam skenario ini.');
  const net = draft.lines?.length ? draft.lines.reduce((total, line) => { const qty = money(line.quantity, false); const price = money(line.unitPrice); const discount = money(line.discount); assert(discount.lte(qty.mul(price)), 'Diskon tidak boleh melebihi harga baris.'); return total.plus(qty.mul(price).minus(discount)); }, new Decimal(0)).toString() : money(draft.net, false).toString();
  money(net, false);
  const result = calculateTax({ net, regime: draft.regime, ppnbmRate: draft.ppnbmRate ?? (draft.regime === 'luxury' ? '0.20' : '0'), transactionCode: draft.transactionCode });
  const invoiceId = id(state, 'FP');
  return { id: invoiceId, number: invoiceId, taxpayerId: state.actingTaxpayerId, direction: draft.direction, counterparty: draft.counterparty.trim(), date: draft.date, period: periodOf(draft.date), transactionCode: draft.transactionCode, regime: draft.regime, ppnbmRate: draft.ppnbmRate ?? (draft.regime === 'luxury' ? '0.20' : '0'), lines: draft.lines?.length ? structuredClone(draft.lines) : [{ id: `${invoiceId}-01`, description: draft.description?.trim() || 'Barang dagangan latihan', quantity: '1', unitPrice: net, discount: '0' }], net, dpp: result.dpp, vat: result.vat, luxuryTax: result.luxuryTax, total: result.total, unroundedVat: result.unroundedVat, unroundedLuxuryTax: result.unroundedLuxuryTax, status: 'DRAFT', eligible: draft.eligible ?? true, legalRuleVersion: result.legalRuleVersion, formulaSource: result.formulaSource, ...(originalId ? { originalId } : {}), createdBy: state.actorUserId! };
}

export function execute(original: AppState, command: Command): AppState {
  if (command.type === 'RESET') return createInitialState(command.scenarioId ?? original.scenarioId);
  const state = structuredClone(original); state.revision += 1;
  if (command.type === 'LOGIN') { const u = state.users.find(u => u.id === command.userId); assert(u?.activated, 'Akun demo belum diaktivasi.'); state.actorUserId = u.id; state.actingTaxpayerId = 'wp-niaga'; audit(state, 'LOGIN_DEMO', u.id); return state; }
  if (command.type === 'LOGOUT') { audit(state, 'LOGOUT_DEMO', state.actorUserId ?? 'DEMO'); state.actorUserId = null; return state; }
  if (command.type === 'ACTIVATE' || command.type === 'RESET_PASSWORD') { const u = state.users.find(u => u.id === command.userId); assert(u, 'Akun demo tidak ditemukan.'); if (command.type === 'ACTIVATE') u.activated = true; audit(state, command.type, u.id); state.notifications.push({ id: id(state, 'NOTIF'), taxpayerId: state.actingTaxpayerId, title: command.type === 'ACTIVATE' ? 'Aktivasi demo berhasil' : 'Reset sandi demo', text: 'Kredensial latihan tetap Belajar123!. Tidak ada email atau sandi asli yang diproses.', read: false }); return state; }
  canEdit(state);
  switch (command.type) {
    case 'SWITCH_TAXPAYER': { assert(state.assignments.some(a => a.active && a.userId === state.actorUserId && a.taxpayerId === command.taxpayerId), 'Tidak memiliki penugasan pada WP ini.'); state.actingTaxpayerId = command.taxpayerId; break; }
    case 'SET_TWO_FACTOR': { state.users.find(u => u.id === state.actorUserId)!.twoFactor = command.enabled; break; }
    case 'ACTIVATE_CERTIFICATE': { const cert = state.certificates.find(c => c.userId === state.actorUserId); if (cert) { cert.status = 'ACTIVE'; cert.issuedAt = state.clock; } else state.certificates.push({ id: id(state, 'KODJP'), userId: state.actorUserId!, status: 'ACTIVE', issuedAt: state.clock, kind: 'KODJP_DEMO' }); break; }
    case 'ASSIGN_ROLE': { assert(activeRole(state) === 'PIC', 'Hanya PIC dapat mengatur penugasan.'); assert(command.taxpayerId === state.actingTaxpayerId, 'Penugasan harus untuk WP aktif.'); assert(state.users.some(u => u.id === command.userId), 'Pengguna demo tidak ditemukan.'); const old = state.assignments.find(a => a.userId === command.userId && a.taxpayerId === command.taxpayerId); if (old) { old.role = command.role; old.active = true; } else state.assignments.push({ id: id(state, 'ROLE'), userId: command.userId, taxpayerId: command.taxpayerId, role: command.role, active: true }); break; }
    case 'SET_MODE': state.mode = command.mode; break;
    case 'SET_CLOCK': assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(command.clock) && Number.isFinite(Date.parse(command.clock)), 'Clock simulasi harus ISO dengan zona waktu eksplisit.'); periodOf(command.clock.slice(0, 10)); state.clock = command.clock; break;
    case 'CREATE_INVOICE': assert(state.taxpayers.find(t => t.id === state.actingTaxpayerId)?.type === 'PKP', 'Faktur PPN hanya tersedia untuk profil PKP.'); state.invoices.push(invoiceFromDraft(state, command.invoice)); break;
    case 'UPDATE_INVOICE': { const old = scoped(state, state.invoices, command.invoiceId); assert(old.status === 'DRAFT', 'Hanya draft dapat diubah. Faktur disetujui harus melalui pengganti.'); const replacement = invoiceFromDraft(state, command.invoice, old.originalId); Object.assign(old, replacement, { id: old.id, number: old.number }); break; }
    case 'REPLACE_INVOICE': { const old = scoped(state, state.invoices, command.invoiceId); assert(old.status === 'APPROVED', 'Pengganti memerlukan faktur approved.'); assert(!state.invoices.some(i => i.originalId === old.id), 'Pengganti sudah ada untuk faktur ini.'); assert(command.invoice.counterparty.trim() === old.counterparty, 'Identitas pembeli/lawan transaksi tidak boleh diubah melalui pengganti; gunakan alur pembatalan dan dokumen baru.'); assert(!state.notes.some(n => n.invoiceId === old.id && n.status !== 'REJECTED'), 'Pengganti setelah draft atau approval retur/pembatalan belum didukung.'); const replacement = invoiceFromDraft(state, { ...command.invoice, direction: old.direction }, old.id); replacement.period = old.period; state.invoices.push(replacement); break; }
    case 'VALIDATE_INVOICE': { const inv = scoped(state, state.invoices, command.invoiceId); assert(inv.status === 'DRAFT', 'Faktur harus berstatus draft.'); inv.status = 'VALIDATED'; break; }
    case 'SIGN_INVOICE': { canSign(state); const inv = scoped(state, state.invoices, command.invoiceId); assert(inv.status === 'VALIDATED', 'Validasi draft sebelum signing.'); inv.status = 'SIGNED'; break; }
    case 'APPROVE_INVOICE': { canSign(state); const inv = scoped(state, state.invoices, command.invoiceId); assert(inv.status === 'SIGNED', 'Penandatanganan harus selesai sebelum approval simulasi.'); assertSourceMayChange(state, inv.period); inv.status = 'APPROVED'; inv.approvedAt = state.clock; break; }
    case 'CREATE_NOTE': { const inv = scoped(state, state.invoices, command.invoiceId); assert(inv.status === 'APPROVED', 'Retur/pembatalan memerlukan faktur approved.'); assert(!state.invoices.some(i => i.originalId === inv.id), 'Gunakan faktur pengganti terbaru.'); const already = state.notes.filter(n => n.invoiceId === inv.id && n.status !== 'REJECTED').reduce((n, x) => n.plus(x.net), new Decimal(0)); const net = command.kind === 'CANCEL' ? new Decimal(inv.net) : money(command.net, false); assert(already.plus(net).lte(inv.net), 'Retur tidak boleh melebihi transaksi atau dihitung dua kali.'); const notePeriod = command.kind === 'CANCEL' ? inv.period : periodOf(command.date); if (inv.direction === 'INPUT') { const credit = currentInputDecision(state, inv.id); assert(!(credit?.decision === 'CREDIT' && command.kind === 'CANCEL' && credit.creditPeriod !== inv.period), 'Pembatalan PM lintas masa kredit memerlukan analisis pembetulan masa kredit; belum disimulasikan.'); assert(!(credit?.decision === 'CREDIT' && command.kind === 'RETURN' && notePeriod < credit.creditPeriod), 'Retur sebelum masa kredit memerlukan rekonsiliasi dokumen kredit; kasus ini belum disimulasikan.'); } periodOf(command.date); assert(command.date >= inv.date, 'Tanggal retur tidak boleh sebelum faktur.'); assert(command.reason.trim(), 'Alasan wajib diisi.'); state.notes.push({ id: id(state, command.kind === 'RETURN' ? 'RETUR' : 'BATAL'), taxpayerId: inv.taxpayerId, invoiceId: inv.id, kind: command.kind, date: command.date, period: notePeriod, net: net.toString(), vat: allocateNoteTax(state, inv, net, 'vat', false), luxuryTax: allocateNoteTax(state, inv, net, 'luxuryTax', false), status: 'DRAFT', reason: command.reason }); break; }
    case 'DECIDE_NOTE': { canSign(state); const note = scoped(state, state.notes, command.noteId); assert(note.status === 'DRAFT', 'Keputusan retur/pembatalan sudah final.'); if (command.approve) { assertSourceMayChange(state, note.period); const inv = scoped(state, state.invoices, note.invoiceId); if (inv.direction === 'INPUT') { const credit = currentInputDecision(state, inv.id); assert(!(credit?.decision === 'CREDIT' && note.kind === 'CANCEL' && credit.creditPeriod !== inv.period), 'Pembatalan PM lintas masa kredit memerlukan analisis pembetulan masa kredit; belum disimulasikan.'); assert(!(credit?.decision === 'CREDIT' && note.kind === 'RETURN' && note.period < credit.creditPeriod), 'Retur sebelum masa kredit memerlukan rekonsiliasi dokumen kredit; kasus ini belum disimulasikan.'); } note.vat = allocateNoteTax(state, inv, new Decimal(note.net), 'vat', true); note.luxuryTax = allocateNoteTax(state, inv, new Decimal(note.net), 'luxuryTax', true); } note.status = command.approve ? 'APPROVED' : 'REJECTED'; break; }
    case 'INPUT_DECISION': {
      const inv = scoped(state, state.invoices, command.invoiceId);
      assert(inv.direction === 'INPUT', 'Keputusan PM hanya untuk faktur masukan.'); periodValid(command.creditPeriod);
      const previous = currentInputDecision(state, inv.id);
      assertSourceMayChange(state, command.creditPeriod);
      if (previous) assertSourceMayChange(state, previous.creditPeriod);
      if (command.decision === 'CREDIT') { const effectiveFiled = new Map<string, TaxReturnVersion>(); for (const r of state.returns.filter(v => v.taxpayerId === inv.taxpayerId && v.status === 'FILED').sort((a, b) => a.version - b.version)) effectiveFiled.set(r.period, r); const creditedElsewhere = [...effectiveFiled.values()].find(r => r.period !== command.creditPeriod && state.decisions.some(d => d.invoiceId === inv.id && d.decision === 'CREDIT' && d.creditPeriod === r.period && r.lineage.includes(d.id))); assert(!creditedElsewhere, 'PM masih dikreditkan pada SPT dilaporkan masa lain; sampaikan pembetulan pencabutan kredit dahulu sebelum kredit ulang.'); assert(!state.notes.some(n => n.invoiceId === inv.id && n.kind === 'RETURN' && n.status !== 'REJECTED' && n.period < command.creditPeriod), 'Retur sebelum masa kredit memerlukan rekonsiliasi PM neto; kasus ini belum disimulasikan.'); assert(!state.notes.some(n => n.invoiceId === inv.id && n.kind === 'CANCEL' && n.status === 'APPROVED'), 'Dokumen telah dibatalkan; Pajak Masukan tidak dapat dikreditkan.'); assert(!state.invoices.some(i => i.originalId === inv.id && i.status === 'APPROVED'), 'Dokumen telah diganti; gunakan faktur pengganti terbaru.'); validateInputCredit({ invoicePeriod: inv.period, creditPeriod: command.creditPeriod, eligible: inv.eligible, approved: inv.status === 'APPROVED', alreadyCredited: previous?.decision === 'CREDIT' }); }
      const filed = previous && state.returns.find(r => r.taxpayerId === inv.taxpayerId && r.status === 'FILED' && r.period === previous.creditPeriod && r.lineage.includes(previous.id));
      if (filed && (previous?.decision === 'CREDIT' || command.creditPeriod === filed.period)) assert(state.returns.some(r => r.taxpayerId === inv.taxpayerId && r.period === filed.period && r.version > filed.version && r.status !== 'FILED'), 'Keputusan PM yang masuk SPT dilaporkan memerlukan konsep pembetulan masa tersebut terlebih dahulu.');
      state.decisions.push({ id: id(state, 'PM'), taxpayerId: inv.taxpayerId, invoiceId: inv.id, creditPeriod: command.creditPeriod, decision: command.decision, reason: command.reason, ...(previous ? { previousId: previous.id } : {}) });
      break;
    }
    case 'CREATE_RETURN': { assert(state.taxpayers.find(t => t.id === state.actingTaxpayerId)?.type === 'PKP', 'SPT Masa PPN hanya tersedia untuk profil PKP.'); periodValid(command.period); assert(!currentReturn(state, command.period), 'Konsep untuk masa ini sudah ada; gunakan konsep tersedia.'); const [year, month] = command.period.split('-').map(Number); assert(Date.parse(state.clock) >= Date.UTC(year, month, 1) - 7 * 3600000, 'Konsep normal tersedia tanggal 1 bulan berikutnya.'); state.returns.push(newReturn(state, command.period)); break; }
    case 'SET_RETURN_FIELDS': { const r = editableReturn(state, command.returnId); assert(!state.billings.some(b => b.returnId === r.id && b.status === 'ACTIVE') && !state.payments.some(p => p.returnId === r.id), 'Batalkan billing dan kembalikan konsep sebelum mengubah angka; setelah bayar gunakan pembetulan setelah lapor.'); for (const [key, value] of Object.entries(command.fields)) { money(value!); if (key === 'compensation') assert(new Decimal(value!).eq(state.compensations.filter(c => c.taxpayerId === r.taxpayerId && c.targetPeriod === r.period).reduce((n, c) => n.plus(c.amount), new Decimal(0))), 'Kompensasi harus cocok dengan ledger sumber; tidak dapat diisi tanpa sumber.'); (r as unknown as Record<string, string>)[key] = value!; } r.status = 'DRAFT'; break; }
    case 'POST_RETURN': { const r = editableReturn(state, command.returnId); assert(r.version === 0 || selectRuleVersion(r.period, state.clock) === 'PER-12/PJ/2026', 'Pembetulan sebelum 1 Oktober 2026 menggunakan aturan lama yang belum disimulasikan; versi aturan teridentifikasi, kalkulasi diblokir.'); assert(!state.billings.some(b => b.returnId === r.id && b.status === 'ACTIVE') && !state.payments.some(p => p.returnId === r.id), 'Batalkan billing sebelum posting ulang. SPT sudah dibayar perlu dilaporkan lalu dibetulkan.'); r.compensation = state.compensations.filter(c => c.taxpayerId === r.taxpayerId && c.targetPeriod === r.period).reduce((n, c) => n.plus(c.amount), new Decimal(0)).toFixed(0); const { outputs, inputs, decisions, notes, noteDecisions } = sourceData(state, r); const sum = (items: Invoice[], key: 'vat' | 'luxuryTax') => items.reduce((n, i) => n.plus(i[key]), new Decimal(0)); let pk = sum(outputs, 'vat'); let pm = sum(inputs, 'vat'); let luxury = sum(outputs, 'luxuryTax'); for (const note of notes) { const inv = state.invoices.find(i => i.id === note.invoiceId)!; if (inv.direction === 'OUTPUT') { pk = pk.minus(note.vat); luxury = luxury.minus(note.luxuryTax); } else if (currentInputDecision(state, inv.id)?.decision === 'CREDIT') pm = pm.minus(note.vat); } r.amounts = calculateReturn({ outputVat: pk.toString(), inputVat: pm.toString(), compensation: r.compensation, advance: r.advance, excessCollection: r.excessCollection, paidVat: r.version > 0 ? signedPaymentTotal(state, r, 'PPN') : '0', refundVat: r.refundVat, outputLuxury: luxury.toString(), paidLuxury: r.version > 0 ? signedPaymentTotal(state, r, 'PPNBM') : '0', refundLuxury: r.refundLuxury, amendment: r.version > 0 }); r.lineage = [...new Set([...outputs, ...inputs, ...decisions, ...notes, ...noteDecisions].map(i => i.id))]; r.sourceFingerprint = fingerprint(state, r); r.legalRuleVersion = selectRuleVersion(r.period, state.clock); r.status = 'POSTED'; break; }
    case 'PREPARE_PAYMENT': { const r = editableReturn(state, command.returnId); assert(r.status === 'POSTED' || r.status === 'READY', 'Posting SPT terlebih dahulu.'); assert(!needsRepost(state, r), 'Sumber berubah: posting ulang sebelum Bayar dan Lapor.'); r.status = outstanding(state, r, 'PPN').plus(outstanding(state, r, 'PPNBM')).gt(0) ? 'AWAITING_PAYMENT' : 'READY'; break; }
    case 'CREATE_BILLING': { const r = editableReturn(state, command.returnId); assert(r.status === 'AWAITING_PAYMENT', 'Pilih Bayar dan Lapor sebelum membuat billing.'); assert(!needsRepost(state, r), 'Sumber berubah: batalkan billing dan posting ulang.'); assert(!state.payments.some(p => p.returnId === r.id && p.method === 'DEPOSIT'), 'Satu SPT tidak dilunasi dengan campuran deposit dan billing.'); assert(!state.billings.some(b => b.returnId === r.id && b.bucket === command.bucket && b.status === 'ACTIVE' && !isBillingExpired(b.issuedAt, state.clock)), 'Billing aktif untuk bucket ini sudah tersedia.'); const amount = outstanding(state, r, command.bucket); assert(amount.gt(0), 'Tidak ada jumlah yang perlu dibayar pada bucket ini.'); const billingId = id(state, 'BILL'); state.billings.push({ id: billingId, taxpayerId: r.taxpayerId, returnId: r.id, number: billingId, bucket: command.bucket, amount: amount.toFixed(0), issuedAt: state.clock, expiresAt: new Date(Date.parse(state.clock) + 336 * 3600000).toISOString(), status: 'ACTIVE' }); break; }
    case 'CANCEL_BILLING': { const b = scoped(state, state.billings, command.billingId); assert(b.status === 'ACTIVE', 'Billing dibayar/dibatalkan tidak dapat dibatalkan lagi.'); b.status = 'CANCELLED'; const r = editableReturn(state, b.returnId); if (!state.billings.some(x => x.returnId === r.id && x.status === 'ACTIVE' && !isBillingExpired(x.issuedAt, state.clock))) r.status = 'POSTED'; break; }
    case 'PAY_BILLING': { const b = scoped(state, state.billings, command.billingId); assert(b.status === 'ACTIVE', 'Billing sudah dibayar atau dibatalkan; tidak dapat dibayar ulang.'); assert(!isBillingExpired(b.issuedAt, state.clock), 'Billing expired tepat 336 jam; batalkan lalu terbitkan ulang.'); const r = editableReturn(state, b.returnId); assert(!needsRepost(state, r), 'Sumber berubah: pembayaran diblokir sampai posting ulang.'); assert(outstanding(state, r, b.bucket).eq(b.amount), 'Jumlah billing tidak lagi cocok dengan kewajiban.'); b.status = 'PAID'; recordPayment(state, r, b.bucket, b.amount, 'BILLING', b.id); r.status = outstanding(state, r, 'PPN').plus(outstanding(state, r, 'PPNBM')).eq(0) ? 'READY' : 'AWAITING_PAYMENT'; break; }
    case 'ADD_DEPOSIT': { const amount = money(command.amount, false).toFixed(0); const depositId = id(state, 'DEP'); state.deposits.push({ id: depositId, taxpayerId: state.actingTaxpayerId, amount, source: command.source || 'Setoran deposit sintetis', date: state.clock }); state.ledger.push({ id: id(state, 'LED'), taxpayerId: state.actingTaxpayerId, date: state.clock, kind: 'DEPOSIT', debit: amount, credit: '0', referenceId: depositId, description: 'Penambahan deposit simulasi' }); break; }
    case 'PAY_DEPOSIT': { const r = editableReturn(state, command.returnId); assert(r.status === 'AWAITING_PAYMENT', 'Pilih Bayar dan Lapor sebelum memakai deposit.'); assert(!needsRepost(state, r), 'Sumber berubah: posting ulang.'); assert(!state.payments.some(p => p.returnId === r.id) && !state.billings.some(b => b.returnId === r.id && b.status === 'ACTIVE' && !isBillingExpired(b.issuedAt, state.clock)), 'Batalkan billing sebelum menggunakan deposit; kombinasi sebagian deposit dan billing tidak didukung.'); const vat = outstanding(state, r, 'PPN'), luxury = outstanding(state, r, 'PPNBM'); assert(new Decimal(availableDeposit(state)).gte(vat.plus(luxury)), 'Deposit harus cukup untuk seluruh kewajiban SPT; tidak boleh digabung sebagian billing.'); for (const [bucket, amount] of [['PPN', vat], ['PPNBM', luxury]] as const) { if (amount.lte(0)) continue; const payment = recordPayment(state, r, bucket, amount.toFixed(0), 'DEPOSIT'); let remaining = amount; for (const lot of state.deposits.filter(d => d.taxpayerId === r.taxpayerId)) { const used = state.allocations.filter(a => a.depositId === lot.id).reduce((n, a) => n.plus(a.amount), new Decimal(0)); const part = Decimal.min(remaining, new Decimal(lot.amount).minus(used)); if (part.gt(0)) state.allocations.push({ id: id(state, 'ALLOC') + '-' + state.allocations.length, taxpayerId: r.taxpayerId, depositId: lot.id, paymentId: payment.id, amount: part.toFixed(0) }); remaining = remaining.minus(part); if (remaining.eq(0)) break; } } r.status = 'READY'; break; }
    case 'FILE_RETURN': { canSign(state); const r = editableReturn(state, command.returnId); const filingRuleVersion = selectRuleVersion(r.period, state.clock); assert(filingRuleVersion !== 'LEGACY-UNSUPPORTED', 'Aturan untuk masa historis ini belum disimulasikan; pelaporan diblokir.'); assert(r.version === 0 || filingRuleVersion === 'PER-12/PJ/2026', 'Tanggal penyampaian pembetulan sebelum 1 Oktober 2026 menggunakan aturan lama yang belum disimulasikan; pelaporan diblokir.'); assert(r.status === 'READY', 'SPT harus siap lapor; KB harus lunas dahulu.'); assert(!needsRepost(state, r), 'Sumber berubah: posting ulang sebelum melapor.'); assert(outstanding(state, r, 'PPN').plus(outstanding(state, r, 'PPNBM')).eq(0), 'Kewajiban belum lunas.'); r.legalRuleVersion = filingRuleVersion; r.status = 'FILED'; r.submittedAt = state.clock; const receiptId = id(state, 'BPE'); state.receipts.push({ id: receiptId, number: receiptId, taxpayerId: r.taxpayerId, type: 'BPE', objectId: r.id, date: state.clock, watermark: 'SIMULASI BELAJAR • BUKAN LAYANAN DJP' }); state.ledger.push({ id: id(state, 'LED'), taxpayerId: r.taxpayerId, date: state.clock, kind: 'LIABILITY', debit: Decimal.max(0, new Decimal(r.amounts.III_E).minus(state.returns.find(v => v.id === r.previousId)?.amounts.III_E ?? '0')).toFixed(0), credit: Decimal.max(0, new Decimal(r.amounts.III_E).minus(state.returns.find(v => v.id === r.previousId)?.amounts.III_E ?? '0').neg()).toFixed(0), referenceId: r.id, description: `Kewajiban PPN SPT ${r.period} versi ${r.version} ${r.amounts.status}; penghitungan tetap meski lunas` }); const luxuryLiability = new Decimal(r.amounts.VI_C).minus(state.returns.find(v => v.id === r.previousId)?.amounts.VI_C ?? '0'); if (!luxuryLiability.eq(0)) state.ledger.push({ id: id(state, 'LED'), taxpayerId: r.taxpayerId, date: state.clock, kind: 'LIABILITY', debit: Decimal.max(0, luxuryLiability).toFixed(0), credit: Decimal.max(0, luxuryLiability.neg()).toFixed(0), referenceId: r.id, description: `Kewajiban PPnBM SPT ${r.period} versi ${r.version}; bucket terpisah dari PPN` }); for (const c of state.compensations.filter(c => c.taxpayerId === r.taxpayerId && c.targetPeriod === r.period && !c.usedBy)) c.usedBy = r.id; reconcileCompensation(state, r); break; }
    case 'AMEND_RETURN': { const r = scoped(state, state.returns, command.returnId); assert(r.status === 'FILED', 'Pembetulan harus berasal dari SPT yang sudah dilaporkan.'); assert(currentReturn(state, r.period)?.id === r.id, 'Buka versi SPT terbaru untuk pembetulan.'); state.returns.push(newReturn(state, r.period, r.version + 1, r)); break; }
    case 'COMPENSATION_ADJUST': {
      canSign(state); assert(state.scenarioId === 'compensation', 'Pilih skenario Penyesuaian kompensasi agar contoh resmi tidak bercampur dengan kasus aktif.');
      const source = scoped(state, state.returns, 'SIM-OFFICIAL-OCT-2026');
      assert(selectRuleVersion(source.period, state.clock) === 'PER-12/PJ/2026', 'Tanggal penyampaian pembetulan kompensasi memakai aturan lama yang belum disimulasikan; pelaporan diblokir.');
      assert(currentReturn(state, '2026-10')?.id === source.id, 'Contoh penyesuaian ini telah dicatat; tidak digandakan.');
      const originalAmount = command.original ?? '200000', revised = command.revised ?? '100000', subsequent = command.subsequent ?? '300000';
      money(originalAmount); money(revised); money(subsequent);
      assert(originalAmount === '200000' && subsequent === '300000', 'Sumber kasus resmi terkunci pada LB Oktober Rp200 ribu dan LB November Rp300 ribu.');
      const resulting = compensateChain({ originalSource: originalAmount, revisedSource: revised, forwarded: subsequent });
      assert(new Decimal(resulting).gte(0), 'Rangkaian kompensasi ini tidak cukup; analisis kewajiban lanjutan belum disimulasikan.');
      const amendment = newReturn(state, source.period, 1, source);
      amendment.amounts = calculateReturn({ outputVat: '0', inputVat: revised, amendment: true });
      amendment.compensation = '0'; amendment.status = 'FILED'; amendment.submittedAt = state.clock;
      state.returns.push(amendment); reconcileCompensation(state, amendment);
      const receiptId = id(state, 'BPE'); state.receipts.push({ id: receiptId, number: receiptId, taxpayerId: state.actingTaxpayerId, type: 'BPE', objectId: amendment.id, date: state.clock, watermark: 'SIMULASI BELAJAR • BUKAN LAYANAN DJP' });
      state.notifications.push({ id: id(state, 'NOTIF'), taxpayerId: state.actingTaxpayerId, title: 'Kompensasi Desember disesuaikan', text: `Saldo Desember ${resulting} rupiah tanpa KB semu. Simulasi berbasis aturan; kesiapan infrastruktur produksi belum diverifikasi.`, read: false });
      break;
    }
    case 'HINT': assert(state.mode !== 'UJIAN', 'Hint tidak tersedia dalam mode Ujian.'); state.learning.hints += 1; break;
    case 'GRADE': { const scenario = scenarios.find(s => s.id === state.scenarioId)!; state.learning.attempts += 1; state.learning.answers = command.answers; const fields = [['ppn', scenario.expectedVat], ['ppnbm', scenario.expectedLuxury], ['status', scenario.expectedStatus]]; let correct = 0; for (const [key, expected] of fields) { const answer = (command.answers[key] ?? '').trim(); if (key === 'status' ? answer.toUpperCase() === expected : /^-?\d+$/.test(answer) && new Decimal(answer).eq(expected)) correct += 1; } state.learning.lastScore = Math.round(correct / fields.length * 100); break; }
  }
  for (const paidReturn of original.returns.filter(r => r.status !== 'FILED' && original.payments.some(p => p.returnId === r.id))) { const after = state.returns.find(r => r.id === paidReturn.id); assert(after && fingerprint(original, paidReturn) === fingerprint(state, after), 'Perubahan memengaruhi sumber SPT yang sudah dibayar tetapi belum dilaporkan. Sampaikan dahulu, kemudian buat pembetulan.'); }
  audit(state, command.type, 'invoiceId' in command ? command.invoiceId : 'returnId' in command ? command.returnId : 'billingId' in command ? command.billingId : state.actingTaxpayerId);
  return state;
}

function recordPayment(state: AppState, r: TaxReturnVersion, bucket: Billing['bucket'], amount: string, method: 'BILLING' | 'DEPOSIT', billingId?: string) {
  const payment = { id: id(state, 'PAY'), taxpayerId: r.taxpayerId, returnId: r.id, ...(billingId ? { billingId } : {}), bucket, amount, date: state.clock, method };
  state.payments.push(payment); const receiptId = id(state, 'BPN'); state.receipts.push({ id: receiptId, number: receiptId, taxpayerId: r.taxpayerId, type: 'PAYMENT', objectId: payment.id, date: state.clock, watermark: 'SIMULASI BELAJAR • BUKAN LAYANAN DJP' }); state.ledger.push({ id: id(state, 'LED'), taxpayerId: r.taxpayerId, date: state.clock, kind: 'PAYMENT', debit: '0', credit: amount, referenceId: payment.id, description: `Pembayaran ${bucket} melalui ${method} simulasi` }); return payment;
}

/** Append signed adjustments while retaining each source and allocation history. */
function reconcileCompensation(state: AppState, r: TaxReturnVersion): void {
  const priorVersions = new Set(state.returns.filter(v => v.taxpayerId === r.taxpayerId && v.period === r.period && v.id !== r.id).map(v => v.id));
  const existing = state.compensations.filter(c => c.taxpayerId === r.taxpayerId && priorVersions.has(c.sourceReturnId));
  const alreadyForwarded = existing.reduce((total, c) => total.plus(c.amount), new Decimal(0));
  const delta = new Decimal(r.amounts.compensationOut).minus(alreadyForwarded);
  if (delta.eq(0)) return;
  const [y, m] = r.period.split('-').map(Number);
  let target = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
  let origin = existing.find(c => !c.adjustmentOf);
  const visited = new Set<string>();
  while (origin?.usedBy) {
    assert(!visited.has(origin.id), 'Rantai kompensasi tidak valid.'); visited.add(origin.id);
    const next = state.compensations.find(c => c.taxpayerId === r.taxpayerId && c.sourceReturnId === origin!.usedBy && !c.adjustmentOf);
    assert(next, 'Kompensasi telah digunakan pada masa tanpa LB terusan; analisis pembetulan masa penerima diperlukan.');
    target = next.targetPeriod; origin = next;
  }
  if (existing.length && delta.lt(0)) {
    const balance = state.compensations.filter(c => c.taxpayerId === r.taxpayerId && c.targetPeriod === target).reduce((total, c) => total.plus(c.amount), new Decimal(0));
    assert(balance.plus(delta).gte(0), 'Penyesuaian melebihi kompensasi yang diteruskan; analisis masa penerima belum disimulasikan.');
  }
  assertSourceMayChange(state, target);
  const compId = id(state, 'KOMP');
  state.compensations.push({ id: compId, taxpayerId: r.taxpayerId, sourceReturnId: r.id, sourcePeriod: r.period, targetPeriod: target, amount: delta.toFixed(0), ...(existing.length ? { adjustmentOf: origin?.id ?? existing[0].id } : {}) });
  state.ledger.push({ id: id(state, 'LED'), taxpayerId: r.taxpayerId, date: state.clock, kind: existing.length ? 'ADJUSTMENT' : 'COMPENSATION', debit: delta.lt(0) ? delta.abs().toFixed(0) : '0', credit: delta.gt(0) ? delta.toFixed(0) : '0', referenceId: compId, description: `${existing.length ? 'Penyesuaian' : 'Penerusan'} kompensasi ${r.period} ke ${target}. Delta ${delta.toFixed(0)}; riwayat sumber dipertahankan. Simulasi aturan; kesiapan produksi belum diverifikasi.` });
}

function assertSourceMayChange(state: AppState, period: string): void {
  const pendingPaid = state.returns.find(r => r.taxpayerId === state.actingTaxpayerId && r.period === period && r.status !== 'FILED' && state.payments.some(p => p.returnId === r.id));
  assert(!pendingPaid, 'SPT masa ini sudah dibayar tetapi belum dilaporkan. Sampaikan versi yang telah dibayar dahulu, lalu buat pembetulan sebelum menyetujui perubahan sumber.');
}

/** Cumulative SPT rounding preserves the original tax across partial returns.
 * Draft estimates reserve the remaining amount; approval recalculates only against
 * previously approved notes so rejection/reordering cannot over-return tax. */
function allocateNoteTax(state: AppState, inv: Invoice, net: Decimal, key: 'vat' | 'luxuryTax', approvedOnly: boolean): string {
  const prior = state.notes.filter(n => n.invoiceId === inv.id && (approvedOnly ? n.status === 'APPROVED' : n.status !== 'REJECTED'));
  const cumulativeNet = prior.reduce((sum, n) => sum.plus(n.net), net);
  const priorTax = prior.reduce((sum, n) => sum.plus(n[key]), new Decimal(0));
  const sourceUnrounded = new Decimal(key === 'vat' ? inv.unroundedVat : inv.unroundedLuxuryTax);
  const cumulativeTax = Decimal.min(inv[key], sourceUnrounded.mul(cumulativeNet).div(inv.net).toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
  return Decimal.max(0, cumulativeTax.minus(priorTax)).toFixed(0);
}
