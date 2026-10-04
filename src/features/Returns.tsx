import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { Link } from 'react-router-dom';
import type { AppState, TaxReturnVersion } from '../domain/types';
import { currentInputDecision, needsRepost, type Command } from '../domain/workflow';
import { downloadDocument } from '../components/download';
import { mapFormSection, returnDeadline, invoiceApprovalDeadline } from '../rules/tax';
import { documentInvoices, localTime, periodLabel, returnName, returnStatus, rupiah, wholeSum } from './returnDisplay';

interface Props { state: AppState; dispatch: (command: Command) => void }
type Attachment = 'Induk' | 'A1' | 'A2' | 'B1' | 'B2' | 'B3' | 'Kompensasi' | 'Jejak sumber';
const attachmentLabels: Attachment[] = ['Induk', 'A1', 'A2', 'B1', 'B2', 'B3', 'Kompensasi', 'Jejak sumber'];

function Induk({ state, item }: { state: AppState; item: TaxReturnVersion }) {
  const a = item.amounts;
  const rows: Array<[string, string, string, string]> = [
    ['III.A', 'Pajak Keluaran yang harus dipungut sendiri', a.III_A, 'Penyerahan yang dipungut sendiri; sesudah retur disetujui.'],
    ['III.B', 'PPN disetor di muka', a.III_B, 'Setoran di muka; tidak dihitung ulang pada III.F.'],
    ['III.C', 'Pajak Masukan yang dapat diperhitungkan', a.III_C, 'II.G: PM eligible serta kompensasi yang tersedia.'],
    ['III.D', 'Kelebihan pemungutan PPN', a.III_D, 'Terpisah dari kredit Pajak Masukan.'],
    ['III.E', 'PPN kurang / (lebih) bayar', a.III_E, 'III.A − III.B − III.C − III.D; KB positif, LB negatif.'],
    ['III.F', 'Setoran dikurangi pengembalian sebelum pembetulan', a.III_F, 'Seluruh setoran PPN − pengembalian melalui SKPPKP; untuk pembetulan.'],
    ['III.G', 'PPN kurang / (lebih) bayar karena pembetulan', a.III_G, 'III.E − III.F; untuk pembetulan.'],
    ['VI.A', 'PPnBM yang harus dipungut sendiri', a.VI_A, 'Bucket PPnBM tersendiri; PM hanya mengurangi PPN.'],
    ['VI.B', 'Kelebihan pemungutan PPnBM', a.VI_B, 'Bukan setoran di muka.'],
    ['VI.C', 'PPnBM kurang / (lebih) bayar', a.VI_C, 'VI.A − VI.B.'],
    ['VI.D', 'Setoran PPnBM dikurangi pengembalian', a.VI_D, 'Setoran PPnBM − pengembalian melalui SKPLB; untuk pembetulan.'],
    ['VI.E', 'PPnBM kurang / (lebih) bayar karena pembetulan', a.VI_E, 'VI.C − VI.D; untuk pembetulan.'],
  ];
  const rekap = new Map<string, { documents: number; vat: Decimal }>();
  const sourceInvoices = [...documentInvoices(state, item, 'OUTPUT'), ...documentInvoices(state, item, 'INPUT')];
  for (const invoice of sourceInvoices) {
    const decision = currentInputDecision(state, invoice.id, item.id);
    if (invoice.direction === 'INPUT' && (decision?.creditPeriod !== item.period || (decision?.decision !== 'CREDIT' && decision?.decision !== 'NONCREDIT'))) continue;
    const attachment = invoice.direction === 'OUTPUT' ? 'A2' : decision?.decision === 'CREDIT' ? 'B2' : 'B3';
    const field = mapFormSection(attachment, invoice.transactionCode);
    const existing = rekap.get(field) ?? { documents: 0, vat: new Decimal(0) };
    existing.documents += 1; existing.vat = existing.vat.plus(invoice.vat); rekap.set(field, existing);
  }
  for (const note of state.notes.filter(value => value.taxpayerId === item.taxpayerId && value.status === 'APPROVED' && (item.status === 'DRAFT' ? value.period === item.period : item.lineage.includes(value.id)))) {
    const invoice = state.invoices.find(value => value.id === note.invoiceId);
    if (!invoice) continue;
    const decision = currentInputDecision(state, invoice.id, item.id);
    if (invoice.direction === 'INPUT' && decision?.decision !== 'CREDIT') continue;
    const field = mapFormSection(invoice.direction === 'OUTPUT' ? 'A2' : 'B2', invoice.transactionCode);
    const existing = rekap.get(field) ?? { documents: 0, vat: new Decimal(0) };
    existing.vat = existing.vat.minus(note.vat); rekap.set(field, existing);
  }
  return <><div className="table-scroll"><table className="data-table"><caption>Rekap kasus: hubungan lampiran dan Induk</caption><thead><tr><th>Bagian Induk</th><th>Sumber</th><th>Jumlah dokumen</th><th>PPN setelah retur terkait</th></tr></thead><tbody>{[...rekap].map(([field, total]) => <tr key={field}><th scope="row">{field}</th><td>{field.startsWith('I.') ? 'A2' : field === 'II.H' ? 'B3 — nonkredit' : 'B2'}</td><td>{total.documents}</td><td className="numeric">{rupiah(total.vat.toFixed())}</td></tr>)}<tr><th scope="row">II.G → III.C</th><td>PM yang dapat diperhitungkan, termasuk kompensasi</td><td>—</td><td className="numeric">{rupiah(a.III_C)}</td></tr></tbody></table></div><div className="table-scroll"><table className="data-table"><caption>Induk SPT Masa PPN · angka bertanda dalam rupiah penuh</caption><thead><tr><th>Bagian</th><th>Uraian</th><th>Jumlah (Rp)</th><th>Petunjuk belajar</th></tr></thead><tbody>{rows.map(([code, label, value, hint]) => <tr key={code}><th scope="row">{code}</th><td>{label}</td><td className="numeric"><strong>{rupiah(value)}</strong></td><td>{hint}{item.version === 0 && ['III.F', 'III.G', 'VI.D', 'VI.E'].includes(code) && ' Tidak digunakan sebagai hasil SPT normal.'}</td></tr>)}</tbody></table></div></>;
}

