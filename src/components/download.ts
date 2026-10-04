const WATERMARK = 'SIMULASI BELAJAR • BUKAN LAYANAN DJP';
export function downloadDocument(title: string, number: string, body: string): void {
  const safeNumber = number.startsWith('SIM-') ? number : `SIM-${number}`;
  const blob = new Blob([`${WATERMARK}\n${'='.repeat(56)}\n${title}\nNomor: ${safeNumber}\n\n${body}\n\n${WATERMARK}\nDokumen latihan lokal. Tidak sah untuk pelaporan atau pembayaran pajak.\nTanpa QR dan tanpa validasi DJP.`], {type:'text/plain;charset=utf-8'});
  downloadBlob(blob, `${safeNumber.replace(/[^a-zA-Z0-9-]/g,'-')}.txt`);
}
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
