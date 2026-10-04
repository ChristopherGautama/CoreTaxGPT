import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import Decimal from 'decimal.js';
import type { AppState } from '../domain/types';

/** DESIGN: local, versioned snapshots; no production tax API is involved. */
export const STORAGE_SCHEMA_VERSION = 1;
export const EXPORT_WATERMARK = 'SIMULASI BELAJAR • BUKAN LAYANAN DJP';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const DATABASE = 'coretax-learning-simulator';
const SNAPSHOT_KEY = 'current';

const id = z.string().min(1).max(200);
const text = z.string().max(10_000);
const money = z.string().max(100).regex(/^-?\d+(?:\.\d+)?$/, 'Nilai uang harus berupa string desimal.');
const nonnegative = money.refine((value) => !value.startsWith('-') || /^-0(?:\.0+)?$/.test(value), 'Nilai tidak boleh negatif.');
const period = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);
const date = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/)
  .refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Tanggal tidak valid.');
const timestamp = z.string().max(40).refine((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && date.safeParse(value.slice(0, 10)).success && !Number.isNaN(Date.parse(value)), 'Waktu simulasi harus valid dengan zona waktu eksplisit.');
const dateOrTimestamp = z.union([date, timestamp]);
const role = z.enum(['PIC', 'DRAFTER', 'SIGNER']);
const documentNumber = z.string().min(5).max(150).startsWith('SIM-', 'Nomor dokumen harus berawalan SIM-.');
const syntheticNpwp = z.string().regex(/^0{12}\d{4}$/, 'Hanya NPWP sintetis fixture (12 angka nol di awal) yang diizinkan.');
const syntheticNitku = z.string().regex(/^0{12}\d{10}$/, 'Hanya NITKU sintetis fixture yang diizinkan.');
const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const list = <T extends z.ZodType>(item: T) => z.array(item).max(10_000);

const amounts = object({
  III_A: money, III_B: money, III_C: money, III_D: money, III_E: money, III_F: money, III_G: money,
  VI_A: money, VI_B: money, VI_C: money, VI_D: money, VI_E: money,
  status: z.enum(['KB', 'LB', 'NIHIL']), payableVat: nonnegative, payableLuxury: nonnegative, compensationOut: nonnegative,
});

const stateSchema = object({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  clock: timestamp, observationDate: date, scenarioId: id, mode: z.enum(['TERPANDU', 'MANDIRI', 'UJIAN']),
  actorUserId: id.nullable(), actingTaxpayerId: id,
  users: list(object({ id: z.enum(['pic', 'drafter', 'signer']), name: text, login: z.enum(['pic', 'drafter', 'signer']), role, activated: z.boolean(), twoFactor: z.boolean() })),
  taxpayers: list(object({ id, name: text, npwp: syntheticNpwp, type: z.enum(['PERSONAL', 'PKP']), tkuId: id })),
  relatedParties: list(object({ id, taxpayerId: id, userId: id, relationship: text })),
  assignments: list(object({ id, userId: id, taxpayerId: id, role, active: z.boolean() })),
  tkus: list(object({ id, taxpayerId: id, name: text, nitku: syntheticNitku })),
  certificates: list(object({ id, userId: id, status: z.enum(['INACTIVE', 'ACTIVE']), issuedAt: z.union([timestamp, z.literal('')]), kind: z.literal('KODJP_DEMO') })),
  counterparties: list(object({ id, name: text, npwp: syntheticNpwp })),
  invoices: list(object({
    id, taxpayerId: id, number: documentNumber, direction: z.enum(['OUTPUT', 'INPUT']), counterparty: id,
    date, period, transactionCode: z.string().regex(/^(?:0[1-9]|10)$/), regime: z.enum(['nonLuxury', 'luxury']), ppnbmRate: nonnegative,
    lines: list(object({ id, description: text, quantity: nonnegative, unitPrice: nonnegative, discount: nonnegative })),
    net: nonnegative, dpp: nonnegative, vat: nonnegative, luxuryTax: nonnegative, total: nonnegative, unroundedVat: nonnegative, unroundedLuxuryTax: nonnegative,
    status: z.enum(['DRAFT', 'VALIDATED', 'SIGNED', 'APPROVED']), eligible: z.boolean(),
    legalRuleVersion: id, formulaSource: text, originalId: id.optional(), createdBy: id, approvedAt: timestamp.optional(),
  })),
  notes: list(object({
    id, taxpayerId: id, invoiceId: id, kind: z.enum(['RETURN', 'CANCEL']), date, period,
    net: nonnegative, vat: nonnegative, luxuryTax: nonnegative, status: z.enum(['DRAFT', 'APPROVED', 'REJECTED']), reason: text,
  })),
  otherDocuments: list(object({ id, taxpayerId: id, type: text, status: z.literal('UNSUPPORTED'), reason: text })),
  decisions: list(object({ id, taxpayerId: id, invoiceId: id, creditPeriod: period, decision: z.enum(['CREDIT', 'NONCREDIT', 'NEUTRAL', 'INVALID']), reason: text, previousId: id.optional() })),
  returns: list(object({
    id, taxpayerId: id, period, version: z.number().int().nonnegative(),
    status: z.enum(['DRAFT', 'POSTED', 'AWAITING_PAYMENT', 'READY', 'FILED']), amounts,
    lineage: list(id), sourceFingerprint: z.string().max(MAX_IMPORT_BYTES), legalRuleVersion: id, uiEvidenceVersion: id,
    previousId: id.optional(), submittedAt: timestamp.optional(), compensation: nonnegative, advance: nonnegative,
    excessCollection: nonnegative, refundVat: nonnegative, refundLuxury: nonnegative,
  })),
  compensations: list(object({ id, taxpayerId: id, sourceReturnId: id, sourcePeriod: period, targetPeriod: period, amount: money, usedBy: id.optional(), adjustmentOf: id.optional() })),
  billings: list(object({ id, taxpayerId: id, returnId: id, number: documentNumber, bucket: z.enum(['PPN', 'PPNBM']), amount: nonnegative, issuedAt: timestamp, status: z.enum(['ACTIVE', 'CANCELLED', 'PAID']), expiresAt: timestamp })),
  payments: list(object({ id, taxpayerId: id, returnId: id, billingId: id.optional(), bucket: z.enum(['PPN', 'PPNBM']), amount: nonnegative, date: dateOrTimestamp, method: z.enum(['BILLING', 'DEPOSIT']) })),
  deposits: list(object({ id, taxpayerId: id, amount: nonnegative, source: text, date: dateOrTimestamp })),
  allocations: list(object({ id, taxpayerId: id, depositId: id, paymentId: id, amount: nonnegative })),
  ledger: list(object({ id, taxpayerId: id, date: dateOrTimestamp, kind: z.enum(['DEPOSIT', 'PAYMENT', 'LIABILITY', 'COMPENSATION', 'ADJUSTMENT']), debit: nonnegative, credit: nonnegative, referenceId: id, description: text })),
  notifications: list(object({ id, taxpayerId: id, title: text, text, read: z.boolean() })),
  receipts: list(object({ id, taxpayerId: id, type: z.enum(['BPE', 'PAYMENT']), number: documentNumber, objectId: id, date: dateOrTimestamp, watermark: z.literal(EXPORT_WATERMARK) })),
  audit: list(object({ id, actorUserId: id, actingTaxpayerId: id, objectId: id, action: text, at: timestamp })),
  learning: object({ hints: z.number().int().nonnegative(), attempts: z.number().int().nonnegative(), lastScore: z.number().min(0).max(100).nullable(), answers: z.record(z.string().max(200), text) }),
});

const envelopeSchema = object({
  format: z.literal('CORETAX_LEARNING_SIMULATOR'), schemaVersion: z.literal(1),
  watermark: z.literal(EXPORT_WATERMARK), syntheticDataOnly: z.literal(true), state: stateSchema,
});

function requireReference(condition: unknown, description: string): asserts condition {
  if (!condition) throw new Error(`Data simulasi tidak konsisten: ${description}.`);
}

/** Cross-entity ownership prevents imported snapshots from crossing taxpayer boundaries. */
function validateReferences(state: AppState): AppState {
  const collections = ['users', 'taxpayers', 'relatedParties', 'assignments', 'tkus', 'certificates', 'counterparties', 'invoices', 'notes', 'otherDocuments', 'decisions', 'returns', 'compensations', 'billings', 'payments', 'deposits', 'allocations', 'ledger', 'notifications', 'receipts', 'audit'] as const;
  for (const key of collections) {
    const ids = state[key].map((item) => item.id);
    requireReference(new Set(ids).size === ids.length, `ID duplikat pada ${key}`);
  }
  const users = new Set(state.users.map((item) => item.id));
  const taxpayers = new Set(state.taxpayers.map((item) => item.id));
  const invoices = new Map(state.invoices.map((item) => [item.id, item]));
  const returns = new Map(state.returns.map((item) => [item.id, item]));
  const billings = new Map(state.billings.map((item) => [item.id, item]));
  const payments = new Map(state.payments.map((item) => [item.id, item]));
  const deposits = new Map(state.deposits.map((item) => [item.id, item]));
  const compensationIds = new Set(state.compensations.map((item) => item.id));
  const lineageIds = new Set([...state.invoices, ...state.notes, ...state.decisions, ...state.compensations].map((item) => item.id));
  requireReference(state.actorUserId === null || users.has(state.actorUserId), 'aktor tidak ditemukan');
  requireReference(taxpayers.has(state.actingTaxpayerId), 'WP aktif tidak ditemukan');
  for (const user of state.users) requireReference(user.login === user.id, `login persona ${user.id}`);
  for (const certificate of state.certificates) requireReference(certificate.status !== 'ACTIVE' || certificate.issuedAt !== '', `waktu aktivasi KODJP ${certificate.id}`);
  for (const key of collections) {
    for (const item of state[key]) {
      if ('taxpayerId' in item) requireReference(taxpayers.has(item.taxpayerId), `WP tidak ditemukan untuk ${key}/${item.id}`);
      if ('userId' in item) requireReference(users.has(item.userId), `pengguna tidak ditemukan untuk ${key}/${item.id}`);
    }
  }
  for (const taxpayer of state.taxpayers) requireReference(state.tkus.some((tku) => tku.id === taxpayer.tkuId && tku.taxpayerId === taxpayer.id), `TKU untuk ${taxpayer.id}`);
  for (const invoice of state.invoices) {
    requireReference(users.has(invoice.createdBy), `pembuat faktur ${invoice.id}`);
    requireReference(invoice.status !== 'APPROVED' || !!invoice.approvedAt, `waktu approval faktur ${invoice.id}`);
    if (invoice.originalId) requireReference(invoices.get(invoice.originalId)?.taxpayerId === invoice.taxpayerId && invoice.originalId !== invoice.id, `faktur asal ${invoice.id}`);
    requireReference(invoice.period === (invoice.originalId ? invoices.get(invoice.originalId)?.period : invoice.date.slice(0, 7)), `masa faktur ${invoice.id}`);
    const lineIds = invoice.lines.map((line) => line.id);
    requireReference(new Set(lineIds).size === lineIds.length, `baris faktur duplikat ${invoice.id}`);
  }
  for (const note of state.notes) {
    requireReference(invoices.get(note.invoiceId)?.taxpayerId === note.taxpayerId, `faktur retur ${note.id}`);
    requireReference(note.period === (note.kind === 'CANCEL' ? invoices.get(note.invoiceId)?.period : note.date.slice(0, 7)), `masa retur ${note.id}`);
  }
  for (const decision of state.decisions) {
    requireReference(invoices.get(decision.invoiceId)?.taxpayerId === decision.taxpayerId && invoices.get(decision.invoiceId)?.direction === 'INPUT', `faktur PM ${decision.id}`);
    if (decision.previousId) requireReference(state.decisions.some((previous) => previous.id === decision.previousId && previous.invoiceId === decision.invoiceId && previous.taxpayerId === decision.taxpayerId && previous.id !== decision.id), `keputusan PM asal ${decision.id}`);
  }
  for (const taxReturn of state.returns) {
    requireReference(taxReturn.status !== 'FILED' || !!taxReturn.submittedAt, `waktu penyampaian SPT ${taxReturn.id}`);
    if (taxReturn.previousId) {
      const previous = returns.get(taxReturn.previousId);
      requireReference(previous && previous.taxpayerId === taxReturn.taxpayerId && previous.period === taxReturn.period && previous.version < taxReturn.version, `versi SPT asal ${taxReturn.id}`);
    }
    // A concept may retain its last posting lineage while source decisions are edited.
    // Filed versions must resolve all source references because those are immutable.
    if (taxReturn.status === 'FILED') requireReference(taxReturn.lineage.every((lineage) => lineageIds.has(lineage)), `lineage SPT ${taxReturn.id}`);
  }
  for (const compensation of state.compensations) {
    requireReference(returns.get(compensation.sourceReturnId)?.taxpayerId === compensation.taxpayerId, `SPT sumber kompensasi ${compensation.id}`);
    if (compensation.usedBy) requireReference(returns.get(compensation.usedBy)?.taxpayerId === compensation.taxpayerId, `SPT pengguna kompensasi ${compensation.id}`);
    if (compensation.adjustmentOf) requireReference(compensationIds.has(compensation.adjustmentOf) || returns.has(compensation.adjustmentOf), `penyesuaian kompensasi ${compensation.id}`);
  }
  for (const billing of state.billings) {
    requireReference(returns.get(billing.returnId)?.taxpayerId === billing.taxpayerId, `SPT billing ${billing.id}`);
    requireReference(Date.parse(billing.expiresAt) - Date.parse(billing.issuedAt) === 336 * 3_600_000, `masa aktif billing ${billing.id}`);
    const settled = state.payments.filter((payment) => payment.billingId === billing.id);
    requireReference(billing.status === 'PAID' ? settled.length === 1 : settled.length === 0, `status pembayaran billing ${billing.id}`);
  }
  for (const payment of state.payments) {
    requireReference(returns.get(payment.returnId)?.taxpayerId === payment.taxpayerId, `SPT pembayaran ${payment.id}`);
    if (payment.method === 'BILLING') {
      const billing = payment.billingId ? billings.get(payment.billingId) : undefined;
      requireReference(billing?.taxpayerId === payment.taxpayerId && billing.returnId === payment.returnId && billing.bucket === payment.bucket && new Decimal(billing.amount).equals(payment.amount), `billing pembayaran ${payment.id}`);
    } else {
      requireReference(!payment.billingId, `pembayaran deposit ${payment.id} tidak boleh menunjuk billing`);
      const allocated = state.allocations.filter((allocation) => allocation.paymentId === payment.id).reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0));
      requireReference(allocated.equals(payment.amount), `jumlah alokasi pembayaran ${payment.id}`);
    }
  }
  for (const allocation of state.allocations) requireReference(deposits.get(allocation.depositId)?.taxpayerId === allocation.taxpayerId && payments.get(allocation.paymentId)?.taxpayerId === allocation.taxpayerId, `alokasi deposit ${allocation.id}`);
  for (const deposit of state.deposits) {
    const used = state.allocations.filter((allocation) => allocation.depositId === deposit.id).reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0));
    requireReference(used.lte(deposit.amount), `alokasi melebihi lot deposit ${deposit.id}`);
  }
  for (const receipt of state.receipts) {
    const target = receipt.type === 'BPE' ? returns.get(receipt.objectId) : payments.get(receipt.objectId);
    requireReference(target?.taxpayerId === receipt.taxpayerId, `objek bukti ${receipt.id}`);
    if (receipt.type === 'BPE') requireReference(returns.get(receipt.objectId)?.status === 'FILED', `BPE hanya untuk SPT dilaporkan ${receipt.id}`);
  }
  for (const event of state.audit) requireReference((users.has(event.actorUserId) || event.actorUserId === 'DEMO') && taxpayers.has(event.actingTaxpayerId), `aktor/WP audit ${event.id}`);
  return state;
}