function AttachmentTable({ state, item, tab }: { state: AppState; item: TaxReturnVersion; tab: 'A2' | 'B2' | 'B3' }) {
  const documents = documentInvoices(state, item, tab === 'A2' ? 'OUTPUT' : 'INPUT').filter(invoice => {
    if (tab === 'A2') return true;
    const decision = currentInputDecision(state, invoice.id, item.id);
    return decision?.decision === (tab === 'B2' ? 'CREDIT' : 'NONCREDIT') && decision.creditPeriod === item.period;
  });
  return <><div className="notice"><strong>Mapping {tab}:</strong> {tab === 'A2' ? '04/05 → I.A.2; 06 → I.A.3; 01/09/10 → I.A.4; 02/03 → I.A.6.' : tab === 'B2' ? '04/05 → II.B; 01/09/10 → II.C; 02/03 → II.D. Rekap II.G → III.C.' : 'Dokumen nonkredit → II.H. Dicatat tanpa mengurangi PPN terutang.'}</div><div className="table-scroll"><table className="data-table"><caption>Lampiran {tab} · {item.status === 'DRAFT' ? 'kandidat sumber, belum diposting' : 'sumber hasil posting'}</caption><thead><tr><th>Nomor faktur</th><th>Lawan transaksi</th><th>Tanggal / masa</th><th>Kode</th><th>Bagian Induk</th><th>Harga neto</th><th>DPP</th><th>PPN</th><th>PPnBM</th></tr></thead><tbody>{documents.map(invoice => <tr key={invoice.id}><td>{invoice.number}</td><td>{invoice.counterparty}</td><td>{invoice.date}<br />{invoice.period}</td><td>{invoice.transactionCode}</td><td>{mapFormSection(tab, invoice.transactionCode)}</td><td className="numeric">{rupiah(invoice.net)}</td><td className="numeric" title={`Nilai sumber sebelum pembulatan: ${invoice.dpp}`}>{rupiah(invoice.dpp)}</td><td className="numeric">{rupiah(invoice.vat)}</td><td className="numeric">{rupiah(invoice.luxuryTax)}</td></tr>)}{documents.length === 0 && <tr><td colSpan={9}>Tidak ada dokumen pada lampiran ini dalam kasus terpilih.</td></tr>}</tbody></table></div><p className="muted">Geser tabel horizontal untuk melihat seluruh kolom pada layar kecil. DPP pada tabel ditampilkan hingga dua desimal; mesin menyimpan presisi sumber. Retur ditampilkan terpisah di Jejak sumber dan diperhitungkan satu kali.</p></>;
}

