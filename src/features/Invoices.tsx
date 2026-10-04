import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import Decimal from 'decimal.js';
import type { AppState, Invoice, InvoiceLine, InputTaxDecision, ReturnNote } from '../domain/types';
import { currentInputDecision, execute, type Command, type InvoiceDraft } from '../domain/workflow';
import { calculateTax, invoiceApprovalDeadline, mapFormSection } from '../rules/tax';
import { downloadDocument } from '../components/download';

type Props = { state: AppState; dispatch: (command: Command) => void };
type Tab = 'output' | 'input' | 'notes';
type Editor = {
  direction: Invoice['direction']; counterparty: string; date: string;
  regime: Invoice['regime']; code: string; eligible: boolean; gross: boolean;
  lines: InvoiceLine[]; originalId?: string; editId?: string;
};
const D = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
const labels: Record<Invoice['status'], string> = {
  DRAFT: 'Draf', VALIDATED: 'Tervalidasi', SIGNED: 'Ditandatangani', APPROVED: 'Disetujui',
};
const decisions: Record<InputTaxDecision['decision'], string> = {
  CREDIT: 'Dikreditkan', NONCREDIT: 'Tidak dikreditkan', NEUTRAL: 'Approved / netral', INVALID: 'Invalid — bukan transaksi pembeli',
};
const rupiah = (value: string): string => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 }).format(Number(value));
const shortDate = (value: string): string => value.split('-').reverse().join('/');
const blankLine = (id: string): InvoiceLine => ({ id, description: 'Barang dagang latihan', quantity: '1', unitPrice: '100000000', discount: '0' });

function invoiceText(invoice: Invoice): string {
  return [
    'SIMULASI BELAJAR • BUKAN LAYANAN DJP',
    `Faktur: ${invoice.number}`, `Tanggal: ${invoice.date}; masa: ${invoice.period}`,
    `Lawan transaksi sintetis: ${invoice.counterparty}`, `Kode transaksi: ${invoice.transactionCode}`,
    ...invoice.lines.map((line) => `${line.description} | ${line.quantity} × ${line.unitPrice} − diskon ${line.discount}`),
    `Harga neto: ${invoice.net}`, `DPP: ${invoice.dpp}`, `PPN: ${invoice.vat}`,
    `PPnBM: ${invoice.luxuryTax}`, `Total: ${invoice.total}`, `Status: ${labels[invoice.status]}`,
    `Versi aturan: ${invoice.legalRuleVersion}`, `Sumber formula: ${invoice.formulaSource}`,
    `PPN sebelum pembulatan: ${invoice.unroundedVat}`,
    'Dokumen latihan lokal. Tidak sah sebagai faktur pajak. Tidak memiliki QR validasi DJP.',
  ].join('\n');
}

