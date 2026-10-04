# Rencana QA simulator — snapshot 4 Oktober 2026

Status dokumen: **DESIGN**. Daftar ini adalah rencana pemeriksaan, bukan klaim hasil PASS. Hasil eksekusi aktual dicatat terpisah di laporan QA.

Clock fixture: 15 November 2026. Masa dasar: Oktober 2026. Hasil dinilai memakai fungsi pajak dan workflow yang sama pada mode Terpandu, Mandiri, dan Ujian.

| # | Acceptance case | Pemeriksaan domain / integrasi | Pemeriksaan UI |
|---|---|---|---|
| 1 | Akses drafter dan isolasi WP | Draft dapat disimpan; command signing ditolak; objek WP lain tidak dapat dimutasi | Login drafter; URL langsung faktur; ubah WP; tabel dan tindakan mengikuti scope |
| 2 | PPN umum dan pembulatan | Neto 100 juta → PPN 11 juta; bruto 111 juta → neto 100 juta; 100,49 → 100; 100,50 → 101 | Rincian faktur menjelaskan tarif hukum 12% dan DPP 11/12 |
| 3 | KB dasar | PK 55 juta; PM 22 juta; kompensasi 3 juta; KB 30 juta | Posting → lampiran/Induk → billing → bayar → lapor → BPE |
| 4 | LB dan nihil | Penjualan 100 juta/pembelian 250 juta → LB 16,5 juta; 200 juta/200 juta → nihil | Keduanya tetap perlu penyampaian; BPE belum tersedia sebelum lapor |
| 5 | Pengkreditan PM | Januari–April eligible; Mei ditolak dengan penjelasan pembetulan; double credit ditolak; noneligible 5 juta → KB 35 juta | Empat keputusan PM tampil berbeda; alasan tidak eligible tersedia |
| 6 | Retur | Retur approved Oktober 20 juta → PK turun 2,2 juta dan KB 27,8 juta; retur November pada November; rejected netral | Buat retur → keputusan → posting ulang; sumber berubah diberi penanda |
| 7 | Billing | 335 jam 59 menit aktif; 336 jam expired; tidak dapat bayar expired/paid dua kali | Waktu simulasi dapat diubah; batal → konsep → terbit ulang |
| 8 | Pembetulan signed | Setoran 30 juta: III.E 32,2 juta → KB 2,2 juta; 24,5 juta → LB 5,5 juta; refund 10 juta/E −8 juta → tambahan 2 juta | Versi asli immutable; versi baru memiliki asal, lampiran dan jumlah berbeda |
| 9 | Kompensasi dan transisi | Contoh 200 ribu → 100 ribu, November 300 ribu → Desember 200 ribu; tidak membuat KB semu; 30 Sep/1 Okt untuk SPT Agustus yang telah dilaporkan | Ledger sumber/penggunaan/penyesuaian; versi aturan dan batas verifikasi produksi tampak |
| 10 | PPnBM, persistensi dan reset | Neto 1 miliar → PPN 120 juta/PPnBM 200 juta; PM 22 juta → PPN 98 juta; reload/export/import/reset | Dua bucket terpisah; unduhan SIM- dan watermark; progres kembali benar |

## Penyimpanan dan impor

- IndexedDB menyimpan satu snapshot per transaksi; `saveState` menolak revisi lebih lama/konflik revisi, `replaceState` mengganti secara atomik untuk impor/reset.
- Ekspor memuat envelope versi, watermark dan penanda data sintetis. Nomor identitas dan uang dipertahankan sebagai string.
- Schema Zod strict memvalidasi seluruh entitas, hubungan asal, ownership WP, tanggal/masa, bukti SIM-, dan struktur tanpa field kredensial.
- Impor tidak menulis data; JSON rusak, schema tidak didukung, relasi hilang, key tak dikenal, dan ukuran di atas 5 MiB harus ditolak tanpa merusak progres sebelumnya.
- Reset/import valid harus memakai `replaceState`; jangan memakai `clearState` diikuti penyimpanan untuk penggantian karena dua transaksi mempunyai jeda.

## Pemeriksaan antarmuka

Viewport: 1366 × 768, 1440 × 900, 390 × 844. Screenshot hanya bukti UI simulator; perbandingan terhadap UI resmi memerlukan referensi screenshot bertanggal pada viewport yang cocok. Tidak ada klaim pixel-perfect tanpa pengukuran.

Periksa label input, tab/focus keyboard, visibility password, pesan error teks, status teks, tabel scroll horizontal, tombol penting tetap terjangkau, penanda tetap simulasi, console error, dan request jaringan nonloopback. Setelah dependency/aset tersedia, jalur belajar harus tidak memerlukan layanan eksternal.

Bagian yang belum ditelusuri sumber primer atau belum diuji diberi **UNVERIFIED**; pilihan aplikasi diberi **DESIGN**; asumsi skenario diberi **ASSUMPTION**. **VERIFIED** hanya untuk sumber/pengujian yang benar-benar diperiksa dan selalu menyebut batas cakupannya.
