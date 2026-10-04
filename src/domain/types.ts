export type Money = string;
export type Role = 'PIC' | 'DRAFTER' | 'SIGNER';
export type Mode = 'TERPANDU' | 'MANDIRI' | 'UJIAN';
export type EvidenceLabel = 'VERIFIED' | 'DESIGN' | 'ASSUMPTION' | 'UNVERIFIED';
export interface User { id: string; name: string; login: string; role: Role; activated: boolean; twoFactor: boolean }
export interface Taxpayer { id: string; name: string; npwp: string; type: 'PERSONAL' | 'PKP'; tkuId: string }
export interface RelatedParty { id: string; taxpayerId: string; userId: string; relationship: string }
export interface RoleAssignment { id: string; userId: string; taxpayerId: string; role: Role; active: boolean }
export interface TKU { id: string; taxpayerId: string; name: string; nitku: string }
export interface Certificate { id: string; userId: string; status: 'INACTIVE' | 'ACTIVE'; issuedAt: string; kind: 'KODJP_DEMO' }
export interface Counterparty { id: string; name: string; npwp: string }
export interface InvoiceLine { id: string; description: string; quantity: string; unitPrice: Money; discount: Money }
export interface Invoice {
  id: string; taxpayerId: string; number: string; direction: 'OUTPUT' | 'INPUT'; counterparty: string;
  date: string; period: string; transactionCode: string; regime: 'nonLuxury' | 'luxury'; ppnbmRate: string;
  lines: InvoiceLine[]; net: Money; dpp: Money; vat: Money; luxuryTax: Money; total: Money; unroundedVat: string; unroundedLuxuryTax: string;
  status: 'DRAFT' | 'VALIDATED' | 'SIGNED' | 'APPROVED'; eligible: boolean;
  legalRuleVersion: string; formulaSource: string; originalId?: string; createdBy: string; approvedAt?: string;
}
export interface ReturnNote { id: string; taxpayerId: string; invoiceId: string; kind: 'RETURN' | 'CANCEL'; date: string; period: string; net: Money; vat: Money; luxuryTax: Money; status: 'DRAFT' | 'APPROVED' | 'REJECTED'; reason: string }
export interface OtherDocument { id: string; taxpayerId: string; type: string; status: 'UNSUPPORTED'; reason: string }
export interface InputTaxDecision { id: string; taxpayerId: string; invoiceId: string; creditPeriod: string; decision: 'CREDIT' | 'NONCREDIT' | 'NEUTRAL' | 'INVALID'; reason: string; previousId?: string }
export interface ReturnAmounts { III_A: Money; III_B: Money; III_C: Money; III_D: Money; III_E: Money; III_F: Money; III_G: Money; VI_A: Money; VI_B: Money; VI_C: Money; VI_D: Money; VI_E: Money; status: 'KB' | 'LB' | 'NIHIL'; payableVat: Money; payableLuxury: Money; compensationOut: Money }
export interface TaxReturnVersion {
  id: string; taxpayerId: string; period: string; version: number; status: 'DRAFT' | 'POSTED' | 'AWAITING_PAYMENT' | 'READY' | 'FILED';
  amounts: ReturnAmounts; lineage: string[]; sourceFingerprint: string; legalRuleVersion: string; uiEvidenceVersion: string;
  previousId?: string; submittedAt?: string; compensation: Money; advance: Money; excessCollection: Money; refundVat: Money; refundLuxury: Money;
}
export interface CompensationEntry { id: string; taxpayerId: string; sourceReturnId: string; sourcePeriod: string; targetPeriod: string; amount: Money; usedBy?: string; adjustmentOf?: string }
export interface Billing { id: string; taxpayerId: string; returnId: string; number: string; bucket: 'PPN' | 'PPNBM'; amount: Money; issuedAt: string; status: 'ACTIVE' | 'CANCELLED' | 'PAID'; expiresAt: string }
export interface Payment { id: string; taxpayerId: string; returnId: string; billingId?: string; bucket: 'PPN' | 'PPNBM'; amount: Money; date: string; method: 'BILLING' | 'DEPOSIT' }
export interface DepositLot { id: string; taxpayerId: string; amount: Money; source: string; date: string }
export interface Allocation { id: string; taxpayerId: string; depositId: string; paymentId: string; amount: Money }
export interface LedgerEntry { id: string; taxpayerId: string; date: string; kind: 'DEPOSIT' | 'PAYMENT' | 'LIABILITY' | 'COMPENSATION' | 'ADJUSTMENT'; debit: Money; credit: Money; referenceId: string; description: string }
export interface Notification { id: string; taxpayerId: string; title: string; text: string; read: boolean }
export interface SimulatedReceipt { id: string; taxpayerId: string; type: 'BPE' | 'PAYMENT'; number: string; objectId: string; date: string; watermark: string }
export interface Scenario { id: string; title: string; description: string; expectedVat: Money; expectedLuxury: Money; expectedStatus: 'KB' | 'LB' | 'NIHIL'; tasks: string[] }
export interface AuditEvent { id: string; actorUserId: string; actingTaxpayerId: string; objectId: string; action: string; at: string }
export interface AppState {
  schemaVersion: 1; revision: number; clock: string; observationDate: string; scenarioId: string; mode: Mode;
  actorUserId: string | null; actingTaxpayerId: string; users: User[]; taxpayers: Taxpayer[]; relatedParties: RelatedParty[]; assignments: RoleAssignment[]; tkus: TKU[]; certificates: Certificate[]; counterparties: Counterparty[];
  invoices: Invoice[]; notes: ReturnNote[]; otherDocuments: OtherDocument[]; decisions: InputTaxDecision[]; returns: TaxReturnVersion[]; compensations: CompensationEntry[]; billings: Billing[]; payments: Payment[]; deposits: DepositLot[]; allocations: Allocation[]; ledger: LedgerEntry[]; notifications: Notification[]; receipts: SimulatedReceipt[]; audit: AuditEvent[];
  learning: { hints: number; attempts: number; lastScore: number | null; answers: Record<string, string> };
}