export function Returns({ state, dispatch }: Props) {
  const [selectedId, setSelectedId] = useState('');
  const [focusPeriod, setFocusPeriod] = useState<string | null>(null);
  const [view, setView] = useState('ALL');
  const [tab, setTab] = useState<Attachment>('Induk');
  const [period, setPeriod] = useState('2026-10');
  const [advance, setAdvance] = useState('0');
  const [excess, setExcess] = useState('0');
  const [refundVat, setRefundVat] = useState('0');
  const [refundLuxury, setRefundLuxury] = useState('0');
  const own = state.returns.filter(item => item.taxpayerId === state.actingTaxpayerId).sort((a, b) => b.period.localeCompare(a.period) || b.version - a.version);
  const selected = own.find(item => item.id === selectedId) ?? own.find(item => item.period === focusPeriod && item.status !== 'FILED') ?? own.find(item => item.status !== 'FILED') ?? own[0];
  useEffect(() => {
    setAdvance(selected?.advance ?? '0'); setExcess(selected?.excessCollection ?? '0');
    setRefundVat(selected?.refundVat ?? '0'); setRefundLuxury(selected?.refundLuxury ?? '0');
  }, [selected?.id, selected?.advance, selected?.excessCollection, selected?.refundVat, selected?.refundLuxury]);
  const filtered = own.filter(item => view === 'ALL' || (view === 'CONCEPT' ? ['DRAFT', 'POSTED', 'READY'].includes(item.status) : item.status === view));
  const taxpayer = state.taxpayers.find(item => item.id === state.actingTaxpayerId);
  const role = state.assignments.find(item => item.userId === state.actorUserId && item.taxpayerId === state.actingTaxpayerId && item.active)?.role;
  const certificate = state.certificates.find(item => item.userId === state.actorUserId && item.status === 'ACTIVE');
  const canSign = (role === 'PIC' || role === 'SIGNER') && !!certificate;
  const select = (item: TaxReturnVersion) => { setSelectedId(item.id); setAdvance(item.advance); setExcess(item.excessCollection); setRefundVat(item.refundVat); setRefundLuxury(item.refundLuxury); };
  const receipt = selected && state.receipts.find(item => item.type === 'BPE' && item.objectId === selected.id && item.taxpayerId === state.actingTaxpayerId);
  const payments = selected ? state.payments.filter(item => item.returnId === selected.id && item.taxpayerId === state.actingTaxpayerId) : [];
  const relatedNotes = selected ? state.notes.filter(note => note.taxpayerId === selected.taxpayerId && (selected.status === 'DRAFT' ? note.period === selected.period : selected.lineage.includes(note.id))) : [];
  const compensation = state.compensations.filter(item => item.taxpayerId === state.actingTaxpayerId);
  if (taxpayer?.type !== 'PKP') return <section className="panel"><h1>SPT Masa PPN</h1><p className="notice">Profil aktif bukan PKP. Pilih akun PT Simulasi Niaga Nusantara untuk latihan PPN dan PPnBM. Dokumen badan tidak ditampilkan dalam profil pribadi.</p></section>;
  return <div>
    <div className="page-header"><div><p className="eyebrow">Surat Pemberitahuan (SPT)</p><h1>SPT Masa PPN</h1><p>Konsep, lampiran, Induk, pembayaran, dan riwayat pelaporan.</p></div><span className="badge">DESIGN · alur simulator</span></div>
    <div className="notice"><strong>Waktu latihan: {localTime(state.clock)} WIB.</strong> Konsep normal tersedia sejak tanggal 1 bulan berikutnya. Periksa daftar sebelum membuat konsep tambahan. Data seluruhnya sintetis.</div>
    <section className="panel" aria-label="Daftar SPT">
      <div className="toolbar"><div className="tabs" aria-label="Filter status SPT">{[['ALL', 'Semua SPT'], ['CONCEPT', 'Konsep SPT'], ['AWAITING_PAYMENT', 'Menunggu Pembayaran'], ['FILED', 'SPT Dilaporkan']].map(([value, label]) => <button key={value} className={view === value ? 'active' : ''} onClick={() => setView(value!)} aria-pressed={view === value}>{label}</button>)}</div></div>
      <form className="toolbar" onSubmit={event => { event.preventDefault(); const existing = own.find(item => item.period === period); if (existing) select(existing); else { dispatch({ type: 'CREATE_RETURN', period }); setFocusPeriod(period); setSelectedId(''); } }}><label className="field">Masa SPT baru<input type="month" value={period} onChange={event => setPeriod(event.target.value)} required /></label><button className="button" type="submit">Buat / buka konsep</button></form>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Masa Pajak</th><th>Jenis SPT</th><th>Status proses</th><th>Hasil penghitungan</th><th>Versi aturan</th><th>Tindakan</th></tr></thead><tbody>{filtered.map(item => <tr key={item.id} aria-selected={selected?.id === item.id}><td>{periodLabel(item.period)}</td><td>{item.version === 0 ? 'Normal' : `Pembetulan ke-${item.version}`}</td><td><span className="badge">{returnStatus[item.status]}</span></td><td>{item.status === 'DRAFT' ? 'Belum diposting' : `${item.amounts.status} · ${rupiah(item.version ? item.amounts.III_G : item.amounts.III_E)}`}</td><td>{item.legalRuleVersion}</td><td><button className="button" onClick={() => select(item)} aria-label={`Buka SPT ${returnName(item)}`}>Buka</button></td></tr>)}{filtered.length === 0 && <tr><td colSpan={6}>Belum ada SPT dalam filter ini.</td></tr>}</tbody></table></div>
    </section>
    {selected && <section className="panel" aria-label="Detail SPT">
      <div className="page-header"><div><h2>{returnName(selected)}</h2><p>{taxpayer?.name} · {taxpayer?.npwp}</p></div><span className="badge">{returnStatus[selected.status]}</span></div>
      <div className="notice"><strong>Batas nominal latihan:</strong> persetujuan faktur {invoiceApprovalDeadline(selected.period)}; setor / lapor SPT {returnDeadline(selected.period)}. Billing aktif tidak memperpanjang jatuh tempo. <span className="badge">UNVERIFIED</span> Pergeseran hari libur belum didukung karena kalender resmi berversi belum tersedia.</div>
      {selected.status !== 'DRAFT' && selected.status !== 'FILED' && needsRepost(state, selected) && <p className="notice" role="status"><strong>Sumber berubah — perlu ditinjau ulang.</strong> Batalkan billing aktif bila ada, kemudian posting ulang. Pembayaran dan pelaporan diblokir sampai sumber sesuai.</p>}
      <div className="toolbar"><span>1. Periksa dokumen</span><span>→</span><span>2. Posting</span><span>→</span><span>3. Bayar</span><span>→</span><span>4. Tanda tangan & lapor</span></div>
      {selected.status === 'FILED' ? <div className="notice"><strong>Versi dilaporkan terkunci.</strong> Koreksi membuat versi pembetulan baru; versi dan BPE ini tetap tersimpan. {selected.submittedAt && `Disampaikan ${localTime(selected.submittedAt)} WIB.`}</div> : payments.length > 0 ? <div className="notice">Pembayaran versi ini sudah tercatat. Selesaikan pelaporan dahulu; perubahan sumber atau nilai dilakukan melalui pembetulan.</div> : <details><summary>Setoran di muka dan pengembalian untuk latihan pembetulan</summary><div className="form-grid"><label className="field">III.B — PPN disetor di muka<input inputMode="decimal" value={advance} onChange={event => setAdvance(event.target.value)} /></label><label className="field">III.D — Kelebihan pemungutan PPN<input inputMode="decimal" value={excess} onChange={event => setExcess(event.target.value)} /></label><label className="field">Pengembalian PPN melalui SKPPKP<input inputMode="decimal" value={refundVat} disabled={selected.version === 0} onChange={event => setRefundVat(event.target.value)} /></label><label className="field">Pengembalian PPnBM melalui SKPLB<input inputMode="decimal" value={refundLuxury} disabled={selected.version === 0} onChange={event => setRefundLuxury(event.target.value)} /></label></div><p>Isi rupiah tanpa pemisah ribuan. Pengembalian hanya dipakai dalam pembetulan dan harus memiliki dasar keputusan relevan pada kasus latihan. Jangan memakai setoran yang sama pada III.B dan III.F.</p><button className="button" onClick={() => dispatch({ type: 'SET_RETURN_FIELDS', returnId: selected.id, fields: { advance, excessCollection: excess, refundVat, refundLuxury } })}>Simpan nilai latihan</button></details>}
      <div className="toolbar">
        {selected.status !== 'FILED' && payments.length === 0 && <button className="button primary" onClick={() => dispatch({ type: 'POST_RETURN', returnId: selected.id })}>Posting SPT</button>}
        {selected.status === 'POSTED' && <button className="button primary" onClick={() => dispatch({ type: 'PREPARE_PAYMENT', returnId: selected.id })}>Bayar dan Lapor</button>}
        {selected.status === 'AWAITING_PAYMENT' && <><Link className="button primary" to="/pembayaran">Buat / bayar billing</Link><button className="button" onClick={() => dispatch({ type: 'PAY_DEPOSIT', returnId: selected.id })}>Lunasi dengan deposit</button></>}
        {selected.status === 'READY' && <button className="button primary" disabled={!canSign} onClick={() => dispatch({ type: 'FILE_RETURN', returnId: selected.id })}>Tanda tangan & lapor</button>}
        {selected.status === 'FILED' && <button className="button" onClick={() => { dispatch({ type: 'AMEND_RETURN', returnId: selected.id }); setFocusPeriod(selected.period); setSelectedId(''); }}>Buat pembetulan</button>}
        <Link className="button" to="/pembayaran">Lihat pembayaran</Link>
        {receipt && <button className="button" onClick={() => downloadDocument('Bukti Penerimaan Elektronik — SIMULASI', receipt.number, `SIMULASI BELAJAR • BUKAN LAYANAN DJP\n${taxpayer?.name}\nNPWP sintetis: ${taxpayer?.npwp}\nSPT: ${returnName(selected)}\nWaktu simulasi: ${localTime(receipt.date)} WIB\nNomor: ${receipt.number}\nHasil penghitungan: ${selected.amounts.status}\nPPN: ${rupiah(selected.version ? selected.amounts.III_G : selected.amounts.III_E)}\nPPnBM: ${rupiah(selected.version ? selected.amounts.VI_E : selected.amounts.VI_C)}\nVersi aturan: ${selected.legalRuleVersion}\nTidak sah untuk administrasi atau pembayaran pajak.`)}>Unduh BPE simulasi</button>}
      </div>
      {!canSign && selected.status !== 'FILED' && <p className="notice">Pelaporan memerlukan PIC / signer yang ditugaskan dan KODJP demo aktif. Drafter dapat menyimpan serta menyiapkan konsep. Otorisasi diperiksa kembali oleh domain. <Link to="/profil">Buka profil & KODJP demo →</Link></p>}
      <p>{selected.status === 'DRAFT' ? 'Konsep belum dihitung; angka nol sementara bukan hasil akhir.' : <>Nilai hasil SPT tetap <strong>{selected.amounts.status}</strong> sesudah dibayar.</>} Pembayaran versi ini: <strong>{rupiah(wholeSum(payments.map(item => item.amount)))}</strong>. Nihil dan LB tetap memerlukan pelaporan; BPE baru dibuat setelah pelaporan berhasil.</p>
      <div className="tabs" role="tablist" aria-label="Bagian SPT">{attachmentLabels.map(label => <button key={label} id={`tab-${attachmentLabels.indexOf(label)}`} role="tab" aria-selected={tab === label} className={tab === label ? 'active' : ''} onClick={() => setTab(label)} onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const index = attachmentLabels.indexOf(label); const next = event.key === 'Home' ? 0 : event.key === 'End' ? attachmentLabels.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + attachmentLabels.length) % attachmentLabels.length; setTab(attachmentLabels[next]!); (event.currentTarget.parentElement?.querySelectorAll('button')[next] as HTMLButtonElement | undefined)?.focus(); }}>{label}</button>)}</div>
      <div role="tabpanel" aria-labelledby={`tab-${attachmentLabels.indexOf(tab)}`}>
        {tab === 'Induk' && <Induk state={state} item={selected} />}
        {(tab === 'A2' || tab === 'B2' || tab === 'B3') && <AttachmentTable state={state} item={selected} tab={tab} />}
        {(tab === 'A1' || tab === 'B1') && <div className="notice"><h3>Lampiran {tab} → {tab === 'A1' ? 'I.A.1' : 'II.A'}</h3><p>Tidak ada dokumen {tab === 'A1' ? 'ekspor / PEB' : 'impor / PIB'} dalam persona dagang domestik ini. <strong>Belum disimulasikan:</strong> spesifikasi dokumen, fasilitas, dan expected result per kasus belum lengkap. Angka tidak diisi otomatis.</p></div>}
        {tab === 'Kompensasi' && <><div className="notice">Kompensasi masuk yang dipakai pada posting: <strong>{rupiah(selected.compensation)}</strong>. Setiap sumber, penggunaan, dan penyesuaian mempunyai catatan tersendiri. LB yang mengecil mengurangi kompensasi tujuan; bukan otomatis KB baru. Implementasi penyesuaian adalah <strong>DESIGN — simulasi berbasis aturan; kesiapan produksi belum diverifikasi</strong>.</div><div className="table-scroll"><table className="data-table"><thead><tr><th>Sumber</th><th>Masa asal</th><th>Masa tujuan</th><th>Nilai bertanda</th><th>Penggunaan / relasi</th></tr></thead><tbody>{compensation.map(entry => <tr key={entry.id}><td>{entry.sourceReturnId}</td><td>{entry.sourcePeriod}</td><td>{entry.targetPeriod}</td><td>{rupiah(entry.amount)}</td><td>{entry.adjustmentOf ? `Penyesuaian ${entry.adjustmentOf}` : entry.usedBy ? `Digunakan ${entry.usedBy}` : 'Tersedia'}</td></tr>)}{compensation.length === 0 && <tr><td colSpan={5}>Belum ada saldo kompensasi.</td></tr>}</tbody></table></div><p>Contoh resmi: LB Oktober Rp200.000 dibetulkan menjadi Rp100.000; Rp300.000 yang diteruskan dari November ke Desember menjadi Rp200.000.</p><button className="button" disabled={!canSign || state.scenarioId !== 'compensation' || compensation.some(entry => entry.adjustmentOf)} onClick={() => dispatch({ type: 'COMPENSATION_ADJUST' })}>Catat contoh penyesuaian kompensasi</button>{state.scenarioId !== 'compensation' && <p>Pilih kasus Kompensasi pada ruang belajar untuk menjalankan contoh rantai ini.</p>}</>}
        {tab === 'Jejak sumber' && <><p>Posting menyimpan hubungan dokumen dan sidik data. Posting ulang tidak menambahkan dokumen yang sama dua kali. Perubahan sumber mengharuskan posting / peninjauan ulang sebelum membayar dan melapor.</p><dl><dt>Versi aturan hukum</dt><dd>{selected.legalRuleVersion}</dd><dt>Versi bukti tampilan</dt><dd>{selected.uiEvidenceVersion}</dd><dt>Tanggal observasi</dt><dd>{state.observationDate}</dd><dt>ID versi SPT</dt><dd>{selected.id}</dd><dt>Versi sebelumnya</dt><dd>{selected.previousId ?? 'SPT normal'}</dd><dt>Sumber yang diposting</dt><dd>{selected.lineage.length ? selected.lineage.join(', ') : 'Belum ada sumber tersimpan; lakukan posting.'}</dd></dl><div className="table-scroll"><table className="data-table"><caption>Retur / pembatalan terkait</caption><thead><tr><th>Dokumen</th><th>Jenis</th><th>Tanggal / masa</th><th>Status</th><th>Pengurangan PPN</th></tr></thead><tbody>{relatedNotes.map(note => <tr key={note.id}><td>{note.id}</td><td>{note.kind === 'RETURN' ? 'Retur' : 'Pembatalan'}</td><td>{note.date} / {note.period}</td><td>{note.status}</td><td>{rupiah(note.vat)}</td></tr>)}{relatedNotes.length === 0 && <tr><td colSpan={5}>Tidak ada retur / pembatalan untuk masa ini.</td></tr>}</tbody></table></div></>}
      </div>
      <p className="notice">Lampiran C / bagian VIII hanya untuk PKP sebagai Pihak Lain Pasal 32A UU KUP. Persona ini bukan Pihak Lain atau Pemungut Pasal 16A bagian VII. Proses khusus tersebut <strong>belum disimulasikan</strong>.</p>
      {new Decimal(selected.amounts.VI_A).gt(0) && <p className="notice"><strong>ASSUMPTION — PPnBM pedagogis:</strong> produsen menyerahkan BKP sah tergolong mewah dengan tarif latihan 20%. Tarif tersebut bukan tarif semua barang mahal; PM tidak dapat mengurangi PPnBM.</p>}
    </section>}
  </div>;
}
