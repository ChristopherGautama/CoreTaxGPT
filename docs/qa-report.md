# Laporan QA aktual — Coretax Learning Simulator

Tanggal eksekusi: **4 Oktober 2026**, zona waktu laporan Asia/Jakarta. Clock aplikasi adalah fixture terpisah (baseline 15 November 2026). Ini hasil pengujian simulator lokal; bukan sertifikasi atau pengujian sistem DJP.

## Hasil yang telah dijalankan

| Pemeriksaan | Hasil aktual | Cakupan / batas |
|---|---|---|
| `npm run test:e2e` | **VERIFIED — 19/19 PASS**, 47,6 detik pada run akhir | Chromium lokal, satu worker; seluruh interaksi melalui UI, hasil persisten juga diperiksa di IndexedDB |
| `npm run typecheck` | **VERIFIED — PASS** | TypeScript strict, termasuk schema penyimpanan dan field sebelum pembulatan PPN/PPnBM |
| `npm run build` | **VERIFIED — PASS** | Pemeriksaan akhir setelah perubahan domain dan clock; JavaScript 558,99 kB / gzip 168,17 kB |
| `npm run test` | **VERIFIED — 139/139 PASS, 5 berkas** | Angka pajak, workflow, helper tampilan/waktu, serta integrasi penyimpanan |
| Integrasi penyimpanan dalam suite di atas | **VERIFIED — 26/26 PASS** | Seluruh 6 fixture, roundtrip, transaksi, konflik revisi, impor invalid, reset, KB/BPE, PPnBM/deposit, kompensasi signed, 20 faktur, dan validasi timezone |
| Console browser / exception runtime | **VERIFIED — 0 error pada 19 alur** | Setiap test mengumpulkan `pageerror` dan `console.error`, lalu mewajibkan daftar kosong |
| Request aplikasi di luar loopback | **VERIFIED — 0 pada 19 alur** | Setiap request HTTP(S) aplikasi diperiksa; semua host hanya `127.0.0.1`/`localhost`. Ini bukan pemindaian trafik seluruh OS |
| Keyboard login dan kontrol tema/bahasa | **VERIFIED** | Focus ID Pengguna → Tab → Kata Sandi; klik tema dan bahasa dapat dijangkau pada 4 viewport |
| Lebar halaman | **VERIFIED** | Tidak ada overflow horizontal pada halaman login dan daftar faktur di 4 viewport; kolom tabel memakai scroll di dalam tabel |

Lingkungan aktual: Node.js **24.19.0**, npm **11.9.0**, Chromium **151.0.7922.173** pada Linux. Angka di atas adalah hasil yang benar-benar dieksekusi; snapshot riset dan clock latihan tidak dipakai sebagai jam test runner.

Build memberi peringatan ukuran chunk di atas 500 kB; build berhasil. Aplikasi latihan ini belum menerapkan pemecahan bundle per modul. Pemeriksaan akhir juga memastikan hash PDF sumber tidak berubah, 18 hash aset sesuai manifest, dan `git diff --check` tidak menemukan masalah whitespace pada perubahan terlacak.

## Alur UI yang lulus

1. Verifikasi login, visibility sandi, aktivasi persona, dan challenge 2FA demo.
2. Drafter menyimpan/memvalidasi draf; signing tetap tidak tersedia sesudah membuka URL langsung.
3. Pergantian WP mengisolasi faktur, SPT, dan audit/ledger; data WP badan muncul kembali setelah kembali ke WP badan.
4. PM Januari: jalur biasa Mei ditolak dengan penjelasan pembetulan; April diterima; pengkreditan ganda ditolak.
5. Bruto Rp111 juta → neto Rp100 juta, PPN Rp11 juta; validasi → signing → approval; unduhan faktur berawalan SIM- dan ber-watermark.
6. KB dasar Rp30 juta: posting → billing → pembayaran → tanda tangan/lapor → reload → unduhan BPE; hasil perhitungan tetap KB.
7. LB Rp16,5 juta dan nihil masing-masing tetap memerlukan penyampaian sebelum BPE tersedia.
8. Retur Oktober Rp20 juta: draf netral; approval dan posting menghasilkan KB Rp27,8 juta.
9. PM noneligible Rp5 juta tetap tercatat B3 dan menghasilkan KB Rp35 juta.
10. SPT dilaporkan tetap immutable; tambahan PK Rp2,2 juta menghasilkan III.E Rp32,2 juta, III.F Rp30 juta, III.G Rp2,2 juta pada pembetulan.
11. Billing aktif pada 335 jam 59 menit, tidak dapat dibayar tepat 336 jam, dapat dibatalkan dan diterbitkan ulang.
12. PPnBM pedagogis: PK Rp120 juta, PM hanya mengurangi PPN menjadi Rp98 juta, PPnBM Rp200 juta; deposit Rp298 juta teralokasi menjadi dua bucket, lalu SPT dilaporkan.
13. Rantai kompensasi: sumber Oktober tetap −Rp200 ribu; koreksi menghasilkan kompensasi Desember Rp200 ribu tanpa KB semu.
14. Ekspor → reset kasus → impor memulihkan progres; mode Ujian menyembunyikan hint, jawaban benar mendapat 100, reload mempertahankan hasil; impor versi salah tidak merusak progres.
15. Empat test visual/keyboard pada viewport 1366 × 768, 1440 × 900, 390 × 844, dan 1265 × 712.

