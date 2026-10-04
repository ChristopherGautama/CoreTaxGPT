import Decimal from 'decimal.js';
import { currentInputDecision } from '../domain/workflow';
import type { AppState, Invoice, TaxReturnVersion } from '../domain/types';

export function rupiah(value: string): string {
  const rendered = new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed();
  const [integer = '0', fraction] = rendered.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${grouped}${fraction ? `,${fraction}` : ''}`;
}
export function wholeSum(values: string[]): string {
  return values.reduce((total, value) => total.plus(value), new Decimal(0)).toFixed();
}
export function localTime(value: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(value));
}
export function periodLabel(value: string): string {
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
}
export const returnStatus: Record<TaxReturnVersion['status'], string> = {
  DRAFT: 'Konsep', POSTED: 'Sudah diposting', AWAITING_PAYMENT: 'Menunggu pembayaran', READY: 'Siap dilaporkan', FILED: 'Dilaporkan',
};
export function returnName(item: TaxReturnVersion): string {
  return `${periodLabel(item.period)} · ${item.version === 0 ? 'Normal' : `Pembetulan ke-${item.version}`}`;
}
export function documentInvoices(state: AppState, item: TaxReturnVersion, direction: Invoice['direction']): Invoice[] {
  const superseded = new Set(state.invoices.filter(invoice => invoice.taxpayerId === item.taxpayerId && invoice.status === 'APPROVED' && invoice.originalId).map(invoice => invoice.originalId));
  return state.invoices.filter(invoice => invoice.taxpayerId === item.taxpayerId && invoice.direction === direction && (item.status === 'DRAFT'
    ? invoice.status === 'APPROVED' && !superseded.has(invoice.id) && (direction === 'OUTPUT' ? invoice.period === item.period : currentInputDecision(state, invoice.id)?.creditPeriod === item.period)
    : item.lineage.includes(invoice.id) || state.decisions.some(decision => decision.invoiceId === invoice.id && item.lineage.includes(decision.id))));
}
