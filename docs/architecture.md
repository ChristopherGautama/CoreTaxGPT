# Arsitektur dan kontrak implementasi

Status: **DESIGN**, bukan klaim teknologi internal DJP.

React + TypeScript strict + Vite merender aplikasi browser; tidak ada backend. Aplikasi dapat disajikan oleh server loopback lokal atau GitHub Pages sebagai berkas statis. `execute(previous, command)` menyalin snapshot, memeriksa actor/WP/role/invariants, lalu mengembalikan state baru. Kegagalan melempar pesan Indonesia tanpa memutasi state asal. UI tidak dianggap sebagai batas izin: handler domain memeriksa ulang objek dan role, termasuk ketika rute dibuka langsung.

Mesin `rules/tax.ts` memakai Decimal presisi80 dan fungsi murni. Harga neto, DPP, nilai sebelum pembulatan, PPN, PPnBM, sumber formula dan versi disimpan terpisah. Nomor/identitas adalah string. Fixture dan commandID diturunkan dari state, bukan angka acak atau jam aktual. Timestamp audit memakai clock simulasi; timer toast hanya presentasi.

## State dan sejarah

- Faktur: DRAFT → VALIDATED → SIGNED → APPROVED. Faktur APPROVED tidak diedit; pengganti membuat relasi `originalId`. Retur/pembatalan berupa objek berbeda dan approval tidak sama dengan keputusan kredit PM.
- PM: CREDIT, NONCREDIT, NEUTRAL, INVALID; koreksi menambah keputusan dengan `previousId`. Snapshot SPT memakai lineage keputusan yang relevan pada versinya.
- SPT: DRAFT → POSTED → AWAITING_PAYMENT atau READY → FILED. Status ini DESIGN. Posting menyimpan fingerprint dan lineage; pengulangan tidak menggandakan dokumen. Perubahan sumber sebelum pelunasan mewajibkan posting ulang. SPT dibayar yang belum dilaporkan membatasi perubahan sumber sampai pelaporan lalu pembetulan.
- Billing: ACTIVE, CANCELLED, PAID; expiry dihitung tepat336jam, terpisah dari status yang disimpan. Pembayaran dan deposit memakai bucket PPN/PPNBM terpisah, receipt sendiri, alokasi lot dan ledger. Tidak ada pembayaran ganda atau pelunasan campuran sebagian deposit/billing.
- SPT FILED dan BPE tetap utuh. Pembetulan menunjuk versi sebelumnya dan memilih aturan berdasarkan masa dan tanggal penyampaian. Kompensasi memakai sumber, penggunaan, serta adjustment; rantai contoh resmi tidak membuat KB semu.

## Penyimpanan

IndexedDB menyimpan satu snapshot schema1 dalam transaksi atomik. Zod memvalidasi setiap entitas dan relasi, kepemilikan WP, ID sintetis, nomor SIM, dan watermark. Versi schema asing ditolak eksplisit; belum ada migrasi dari versi aplikasi lama karena ini versi pertama. Impor tidak melakukan merge tak terkontrol. `replaceState` mengganti progres/reset secara atomik; `saveState` mencegah penimpaan snapshot lebih baru oleh revision usang.

State browser tetap dapat dimodifikasi pengguna melalui devtools; ini simulator pribadi, bukan sistem otorisasi produksi. Tidak ada klaim audit log tahan manipulasi kriptografis. Auth demo memvalidasi credential publik fixture dan OTP lokal; tidak ada rahasia nyata disimpan.

## Batas integrasi dan bukti

Source register menyimpan peraturan/versi/tanggal/halaman dan cakupan pemeriksaan. Visual manifest mengatribusikan screenshot asli dari PDF, memisahkan ukuran raster terukur dan perkiraan CSS. `references/` merupakan rekonstruksi implementasi; PDF asli pengguna tetap utuh di direktori unggahan.

Aset runtime dibundel bersama aplikasi; tidak ada font CDN, analytics, telemetry, CAPTCHA eksternal, atau API pajak. Server dev/preview mengikat `127.0.0.1`. Saat dihosting, browser memuat berkas statis dari origin GitHub Pages yang sama dengan situs. Perhitungan dan progres tidak dikirim ke GitHub atau DJP. CSP membatasi pemuatan/koneksi pada kebijakan aplikasi; pengujian Pages perlu membedakan origin hosting yang diizinkan dari integrasi eksternal. Laporan QA awal mencatat pengujian lokal; hasil itu bukan bukti bahwa deployment Pages sudah diperiksa. File ekspor dibuat melalui Blob lokal dan nomor SIM; tidak ada QR verifikasi atau API pajak.

## Hosting statis GitHub Pages

`npm run build:pages` membangun aset dengan base path `/CoreTaxGPT/` (dapat disesuaikan melalui `PAGES_BASE_PATH`). Build Pages menggunakan routing hash, sehingga bagian rute sesudah `#` diproses browser; GitHub hanya melayani direktori situs. Navigasi langsung dan refresh tidak membutuhkan rewrite ke `index.html` di server. Build lokal tetap didukung.

Workflow `.github/workflows/deploy-pages.yml` dipicu oleh push ke `main` atau manual. Workflow memakai Node.js 24 dan lockfile (`npm ci`), menjalankan typecheck/tes, membangun aplikasi dengan `build:pages`, lalu menerbitkan keluaran `dist/` ke GitHub Pages. Hanya kode serta fixture sintetis yang menjadi artefak situs, bukan snapshot IndexedDB pengguna. Tidak ada database hosting, fungsi server, pembayaran, atau integrasi perpajakan produksi. Deployment dilakukan berdasarkan instruksi lanjutan pemilik; larangan publikasi pada ruang lingkup awal tidak lagi menjadi batas untuk deployment Pages yang diminta.

Origin lokal dan origin Pages mempunyai penyimpanan terpisah. Perubahan base path di origin yang sama tidak otomatis memisahkan IndexedDB. Gunakan ekspor/impor untuk memindahkan progres dan hindari menjalankan beberapa salinan simulator di satu origin bersamaan. Situs tidak mendaftarkan service worker; pemuatan ulang halaman Pages memerlukan koneksi yang tersedia, sedangkan build lokal dapat dijalankan tanpa internet setelah dependency terpasang.

Visibilitas repository dan visibilitas situs Pages bukan pengaturan yang sama. Dukungan Pages untuk repository private bergantung pada paket GitHub, dan private repository tidak otomatis menjadikan situs privat. Autentikasi PIC/drafter/signer tetap latihan, bukan mekanisme keamanan situs. Lihat [panduan GitHub dan Pages](github-private.md) untuk status publikasi dan konfigurasi.

Unduhan TXT dipilih agar seluruh isi transparan dan dapat dibaca offline. Pernyataan simulasi ada di awal/akhir setiap dokumen dan JSON progres mempunyai watermark eksplisit. Bentuk BPE dan receipt adalah DESIGN, bukan reproduksi blanko sah.