function parseState(value: unknown): AppState {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== STORAGE_SCHEMA_VERSION) {
    throw new Error('Versi schema tidak didukung. Migrasi hanya mendukung snapshot versi 1; data lama tidak diubah.');
  }
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Berkas simulasi tidak valid (${issue?.path.join('.') || 'snapshot'}): ${issue?.message || 'format tidak dikenal'}`);
  }
  return validateReferences(parsed.data);
}

interface SimulatorDatabase extends DBSchema {
  snapshots: { key: string; value: AppState };
}

let databasePromise: Promise<IDBPDatabase<SimulatorDatabase>> | undefined;
function database(): Promise<IDBPDatabase<SimulatorDatabase>> {
  databasePromise ??= openDB<SimulatorDatabase>(DATABASE, 1, {
    upgrade(db, oldVersion) {
      if (oldVersion === 0) db.createObjectStore('snapshots');
    },
    blocking() { databasePromise?.then((db) => db.close()).catch(() => undefined); databasePromise = undefined; },
    terminated() { databasePromise = undefined; },
  }).catch((error: unknown) => { databasePromise = undefined; throw error; });
  return databasePromise;
}

// Serialize local operations; a read/write transaction also guards competing browser tabs.
let operationTail: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationTail.then(operation, operation);
  operationTail = result.catch(() => undefined);
  return result;
}

export function loadState(): Promise<AppState | null> {
  return serialized(async () => {
    const value = await (await database()).get('snapshots', SNAPSHOT_KEY);
    return value === undefined ? null : parseState(value);
  });
}

export function saveState(state: AppState): Promise<void> {
  // Validate and copy synchronously so mutations after this call cannot change the queued write.
  let snapshot: AppState;
  try { snapshot = parseState(state); } catch (error) { return Promise.reject(error); }
  return serialized(async () => {
    const db = await database();
    const transaction = db.transaction('snapshots', 'readwrite');
    const current = await transaction.store.get(SNAPSHOT_KEY);
    if (current && snapshot.revision < current.revision) {
      await transaction.done;
      throw new Error('Snapshot lebih lama ditolak. Muat ulang progres terbaru sebelum menyimpan.');
    }
    if (current && snapshot.revision === current.revision && JSON.stringify(current) !== JSON.stringify(snapshot)) {
      await transaction.done;
      throw new Error('Konflik revisi progres. Muat ulang sebelum mengubah data.');
    }
    await transaction.store.put(snapshot, SNAPSHOT_KEY);
    await transaction.done;
  });
}

export function clearState(): Promise<void> {
  return serialized(async () => {
    const db = await database();
    const transaction = db.transaction('snapshots', 'readwrite');
    await transaction.store.delete(SNAPSHOT_KEY);
    await transaction.done;
  });
}

/** Intentional import/reset replacement: one transaction, including lower revisions. */
export function replaceState(state: AppState): Promise<void> {
  let snapshot: AppState;
  try { snapshot = parseState(state); } catch (error) { return Promise.reject(error); }
  return serialized(async () => {
    const db = await database();
    const transaction = db.transaction('snapshots', 'readwrite');
    await transaction.store.put(snapshot, SNAPSHOT_KEY);
    await transaction.done;
  });
}

export function exportState(state: AppState): string {
  return JSON.stringify({ format: 'CORETAX_LEARNING_SIMULATOR', schemaVersion: 1, watermark: EXPORT_WATERMARK, syntheticDataOnly: true, state: parseState(state) }, null, 2);
}

/** Parse only: callers explicitly save a successful import. A failed import never writes. */
export function importState(source: string): AppState {
  if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES) throw new Error('Berkas melebihi batas 5 MiB.');
  let raw: unknown;
  try { raw = JSON.parse(source) as unknown; } catch { throw new Error('Berkas bukan JSON simulasi yang valid.'); }
  if (!raw || typeof raw !== 'object' || !('schemaVersion' in raw) || raw.schemaVersion !== 1) throw new Error('Versi schema impor tidak didukung. Hanya versi 1 yang dapat diimpor.');
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    const issue = envelope.error.issues[0];
    throw new Error(`Berkas ekspor simulasi tidak valid (${issue?.path.join('.') || 'envelope'}): ${issue?.message || 'format tidak dikenal'}`);
  }
  return validateReferences(envelope.data.state);
}