export function Invoices({ state, dispatch }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: Tab = requestedTab === 'input' || requestedTab === 'notes' ? requestedTab : 'output';
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('2026-10');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [decisionFor, setDecisionFor] = useState<string | null>(null);
  const [decision, setDecision] = useState<InputTaxDecision['decision']>('CREDIT');
  const [creditPeriod, setCreditPeriod] = useState('2026-10');
  const [reason, setReason] = useState('');
  const [formal, setFormal] = useState(false);
  const [material, setMaterial] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<ReturnNote['kind']>('RETURN');
  const [noteDate, setNoteDate] = useState('2026-10-25');
  const [noteNet, setNoteNet] = useState('20000000');
  const [noteReason, setNoteReason] = useState('Barang dikembalikan pada latihan.');
  const [formError, setFormError] = useState('');
  const [showLimitations, setShowLimitations] = useState(false);
  useEffect(() => {
    setEditor(null); setDetailId(null); setDecisionFor(null); setNoteFor(null);
    setFormError(''); setSearch(''); setPage(1);
  }, [state.actingTaxpayerId]);
  const modalOpen = !!(editor || detailId || decisionFor || noteFor);
  useEffect(() => {
    if (!modalOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]') ?? []);
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { setEditor(null); setDetailId(null); setDecisionFor(null); setNoteFor(null); }
      if (event.key !== 'Tab') return;
      const elements = focusable(), first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previousFocus?.focus(); };
  }, [modalOpen, editor?.originalId, editor?.editId, detailId, decisionFor, noteFor]);
  const taxpayerInvoices = state.invoices.filter((invoice) => invoice.taxpayerId === state.actingTaxpayerId);
  const taxpayerNotes = state.notes.filter((note) => note.taxpayerId === state.actingTaxpayerId);
  const detail = taxpayerInvoices.find((invoice) => invoice.id === detailId);
  const decisionInvoice = taxpayerInvoices.find((invoice) => invoice.id === decisionFor);
  const noteInvoice = taxpayerInvoices.find((invoice) => invoice.id === noteFor);
  const actor = state.users.find((user) => user.id === state.actorUserId);
  const assignment = state.assignments.find((item) => item.userId === state.actorUserId && item.taxpayerId === state.actingTaxpayerId && item.active);
  const canSign = assignment?.role === 'PIC' || assignment?.role === 'SIGNER';
  const filtered = taxpayerInvoices.filter((invoice) => invoice.direction === (tab === 'input' ? 'INPUT' : 'OUTPUT'))
    .filter((invoice) => !period || invoice.period === period)
    .filter((invoice) => !status || invoice.status === status)
    .filter((invoice) => `${invoice.number} ${invoice.counterparty}`.toLowerCase().includes(search.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * 8, currentPage * 8);
  const preview = useMemo(() => {
    if (!editor) return { calculation: null, error: '' };
    try {
      const lineTotal = editor.lines.reduce((sum, line) => {
        const quantity = new D(line.quantity);
        const price = new D(line.unitPrice);
        const discount = new D(line.discount);
        if (quantity.lte(0) || price.lt(0) || discount.lt(0)) throw new Error('Kuantitas harus positif; harga dan diskon tidak boleh negatif.');
        const net = quantity.mul(price).minus(discount);
        if (net.lt(0)) throw new Error('Diskon tidak boleh melebihi nilai barang.');
        return sum.plus(net);
      }, new D(0)).toFixed();
      return { calculation: calculateTax({
        ...(editor.gross ? { gross: lineTotal } : { net: lineTotal }),
        regime: editor.regime, transactionCode: editor.code, ppnbmRate: editor.regime === 'luxury' ? '0.20' : '0',
      }), error: '' };
    } catch (error) { return { calculation: null, error: error instanceof Error ? error.message : 'Angka transaksi tidak valid.' }; }
  }, [editor]);

  function chooseTab(next: Tab) {
    setSearchParams({ tab: next }, { replace: true }); setPage(1); setStatus('');
  }
  function run(command: Command) { dispatch(command); }
  function submitCommand(command: Command): boolean {
    try { execute(state, command); dispatch(command); return true; }
    catch (error) { setFormError(error instanceof Error ? error.message : 'Data belum dapat disimpan.'); return false; }
  }
  function openEditor(original?: Invoice, edit = false) {
    setFormError('');
    setEditor(original ? {
      direction: original.direction, counterparty: original.counterparty, date: original.date,
      regime: original.regime, code: original.transactionCode, eligible: original.eligible,
      gross: false, lines: original.lines.map((line) => ({ ...line })), ...(edit ? { editId: original.id } : { originalId: original.id }),
    } : {
      direction: tab === 'input' ? 'INPUT' : 'OUTPUT', counterparty: state.counterparties[0]?.name ?? 'PT Pelanggan Simulasi',
      date: '2026-10-15', regime: 'nonLuxury', code: '04', eligible: true,
      gross: false, lines: [blankLine('line-1')],
    });
  }
  function updateLine(index: number, key: keyof InvoiceLine, value: string) {
    setEditor((current) => current ? { ...current, lines: current.lines.map((line, idx) => idx === index ? { ...line, [key]: value } : line) } : null);
  }
  function submitInvoice(event: FormEvent) {
    event.preventDefault();
    if (!editor || !preview.calculation) { setFormError(preview.error || 'Periksa data transaksi.'); return; }
    if (editor.lines.some((line) => !line.description.trim())) { setFormError('Nama barang/jasa wajib diisi.'); return; }
    // Convert gross lines without rounding the fractional net, then persist only
    // net lines. The domain recalculates from these lines independently.
    const factor = editor.regime === 'luxury' ? new D('1.32') : new D('1.11');
    const lines = editor.lines.map((line) => editor.gross ? {
      ...line, unitPrice: new D(line.unitPrice).div(factor).toFixed(), discount: new D(line.discount).div(factor).toFixed(),
    } : line);
    const invoice: InvoiceDraft = { direction: editor.direction, counterparty: editor.counterparty,
      date: editor.date, transactionCode: editor.code, regime: editor.regime,
      ppnbmRate: editor.regime === 'luxury' ? '0.20' : '0', lines, eligible: editor.eligible, net: preview.calculation.net,
    };
    const command: Command = editor.originalId ? { type: 'REPLACE_INVOICE', invoiceId: editor.originalId, invoice }
      : editor.editId ? { type: 'UPDATE_INVOICE', invoiceId: editor.editId, invoice } : { type: 'CREATE_INVOICE', invoice };
    if (submitCommand(command)) setEditor(null);
  }
  function openDecision(invoice: Invoice) {
    setDetailId(null);
    const previousDecision = currentInputDecision(state, invoice.id);
    setDecisionFor(invoice.id); setDecision(previousDecision?.decision ?? (invoice.eligible ? 'CREDIT' : 'NONCREDIT'));
    setCreditPeriod(previousDecision?.creditPeriod ?? '2026-10'); setReason(''); setFormal(false); setMaterial(false); setFormError('');
  }
  function submitDecision(event: FormEvent) {
    event.preventDefault();
    if (!decisionInvoice) return;
    if (decision === 'CREDIT' && (!formal || !material)) { setFormError('Periksa dan centang syarat formal serta material sebelum mengkreditkan.'); return; }
    if (submitCommand({ type: 'INPUT_DECISION', invoiceId: decisionInvoice.id, decision, creditPeriod,
      reason: `${reason}${decision === 'CREDIT' ? ' Syarat formal dan material diperiksa pada data sintetis.' : ''}` })) setDecisionFor(null);
  }
  function openNote(invoice: Invoice, kind: ReturnNote['kind']) {
    setNoteFor(invoice.id); setNoteKind(kind); setNoteDate(kind === 'CANCEL' ? invoice.date : '2026-10-25');
    setNoteNet(kind === 'CANCEL' ? invoice.net : '20000000'); setFormError('');
    setNoteReason(kind === 'CANCEL' ? 'Transaksi dibatalkan dalam latihan.' : 'Barang dikembalikan pada latihan.');
  }
  function submitNote(event: FormEvent) {
    event.preventDefault();
    if (!noteInvoice) return;
    if (submitCommand({ type: 'CREATE_NOTE', invoiceId: noteInvoice.id, kind: noteKind, date: noteDate, net: noteNet, reason: noteReason })) {
      setNoteFor(null); chooseTab('notes');
    }
  }
  function invoiceActions(invoice: Invoice) {
    return <div className="row-actions">
      <button className="button small" onClick={() => setDetailId(invoice.id)} aria-label={`Detail ${invoice.number}`}>Detail</button>
      {invoice.status === 'DRAFT' && <button className="button small" onClick={() => { openEditor(invoice, true); setDetailId(null); }}>Ubah draf</button>}
      {invoice.status === 'DRAFT' && <button className="button small" title="Periksa data lokal; belum menandatangani atau menerbitkan faktur" onClick={() => run({ type: 'VALIDATE_INVOICE', invoiceId: invoice.id })}>Validasi</button>}
      {invoice.status === 'VALIDATED' && <button className="button small" disabled={!canSign} title={!canSign ? 'Drafter tidak berwenang menandatangani. Beralih ke PIC atau signer.' : 'KODJP demo aktif diperlukan'} onClick={() => run({ type: 'SIGN_INVOICE', invoiceId: invoice.id })}>Tanda tangani</button>}
      {invoice.status === 'SIGNED' && <button className="button primary small" onClick={() => run({ type: 'APPROVE_INVOICE', invoiceId: invoice.id })}>Approval simulasi</button>}
      {invoice.direction === 'INPUT' && invoice.status === 'APPROVED' && <button className="button small" onClick={() => openDecision(invoice)}>Keputusan PM</button>}
    </div>;
  }

  return <>
    <div className="page-header"><div><p className="eyebrow">e-FAKTUR / ADMINISTRASI FAKTUR</p><h1>{tab === 'output' ? 'Pajak Keluaran' : tab === 'input' ? 'Pajak Masukan' : 'Retur & Pembatalan'}</h1><p>Kelola transaksi, periksa dokumen, lalu lanjutkan ke SPT Masa PPN.</p></div><span className="badge">UI manual 2025 · adaptasi DESIGN</span></div>
    <div className="tabs" aria-label="Bagian e-Faktur">
      <button className={tab === 'output' ? 'active' : ''} aria-pressed={tab === 'output'} onClick={() => chooseTab('output')}>Faktur Keluaran</button>
      <button className={tab === 'input' ? 'active' : ''} aria-pressed={tab === 'input'} onClick={() => chooseTab('input')}>Pajak Masukan</button>
      <button className={tab === 'notes' ? 'active' : ''} aria-pressed={tab === 'notes'} onClick={() => chooseTab('notes')}>Retur & Pembatalan</button>
    </div>
    <section className="panel">
      <div className="toolbar">
        <div><strong>{tab === 'notes' ? 'Dokumen koreksi' : 'Daftar faktur pajak'}</strong><span className="muted"> · WP aktif saja · seluruh identitas sintetis</span></div>
        <div className="row-actions">{tab !== 'notes' && <button className="button primary" onClick={() => openEditor()}>＋ Buat faktur latihan</button>}<button className="button" onClick={() => setShowLimitations((current) => !current)}>Cakupan & bukti</button></div>
      </div>
      {showLimitations && <div className="notice"><strong>DESIGN</strong> Struktur tabel dan toolbar mengacu pada screenshot manual e-Faktur Januari 2025 (evidence-005). Field latihan dan adaptasi mobile merupakan rancangan simulator. <strong>UNVERIFIED:</strong> kesamaan pixel dan pembulatan semua faktur produksi belum diuji. <p><strong>Impor XML: Belum disimulasikan.</strong> Schema Coretax belum diverifikasi. Menyimpan data berbeda dari Upload Faktur/signing. Validasi di sini hanya pemeriksaan lokal. Alur penerbitan yang didukung adalah validasi, signing demo, lalu approval simulasi; tidak ada unggahan ke DJP.</p><p>Fasilitas, pemungut, kode 06 turis asing dan kode 10 penyerahan lainnya belum disimulasikan karena spesifikasi kasus belum lengkap.</p></div>}
      {tab !== 'notes' ? <>
        <div className="filter-row form-grid">
          <label className="field">Cari nomor / lawan transaksi<input aria-label="Cari faktur" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Nomor SIM- atau nama sintetis" /></label>
          <label className="field">Masa faktur<input aria-label="Filter masa faktur" type="month" value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1); }} /></label>
          <label className="field">Status faktur<select aria-label="Status faktur" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Semua status</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <button className="button" onClick={() => { setSearch(''); setStatus(''); setPeriod(''); setPage(1); }}>Hapus filter</button>
        </div>
        {tab === 'input' && <div className="notice">PPN dapat dikreditkan setelah syarat formal/material, status dokumen dan masa diperiksa. PPnBM tidak dikreditkan sebagai PM. Status <strong>invalid</strong> berarti bukan transaksi pembeli, bukan kegagalan validasi penerbitan.</div>}
        {!canSign && <div className="notice">Aktor {actor?.name ?? 'demo'}: {assignment?.role ?? 'belum ditugaskan'}. Drafter dapat menyimpan dan memvalidasi draf; penandatanganan memerlukan PIC atau signer dengan KODJP demo aktif.</div>}
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Daftar faktur; geser horizontal untuk semua kolom">
          <table className="data-table"><thead><tr><th>Nomor Faktur Pajak</th><th>{tab === 'input' ? 'Nama Penjual' : 'Nama Pembeli'}</th><th>Kode Transaksi</th><th>Tanggal Faktur</th><th>Harga Neto</th><th>DPP</th><th>PPN</th><th>PPnBM</th><th>Status</th>{tab === 'input' && <th>Pengkreditan</th>}<th>Tindakan</th></tr></thead>
            <tbody>{rows.map((invoice) => {
              const inputDecision = currentInputDecision(state, invoice.id);
              return <tr key={invoice.id}><td><button className="text-button" onClick={() => setDetailId(invoice.id)}>{invoice.number}</button>{invoice.originalId && <small>Faktur pengganti</small>}</td><td>{invoice.counterparty}</td><td>{invoice.transactionCode}</td><td>{shortDate(invoice.date)}</td><td className="money">{rupiah(invoice.net)}</td><td className="money">{rupiah(invoice.dpp)}</td><td className="money">{rupiah(invoice.vat)}</td><td className="money">{rupiah(invoice.luxuryTax)}</td><td><span className={`badge ${invoice.status.toLowerCase()}`}>{labels[invoice.status]}</span></td>{tab === 'input' && <td>{inputDecision ? <>{decisions[inputDecision.decision]}<small>Masa {inputDecision.creditPeriod}</small></> : 'Belum diputuskan'}{!invoice.eligible && <small>Tidak eligible</small>}</td>}<td>{invoiceActions(invoice)}</td></tr>;
            })}{rows.length === 0 && <tr><td colSpan={tab === 'input' ? 11 : 10} className="empty-state">Tidak ada faktur pada filter ini. Hapus filter atau buat faktur latihan.</td></tr>}</tbody>
          </table>
        </div>
        <div className="pagination"><span>{filtered.length} dokumen · Halaman {currentPage} dari {pages}</span><div className="row-actions"><button className="button small" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Sebelumnya</button><button className="button small" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Berikutnya</button></div></div>
      </> : <>
        <div className="notice">Buka <strong>Detail</strong> faktur yang disetujui untuk membuat retur, pengganti, atau pembatalan. Retur memengaruhi masa tanggal retur; pengganti mengikuti masa faktur asal. Catatan draf atau ditolak belum mengubah pajak.</div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Daftar retur dan pembatalan"><table className="data-table"><thead><tr><th>Dokumen / asal</th><th>Jenis</th><th>Tanggal / masa</th><th>Harga neto</th><th>Pengurangan PPN</th><th>Alasan</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>{taxpayerNotes.map((note) => <tr key={note.id}><td>{note.id}<small>{taxpayerInvoices.find((invoice) => invoice.id === note.invoiceId)?.number}</small></td><td>{note.kind === 'RETURN' ? 'Retur' : 'Pembatalan'}</td><td>{shortDate(note.date)}<small>{note.period}</small></td><td className="money">{rupiah(note.net)}</td><td className="money">{rupiah(note.vat)}</td><td>{note.reason}</td><td><span className="badge">{note.status === 'DRAFT' ? 'Draf' : note.status === 'APPROVED' ? 'Disetujui' : 'Ditolak'}</span></td><td>{note.status === 'DRAFT' ? <div className="row-actions"><button className="button primary small" disabled={!canSign} onClick={() => run({ type: 'DECIDE_NOTE', noteId: note.id, approve: true })}>Setujui</button><button className="button small" disabled={!canSign} onClick={() => run({ type: 'DECIDE_NOTE', noteId: note.id, approve: false })}>Tolak</button></div> : <button className="button small" onClick={() => downloadDocument(note.kind === 'RETURN' ? 'Nota retur simulasi' : 'Pembatalan simulasi', `SIM-${note.id.replace(/^SIM-/, '')}`, `SIMULASI BELAJAR • BUKAN LAYANAN DJP\nDokumen asal: ${note.invoiceId}\nTanggal: ${note.date}\nMasa: ${note.period}\nHarga neto: ${note.net}\nPPN: ${note.vat}\nStatus: ${note.status}\nAlasan: ${note.reason}`)}>Unduh</button>}</td></tr>)}{taxpayerNotes.length === 0 && <tr><td colSpan={8} className="empty-state">Belum ada dokumen koreksi. Mulai dari detail faktur keluaran.</td></tr>}</tbody></table></div>
      </>}
    </section>
    {state.mode === 'TERPANDU' && <section className="card learning-tip"><strong>Urutan belajar</strong><p>1. Simpan draf → 2. Validasi → 3. Tanda tangani → 4. Approval simulasi → 5. Putuskan kredit PM → 6. Posting SPT.</p><p>Batas persetujuan faktur masa Oktober: <strong>20 November 2026</strong>. Batas setor/lapor SPT PPN berbeda, yaitu akhir bulan berikutnya sebelum penyesuaian kalender libur.</p></section>}

    {editor && <div className="modal-backdrop" onClick={() => setEditor(null)}><section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="invoice-editor-title" onClick={(event) => event.stopPropagation()}><div className="modal-header"><h2 id="invoice-editor-title">{editor.originalId ? 'Buat faktur pengganti' : editor.editId ? 'Ubah draf faktur' : 'Buat faktur latihan'}</h2><button className="button" aria-label="Tutup editor faktur" onClick={() => setEditor(null)}>×</button></div>
      <p className="notice">SIMULASI BELAJAR • BUKAN LAYANAN DJP · Identitas dipilih dari data sintetis. Simpan menghasilkan draf; approval merupakan tahap terpisah.</p>
      {editor.originalId && <p className="notice">Faktur asal tetap immutable. Pengganti baru mengikuti masa faktur asal dan baru berlaku setelah approval.</p>}
      <form onSubmit={submitInvoice}>
        <div className="form-grid"><label className="field">Jenis faktur<select aria-label="Jenis faktur" value={editor.direction} disabled={!!editor.originalId} onChange={(event) => setEditor({ ...editor, direction: event.target.value as Invoice['direction'] })}><option value="OUTPUT">Pajak Keluaran</option><option value="INPUT">Pajak Masukan sintetis</option></select></label><label className="field">Lawan transaksi sintetis<select aria-label="Lawan transaksi sintetis" value={editor.counterparty} onChange={(event) => setEditor({ ...editor, counterparty: event.target.value })}>{[...new Set([...state.counterparties.map((party) => party.name), editor.counterparty])].map((name) => <option key={name}>{name}</option>)}</select></label><label className="field">Tanggal faktur<input required type="date" value={editor.date} disabled={!!editor.originalId} onChange={(event) => setEditor({ ...editor, date: event.target.value })} /></label><label className="field">Rezim transaksi<select aria-label="Rezim transaksi" value={editor.regime} onChange={(event) => { const regime = event.target.value as Invoice['regime']; setEditor({ ...editor, regime, code: regime === 'luxury' ? '01' : '04' }); }}><option value="nonLuxury">Nonmewah umum · PMK 131/2024</option><option value="luxury">Produsen BKP mewah · asumsi PPnBM 20%</option></select></label><label className="field">Kode transaksi<select aria-label="Kode transaksi" value={editor.code} onChange={(event) => setEditor({ ...editor, code: event.target.value })}><option value="04">04 — DPP nilai lain</option><option value="01">01 — penyerahan dipungut sendiri</option><option value="02">02 — pemungut pemerintah (belum didukung)</option><option value="03">03 — pemungut lainnya (belum didukung)</option><option value="05">05 — besaran tertentu (belum didukung)</option><option value="06">06 — skema turis asing (belum didukung)</option><option value="07">07 — tidak dipungut / ditanggung pemerintah (belum didukung)</option><option value="08">08 — dibebaskan (belum didukung)</option><option value="09">09 — penyerahan aktiva (belum didukung)</option><option value="10">10 — penyerahan lainnya (belum didukung)</option></select></label><label className="field">Harga pada rincian<select aria-label="Harga pada rincian" value={editor.gross ? 'gross' : 'net'} onChange={(event) => setEditor({ ...editor, gross: event.target.value === 'gross' })}><option value="net">Sebelum PPN / PPnBM</option><option value="gross">Termasuk PPN / PPnBM</option></select></label></div>
        {editor.regime === 'luxury' && <p className="notice"><strong>ASSUMPTION:</strong> produsen menyerahkan BKP yang sah tergolong mewah. PPnBM 20% adalah tarif latihan; harga mahal saja tidak menentukan klasifikasi mewah.</p>}
        <h3>Rincian transaksi</h3><p className="muted">Geser tabel ke samping untuk melihat harga, diskon, dan tindakan.</p>
        <div className="table-scroll" tabIndex={0}><table className="data-table"><thead><tr><th>Barang / jasa</th><th>Kuantitas</th><th>Harga satuan (Rp)</th><th>Diskon total (Rp)</th><th>Tindakan</th></tr></thead><tbody>{editor.lines.map((line, index) => <tr key={line.id}><td><input required aria-label={`Nama barang ${index + 1}`} value={line.description} onChange={(event) => updateLine(index, 'description', event.target.value)} /></td><td><input required type="number" min="0.0001" step="any" aria-label={`Kuantitas ${index + 1}`} value={line.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} /></td><td><input required type="number" min="0" step="any" aria-label={`Harga satuan ${index + 1}`} value={line.unitPrice} onChange={(event) => updateLine(index, 'unitPrice', event.target.value)} /></td><td><input required type="number" min="0" step="any" aria-label={`Diskon ${index + 1}`} value={line.discount} onChange={(event) => updateLine(index, 'discount', event.target.value)} /></td><td><button type="button" className="button small" disabled={editor.lines.length === 1} onClick={() => setEditor({ ...editor, lines: editor.lines.filter((_, idx) => idx !== index) })}>Hapus baris</button></td></tr>)}</tbody></table></div>
        <button type="button" className="button" onClick={() => setEditor({ ...editor, lines: [...editor.lines, blankLine(`line-${Math.max(0, ...editor.lines.map((line) => Number(line.id.replace(/\D/g, '')) || 0)) + 1}`)] })}>＋ Tambah rincian</button>
        {editor.direction === 'INPUT' && <label className="checkbox-field"><input type="checkbox" checked={editor.eligible} onChange={(event) => setEditor({ ...editor, eligible: event.target.checked })} />Dokumen latihan memenuhi syarat material/formal (eligible). Keputusan kredit dilakukan terpisah.</label>}
        {preview.calculation && <div className="card calculation"><h3>Pratinjau perhitungan</h3><dl className="definition-grid"><div><dt>Harga neto</dt><dd>{rupiah(preview.calculation.net)}</dd></div><div><dt>{editor.regime === 'nonLuxury' ? 'DPP nilai lain · 11/12 × neto' : 'DPP · harga neto'}</dt><dd>{rupiah(preview.calculation.dpp)}</dd></div><div><dt>PPN · tarif hukum 12%</dt><dd>{rupiah(preview.calculation.vat)}</dd></div><div><dt>PPnBM {editor.regime === 'luxury' ? 'latihan 20%' : 'tidak dikenakan'}</dt><dd>{rupiah(preview.calculation.luxuryTax)}</dd></div><div><dt>Total tagihan</dt><dd>{rupiah(preview.calculation.total)}</dd></div></dl><p>{preview.calculation.formulaSource}</p>{editor.gross && <p>Harga bruto dibagi {editor.regime === 'nonLuxury' ? '1,11' : '1,32'} untuk memperoleh neto. Faktor 11/12 digunakan untuk DPP, bukan untuk mengeluarkan PPN dari bruto.</p>}<small>DPP disimpan tanpa pembulatan awal. Tampilan mata uang dipersingkat; aturan pembulatan SPT rupiah penuh tidak menjamin semua faktur produksi identik.</small></div>}
        {(preview.error || formError) && <p className="notice error" role="alert">{formError || preview.error}</p>}
        <div className="modal-footer"><button type="button" className="button" onClick={() => setEditor(null)}>Batal</button><button className="button primary" disabled={!preview.calculation}>Simpan draf</button></div>
      </form>
    </section></div>}

    {detail && <div className="modal-backdrop" onClick={() => setDetailId(null)}><section className="modal wide" role="dialog" aria-modal="true" aria-labelledby="invoice-detail-title" onClick={(event) => event.stopPropagation()}><div className="modal-header"><h2 id="invoice-detail-title">Detail faktur {detail.number}</h2><button className="button" aria-label="Tutup detail faktur" onClick={() => setDetailId(null)}>×</button></div><p className="notice">SIMULASI BELAJAR • BUKAN LAYANAN DJP · {detail.status === 'APPROVED' ? 'Dokumen disetujui bersifat immutable. Koreksi membuat relasi atau versi baru.' : 'Draf melalui validasi dan penandatanganan sebelum approval.'}</p>
      <dl className="definition-grid"><div><dt>Lawan transaksi</dt><dd>{detail.counterparty}</dd></div><div><dt>Status faktur</dt><dd>{labels[detail.status]}</dd></div><div><dt>Tanggal / masa faktur</dt><dd>{shortDate(detail.date)} / {detail.period}</dd></div><div><dt>Kode / mapping SPT</dt><dd>{detail.transactionCode} / {mapFormSection(detail.direction === 'OUTPUT' ? 'A2' : 'B2', detail.transactionCode)}</dd></div><div><dt>Harga neto</dt><dd>{rupiah(detail.net)}</dd></div><div><dt>DPP {detail.regime === 'nonLuxury' && 'nilai lain'}</dt><dd>{rupiah(detail.dpp)}</dd></div><div><dt>PPN</dt><dd>{rupiah(detail.vat)}</dd></div><div><dt>PPnBM</dt><dd>{rupiah(detail.luxuryTax)}</dd></div><div><dt>Total</dt><dd>{rupiah(detail.total)}</dd></div><div><dt>Batas approval nominal</dt><dd>{shortDate(invoiceApprovalDeadline(detail.period))}</dd></div></dl>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Barang / jasa</th><th>Kuantitas</th><th>Harga satuan</th><th>Diskon</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{rupiah(line.unitPrice)}</td><td>{rupiah(line.discount)}</td></tr>)}</tbody></table></div>
      <details><summary>Formula, versi aturan, dan lineage</summary><p>{detail.formulaSource}</p><p>legalRuleVersion: {detail.legalRuleVersion}</p><p>PPN sebelum pembulatan: {detail.unroundedVat}</p><p className="long-value">DPP tersimpan: {detail.dpp}</p><p>Faktur asal: {detail.originalId ? taxpayerInvoices.find((invoice) => invoice.id === detail.originalId)?.number ?? detail.originalId : 'Dokumen pertama (bukan pengganti)'}</p><p>PPN/PPnBM pada SPT memakai pembulatan rupiah penuh half-up (Lampiran PER-11/PJ/2025 PDF 190).</p></details>
      {detail.direction === 'INPUT' && <details><summary>Riwayat keputusan Pajak Masukan</summary><p>Keputusan terbaru: {currentInputDecision(state, detail.id) ? decisions[currentInputDecision(state, detail.id)!.decision] : 'Belum diputuskan'}. SPT yang dilaporkan mempertahankan lineage keputusan saat pelaporan.</p><ol>{state.decisions.filter((item) => item.taxpayerId === state.actingTaxpayerId && item.invoiceId === detail.id).map((item) => <li key={item.id}><strong>{decisions[item.decision]}</strong> · Masa {item.creditPeriod} · {item.reason}<small>Dokumen {item.id}{item.previousId ? ` · menggantikan ${item.previousId}` : ''}</small></li>)}</ol></details>}<div className="modal-footer">{invoiceActions(detail)}<button className="button" onClick={() => downloadDocument('Faktur pajak simulasi', detail.number, invoiceText(detail))}>Unduh faktur simulasi</button>{detail.status === 'APPROVED' && <><button className="button" onClick={() => { openNote(detail, 'RETURN'); setDetailId(null); }}>Buat retur</button><button className="button" onClick={() => { openEditor(detail); setDetailId(null); }}>Buat pengganti</button><button className="button danger" onClick={() => { openNote(detail, 'CANCEL'); setDetailId(null); }}>Pembatalan</button></>}</div>
    </section></div>}

    {decisionInvoice && <div className="modal-backdrop" onClick={() => setDecisionFor(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="decision-title" onClick={(event) => event.stopPropagation()}><div className="modal-header"><h2 id="decision-title">Keputusan Pajak Masukan</h2><button className="button" aria-label="Tutup keputusan PM" onClick={() => setDecisionFor(null)}>×</button></div><p>{decisionInvoice.number} · PPN {rupiah(decisionInvoice.vat)} · Masa faktur {decisionInvoice.period}</p><p className="notice">SIMULASI BELAJAR • BUKAN LAYANAN DJP · Faktur Januari dapat dikreditkan Januari–April melalui jalur biasa jika eligible. Mei memerlukan analisis jalur pembetulan; hak kredit tidak otomatis hilang.</p>{currentInputDecision(state, decisionInvoice.id) && <p className="notice">Keputusan tersimpan: <strong>{decisions[currentInputDecision(state, decisionInvoice.id)!.decision]}</strong>. Keputusan baru menyimpan riwayat sebelumnya. Koreksi keputusan yang sudah digunakan SPT dilaporkan memerlukan konsep pembetulan.</p>}<form onSubmit={submitDecision}><div className="form-grid"><label className="field">Keputusan<select aria-label="Keputusan" value={decision} onChange={(event) => setDecision(event.target.value as InputTaxDecision['decision'])}>{Object.entries(decisions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field">Masa kredit / pencatatan<input required type="month" value={creditPeriod} onChange={(event) => setCreditPeriod(event.target.value)} /></label></div><label className="field">Alasan keputusan<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Tuliskan hasil pemeriksaan dokumen sintetis" /></label>{decision === 'CREDIT' && <><label className="checkbox-field"><input type="checkbox" checked={formal} onChange={(event) => setFormal(event.target.checked)} />Syarat formal dan status dokumen telah diperiksa.</label><label className="checkbox-field"><input type="checkbox" checked={material} onChange={(event) => setMaterial(event.target.checked)} />Syarat material terpenuhi dan bukan pengkreditan ganda.</label>{!decisionInvoice.eligible && <p className="notice error">Fixture ini tidak eligible. Tetap dicatat, tetapi keputusan kredit akan ditolak oleh domain.</p>}</>}{formError && <p className="notice error" role="alert">{formError}</p>}<div className="modal-footer"><button className="button" type="button" onClick={() => setDecisionFor(null)}>Batal</button><button className="button primary">Simpan keputusan PM</button></div></form></section></div>}

    {noteInvoice && <div className="modal-backdrop" onClick={() => setNoteFor(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="note-title" onClick={(event) => event.stopPropagation()}><div className="modal-header"><h2 id="note-title">{noteKind === 'RETURN' ? 'Buat nota retur' : 'Pembatalan faktur'}</h2><button className="button" aria-label="Tutup koreksi faktur" onClick={() => setNoteFor(null)}>×</button></div><p>{noteInvoice.number} · Neto asal {rupiah(noteInvoice.net)}</p><p className="notice">SIMULASI BELAJAR • BUKAN LAYANAN DJP · {noteKind === 'RETURN' ? 'Retur Oktober mengurangi PK Oktober; retur November mengurangi PK November. Draf belum memengaruhi angka. Nilai kumulatif tidak boleh melebihi faktur.' : 'Pembatalan meniadakan transaksi melalui dokumen baru; faktur asal dan audit tetap tersedia.'}</p><form onSubmit={submitNote}><div className="form-grid"><label className="field">Tanggal {noteKind === 'RETURN' ? 'retur' : 'pembatalan'}<input required type="date" value={noteDate} onChange={(event) => setNoteDate(event.target.value)} /></label><label className="field">Harga neto {noteKind === 'RETURN' ? 'diretur' : 'dibatalkan'} (Rp)<input required readOnly={noteKind === 'CANCEL'} type="number" min="1" step="any" value={noteNet} onChange={(event) => setNoteNet(event.target.value)} /></label></div><label className="field">Alasan<textarea required value={noteReason} onChange={(event) => setNoteReason(event.target.value)} /></label>{formError && <p className="notice error" role="alert">{formError}</p>}<div className="modal-footer"><button type="button" className="button" onClick={() => setNoteFor(null)}>Batal</button><button className="button primary">Simpan draf {noteKind === 'RETURN' ? 'retur' : 'pembatalan'}</button></div></form></section></div>}
  </>;
}
