# Catatan UI — rekonstruksi dari artefak

Status keseluruhan: **VERIFIED terhadap gambar tertanam R00**, **UNVERIFIED terhadap sesi produksi**. Ini catatan baru saat implementasi, bukan catatan asli paket yang tidak tersedia.

## Login publik

V03 / `assets/evidence-002.jpg`, 1265×712, R00 hlm. 4. Penulis R00 mengatribusikan kepada S02, pengamatan publik 4 Oktober 2026. Latar putih/abu berlapis gelombang; merek kiri; panel formulir kanan. Perkiraan panel x735 y67 lebar436 tinggi621; pusat visual brand sekitar x60 y310. Penanda simulasi dan daftar kredensial merupakan DESIGN.

Urutan terlihat: judul Selamat Datang! → ID Pengguna → Kata Sandi dengan ikon visibility → Verifikasi dan Saya bukan robot → Lupa Kata Sandi? → Masuk → pemisah ATAU → Pengguna Baru?/Daftar di sini dan Belum Aktivasi?/Aktivasi Akun Wajib Pajak. Tema dan bahasa ID berada kanan atas. Screenshot tidak membuktikan perilaku submit, validasi ID, pesan gagal atau integrasi CAPTCHA. Simulator memakai checkbox lokal dan akun demo.

Warna dominan tombol Masuk dari crop (800,490)–(1100,520) adalah RGB 36,44,93 / `#242c5d`; ini pixel JPEG, bukan CSS asli. Font, shadow, radius dan background CSS rekonstruksi diberi ASSUMPTION.

## Internal faktur dan SPT

V05 / `assets/evidence-005.png`, 1419×477, S04 hlm.29, menunjukkan toolbar identitas putih, navigasi horizontal navy, sidebar identitas/kategori, judul Pajak Keluaran dan tabel kuning dengan filter setiap kolom. Sidebar sekitar239px; area kerja x264. Nav terukur `#000e7e`, header grid terukur `#feda2e`; seluruh ukuran CSS adalah approximation. V01 / `assets/evidence-000.png` menyediakan peta menu global, termasuk Buku Besar dan Pertukaran Informasi Perpajakan, pada contoh WP migas; bukan klaim semua menu tersedia setiap role.

V06 / `assets/evidence-006.png`, S05 hlm.14, mengelompokkan dokumen transaksi: Down Payment, Rest of Payment, e-Tax Invoice Number, Transaction Code, e-Tax Invoice Date, Invoice Type, Period, Year, Reference, Address, Business Code. V07 hlm.16 memuat modal dua kolom, Type Goods/Services, Code, Name, Unit, Unit Price, Discount, Tax Base, Other Tax Base, VAT Rate, VAT, Cancel dan Save. Label Inggris adalah bukti generasi 2024. Terjemahan Indonesia yang tidak terlihat literal adalah DESIGN, sementara angka 11% pada screenshot historis tidak digunakan sebagai tarif 2026.

V08 / `assets/evidence-008.png` menampilkan pilihan Credit Invoices, Uncredit Invoices dan Back To Approved, grid dengan filter, seleksi, pagination dan horizontal scroll. Keputusan “invalid bukan transaksi pembeli” berasal dari uraian FAQ dalam R00, bukan tampilan literal pada crop ini.

V09/V10, `evidence-009.png`/`evidence-010.png`, menunjukkan Konsep SPT, SPT Menunggu Pembayaran, SPT Dilaporkan, SPT Ditolak dan SPT Dibatalkan; tombol Buat Konsep SPT; wizard Pilih Jenis Pajak → Pilih periode pelaporan SPT → Pilih Jenis SPT. Pilihan jenis pada screenshot spesifik tidak boleh dipaksakan sebagai satu-satunya varian PKP biasa.

V11, `evidence-011.png`, S05 hlm.58: tab Main Form/A1/A2/B1/B2/B3/C; identitas, masa/model, tabel terfilter, total, pagination/scroll, Save Draft dan Pay And Submit. Kolom legal 2025/2026 menentukan mapping, bukan terjemahan Inggris historis yang kadang ambigu.

## Induk dan Buku Besar 2026

V12/V13/V17/V18 adalah salindia resmi menurut atribusi R00, bukan sesi aplikasi. Gambar formula adalah bukti bentuk formulir dan contoh; bukan bukti interaktivitas atau enabled state. VI.D dan III.F masih berlabel “SPT yang dibetulkan sebelumnya” dengan penanda perubahan calculation rule. Formula setoran/refund di penjelasan aturan menentukan hitungan simulator.

V15 / `assets/evidence-015.png`, S14 hlm.65, menunjukkan generasi shell putih: logo kiri, pencarian tengah, tema/notifikasi/account kanan, navigasi horizontal putih berikon dan tab Buku Besar kuning. V16 / `assets/evidence-016.png`, hlm.69, menunjukkan kelompok Total dan Filtered untuk Debit, Kredit, Debit Tersisa, Kredit Tersisa, Saldo; Cetak Buku Besar; filter dan tabel kuning. Shell ini berbeda dari navy 2025; pencampuran elemen perlu diberi versi per layar.

## QA visual yang sah

Ambil screenshot aplikasi 1366×768, 1440×900 dan 390×844. Untuk perbandingan gambar publik asli, tambahkan screenshot 1265×712. Ukur overflow/tombol dan bandingkan kelompok kontrol, identitas WP, nav, sidebar, toolbar, header, urutan field dan status. Gambar internal sebagian hanya crop, sehingga ukuran sama tidak berarti viewport sama. Jangan menghitung skor pixel-perfect dari dua layout dengan banner belajar/data/versi berbeda. Responsive mobile adalah DESIGN untuk akses belajar, bukan replika M-Pajak.