Uji numerik tanpa UI melengkapi kasus signed/refund, transisi versi peraturan, pembulatan rupiah, retur November/rejected, dan pembayaran ganda. Lihat `tests/domain/` dan hasil akhir test runner; klaim hukum primer tetap mengikuti evidence gaps.

## Artefak dan inspeksi visual

- `qa/screenshots/login-{lebar}x{tinggi}.png`: login pada 4 viewport, full page.
- `qa/screenshots/portal-{lebar}x{tinggi}.png`: portal pada 4 viewport, full page.
- `qa/screenshots/faktur-{lebar}x{tinggi}.png`: faktur pada 4 viewport, full page.
- `qa/screenshots/login-reference-1265x712.png`: tangkapan viewport persis 1265 × 712, tanpa full-page, untuk perbandingan raster referensi login.
- `qa/screenshots/spt-filed-1366x768.png`: SPT KB dilaporkan, angka dan BPE terlihat.
- `qa/playwright-report/index.html`: laporan browser dengan lampiran `console-network-audit` per test; direktori ini diabaikan Git agar artefak sementara tidak masuk sumber.

QA memeriksa gambar portal desktop dan login/faktur mobile secara visual: label serta tombol utama terbaca, banner simulasi tetap ada, kontrol mobile ditumpuk dan tabel memakai scroll lokal. Test tidak menyembunyikan kolom pajak atau tombol untuk menghilangkan overflow. Kemiripan visual internal adalah **DESIGN**, dengan warna/layout berdasarkan bukti yang tersedia dan penyesuaian mobile. Font sistem dan sebagian ukuran adalah **ASSUMPTION**. Tidak ada klaim pixel-perfect, kesamaan semua layar produksi, atau replika M-Pajak.

## Perbaikan yang ditemukan melalui QA

- Permintaan favicon awal menghasilkan console 404; diperbaiki dengan aset SVG lokal dan link ikon. Rerun penuh lulus tanpa pengecualian console.
- Snapshot sumber 20 faktur melebihi batas field teks 10 KB; batas khusus fingerprint diperbesar dengan limit eksplisit. Tes nyata melalui create/validate/sign/approve/post, simpan, reload, ekspor dan impor lulus.
- Input clock Pembayaran kini menampilkan WIB secara eksplisit. Test menyimpan waktu yang sama, menunggu revisi tersimpan, lalu memastikan instant tidak bergeser tujuh jam. Impor tanpa timezone atau bertanggal kalender invalid ditolak.
- Satu timeout gross invoice terjadi saat perubahan sumber memicu HMR dan me-reset editor; satu test memakai label lama saat UI sedang diubah. Keduanya lulus pada rerun penuh setelah sumber stabil; tidak diabaikan atau diberi retry otomatis.

## Batas hasil

**UNVERIFIED:** pengujian lintas Firefox/Safari, kesamaan pixel terhadap seluruh layar internal, validasi hukum primer yang endpoint-nya tidak dapat diakses, kalender resmi hari libur, dan kesiapan infrastruktur Coretax produksi. Browser test memakai Chromium desktop dengan viewport mobile, bukan perangkat fisik.

**DESIGN:** ekspor dan dokumen adalah JSON/TXT edukatif lokal ber-watermark; bukan XML/PDF resmi yang kompatibel dengan Coretax. P1/P2 yang belum memiliki kasus terverifikasi tetap overview atau diblokir eksplisit. Lihat `references/evidence-gaps.md`, `references/screen-map.md`, dan `references/rule-mapping.md`.
