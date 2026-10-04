# Coretax Learning Simulator

**SIMULASI BELAJAR • BUKAN LAYANAN DJP**

Aplikasi pembelajaran berbahasa Indonesia untuk mempelajari PPN dan PPnBM, tersedia sebagai situs statis GitHub Pages atau dijalankan lokal. Faktur, SPT, pembayaran, sertifikat, identitas, dan BPE semuanya sintetis. Aplikasi tidak dapat menyampaikan SPT atau membayar pajak nyata. Progres latihan tetap disimpan di browser masing-masing melalui IndexedDB; GitHub tidak menjadi server data perpajakan.

## Buka melalui GitHub Pages

Target situs: **https://christophergautama.github.io/CoreTaxGPT/**. Source telah di-push ke `origin/main` pada commit [`ccd0c19`](https://github.com/ChristopherGautama/CoreTaxGPT/commit/ccd0c19d7dd922fccf60164b6e79109df3508c36). [Workflow deployment](https://github.com/ChristopherGautama/CoreTaxGPT/actions/runs/37182726285) berhasil membangun aplikasi dan menjalankan 139 tes, tetapi aktivasi awal Pages gagal karena koneksi tidak mempunyai izin administrasi Pages (`Resource not accessible by integration`). Pemilik perlu memilih **Settings → Pages → Source: GitHub Actions** sekali, lalu menjalankan ulang job deploy yang gagal. Situs belum dinyatakan aktif; pemeriksaan URL dari lingkungan kerja juga diblokir proxy (`CONNECT tunnel 403`). Rincian dan tautan job ada di [panduan GitHub](docs/github-private.md).

Alamat `127.0.0.1` menunjuk komputer tempat browser dibuka. Server yang berjalan dalam workspace pengembangan tidak otomatis tersedia di komputer pengguna. Gunakan tautan GitHub Pages setelah tersedia, atau jalankan server lokal sendiri dengan langkah di bawah.

Build Pages menggunakan base path `/CoreTaxGPT/` dan routing hash, misalnya `/CoreTaxGPT/#/login`, agar navigasi dan refresh tidak memerlukan server aplikasi. Saat menggunakan situs, browser mengambil berkas HTML, JavaScript, CSS, serta aset dari GitHub Pages. Perhitungan, login demo, dan progres latihan berjalan di browser tanpa API DJP, bank, atau layanan pajak produksi. Hosting ini tidak menambahkan akun cloud maupun sinkronisasi progres.

Untuk memeriksa hasil build Pages di komputer sendiri:

```sh
npm ci
npm run build:pages
npm run preview
```

Buka **http://127.0.0.1:4173/CoreTaxGPT/**. Jika nama repository berubah, sesuaikan `PAGES_BASE_PATH` saat build. Petunjuk push, konfigurasi GitHub Pages, dan batas visibilitas repository ada di [panduan GitHub](docs/github-private.md).

## Jalankan lokal

Gunakan Node.js **24** dan npm **11+**. Versi dependency diperiksa saat implementasi; versi terpasang dikunci dalam `package-lock.json`.

```sh
npm ci
npm run dev
```

Buka **http://127.0.0.1:5173** pada komputer yang menjalankan perintah tersebut. Server dev/preview hanya mengikat loopback. Instalasi dependency memerlukan jaringan; sesudah itu aplikasi lokal, seluruh aset, kalkulasi, dan penyimpanan berjalan tanpa layanan eksternal. Untuk build produksi lokal:

```sh
npm run build
npm run preview
```

Buka **http://127.0.0.1:4173**. Jangan membuka `dist/index.html` sebagai `file://`; jalankan server loopback agar routing dan IndexedDB berfungsi konsisten. Progres per browser dan origin: localhost, port 5173, port 4173, dan GitHub Pages mempunyai penyimpanan terpisah; pindahkan progres dengan ekspor/impor. Tutup tab simulator lain sebelum impor/reset agar tidak ada perubahan bersamaan. Menghapus cache/data situs dapat menghapus progres. Situs Pages bukan aplikasi offline ber-service-worker; untuk penggunaan tanpa internet yang dapat diandalkan, jalankan build lokal.

## Akun latihan

| ID Pengguna | Persona | Kewenangan awal |
| --- | --- | --- |
| `pic` | Ayu PIC Latihan | Mengelola penugasan, menyusun dan menandatangani |
| `drafter` | Bima Drafter Latihan | Menyiapkan dokumen; tidak menandatangani |
| `signer` | Citra Signer Latihan | Meninjau dan menandatangani |

Kata sandi semua persona: **`Belajar123!`**. Verifikasi login adalah checkbox lokal. OTP aktivasi/pemulihan/2FA demo: **`123456`**. Aktifkan KODJP demo melalui **Profil & otorisasi** dengan passphrase **`Simulasi123!`** sebelum signing. Nilai ini sengaja dipublikasikan sebagai fixture; bukan rahasia. Jangan memasukkan identitas, kata sandi, passphrase, atau berkas perpajakan asli.

## Latihan pertama sampai BPE

1. Masuk sebagai `pic`. WP aktif: **PT Simulasi Niaga Nusantara**. Clock baseline **15 November 2026, 09.00 WIB**, masa **Oktober 2026**; semuanya fixture.
2. Aktifkan KODJP demo di **Profil & otorisasi**.
3. Buka **e-Faktur**. Fixture awal sudah mempunyai penjualan approved Rp500 juta dan pembelian eligible Rp200 juta. Detail menampilkan harga neto, DPP nilai lain, PPN, dan sumber formula. Faktur baru melalui simpan draf → validasi lokal → signing → approval simulasi.
4. Pada **Pajak Masukan**, tinjau keputusan Kredit. Kompensasi Rp3 juta berasal dari SPT September yang telah dilaporkan.
5. Buka **SPT**, pilih konsep Oktober, lalu **Posting SPT**. PK Rp55 juta, PM Rp22 juta, kompensasi Rp3 juta menghasilkan **KB Rp30 juta**. Telusuri A2/B2/B3 dan Induk.
6. Pilih **Bayar dan Lapor**. Pada **Pembayaran**, buat billing PPN dan bayar simulasi; atau tambah deposit sintetis yang cukup dan alokasikan seluruh kewajiban. Billing belum berarti lunas. Tidak ada kombinasi pembayaran sebagian deposit/sebagian billing.
7. Kembali ke SPT dan sampaikan melalui **Tanda tangan & lapor**. Unduh **BPE simulasi** setelah status dilaporkan. Hasil penghitungan tetap KB setelah lunas.
8. Untuk koreksi, pilih versi dilaporkan dan buat pembetulan. Riwayat dan bukti sebelumnya tetap tersimpan. Koreksi sumber pada masa yang sudah dibayar tetapi belum dilaporkan harus menunggu pelaporan versi yang dibayar dahulu.

## Kasus, progres, reset

**Latihan & progres** menyediakan kasus KB, LB, nihil, PPnBM pedagogis, PM noneligible, dan rantai kompensasi. Mode Terpandu, Mandiri, dan Ujian memakai mesin pajak yang sama. Penilaian menguji tiga jawaban angka/status; penyelesaian workflow dilihat dari tahap dan audit, bukan dianggap selesai hanya karena nilai 100.

- **Ekspor progres** mengunduh JSON dengan watermark simulasi, versi schema, dokumen dan audit. Simpan sebagai cadangan pribadi.
- **Impor progres** memvalidasi schema, identitas sintetis, referensi objek dan scope WP sebelum mengganti snapshot atomik. Berkas salah tidak menghapus progres lama.
- **Mulai ulang kasus → Reset atomic & mulai ulang** mengganti seluruh snapshot dengan fixture dan kembali ke login. Tidak mengubah source code atau berkas referensi.
- Progres otomatis tersimpan di **IndexedDB**. Browser private, penghapusan data situs, atau perubahan origin dapat menghilangkan akses ke progres tersebut. Tidak ada akun cloud atau sinkronisasi.
- **Replay riwayat** menampilkan audit. Untuk mengulangi tindakan secara interaktif, reset kasus atau impor snapshot; aplikasi tidak mengklaim replay state pada sembarang event.

## Aturan dan batas bukti

Cutoff riset **4 Oktober 2026**. `legalRuleVersion`, `uiEvidenceVersion`, tanggal observasi, masa dokumen, masa kredit, masa SPT, dan waktu penyampaian dipisahkan.

**VERIFIED:** PDF unggahan dan screenshot tertanam benar-benar diperiksa; hasil tes aplikasi yang benar-benar dijalankan dilaporkan terpisah. **DESIGN:** fitur belajar, state lokal, role sintetis, dokumen unduhan. **ASSUMPTION:** font sistem/spacing dan klasifikasi PPnBM pedagogis20%. **UNVERIFIED:** sumber primer eksternal lengkap, seluruh layar internal produksi, kalender libur resmi, dan kesiapan produksi fitur kompensasi.

URL resmi dicoba ulang; proxy lingkungan menolak delapan URL dengan403. Karena itu, aturan diimplementasikan sesuai permintaan eksplisit pengguna dan PDF riset, **bukan diklaim sebagai audit hukum primer independen**. Paket riset terpisah dan `update2026.pdf` utuh tidak tersedia. Register dan catatan rekonstruksi tidak disamarkan sebagai berkas paket asli.

Login mengikuti komposisi screenshot publik S02 bertanggal4 Oktober2026 dalam PDF. Shell internal memakai referensi manual navy2024/2025; screenshot Buku Besar2026 menunjukkan generasi putih yang berbeda. Warna raster diukur, font/layout diadaptasi; tidak ada klaim pixel-perfect atau replika seluruh Coretax/M-Pajak.

Formula utama: **12% × (11/12 × harga neto)** untuk nonmewah umum kode04; bruto dibagi1,11. Pembulatan SPT rupiah penuh half-up. Kasus PPnBM terbatas pada produsen BKP yang diasumsikan sah tergolong mewah, neto Rp1 miliar, tarif latihan20%. PM tidak mengurangi PPnBM.

Pembetulan sejak1 Oktober2026: III.E = A−B−C−D; III.F = setoran−refund SKPPKP; III.G = E−F. PPnBM mempunyai bucket terpisah dan refund SKPLB. Pembetulan aturan lama dikenali tetapi kalkulasinya diblokir. Billing aktif336 jam; jatuh tempo pajak tidak diperpanjang. Tenggat tanggal20 dan akhir bulan berikutnya bersifat nominal, belum disesuaikan kalender libur resmi.

**Belum disimulasikan:** XML kompatibel Coretax, PIB/PEB, dokumen setara, uang muka/pelunasan, rezim khusus/fasilitas, pemungut/Pihak Lain, PBK, SPT Tahunan PPh, eBupot, PBB, dan modul khusus. Mapping ditampilkan dengan alasan, tanpa tombol sukses palsu. Pengganti setelah retur dan rantai kompensasi yang memerlukan analisis kewajiban tambahan diblokir eksplisit. Dokumen unduhan adalah TXT edukatif ber-watermark, bukan PDF/formulir resmi.

## Struktur proyek dan verifikasi

```text
src/domain/      entitas, invariants, command workflow dan audit
src/rules/       fungsi pajak murni, versi, mapping dan tenggat
src/fixtures/    kasus dan clock deterministik
src/storage/     IndexedDB, schema strict, impor/ekspor atomik
src/features/    layar dan workflow per modul
src/components/  komponen dan unduhan lokal
references/     register, screenshot asli terpilih, atribusi, gaps
tests/          domain, integrasi penyimpanan, Playwright
qa/             laporan dan screenshot hasil pemeriksaan
```

```sh
npm run typecheck
npm run build
npm run test:domain
npm run test:integration
npm run test:e2e
```

Playwright menggunakan Chromium lokal `/usr/bin/chromium` pada lingkungan implementasi. Di komputer lain, arahkan `PLAYWRIGHT_CHROMIUM_EXECUTABLE` ke executable Chromium/Chrome lokal. Contoh macOS:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e
```

Tidak ada analytics, telemetry, font CDN, CAPTCHA eksternal, atau request aplikasi ke DJP/Dukcapil/bank/MPN/penyedia sertifikat. CSP dan audit network browser memeriksa batas ini. Auth demo bukan kontrol akses atau perlindungan data untuk situs yang dihosting. Siapa pun yang dapat membuka situs dapat menggunakan credential fixture di atas. Masukkan hanya data latihan sintetis; jangan memasukkan data pajak, identitas, atau rahasia asli. Repository private dan akses situs Pages adalah pengaturan terpisah; jangan mengubah visibilitas repository tanpa keputusan pemilik.

Baca [register sumber](references/source-register.json), [peta layar](references/screen-map.md), [mapping aturan](references/rule-mapping.md), [expected results](references/expected-results.json), [evidence gaps](references/evidence-gaps.md), [arsitektur](docs/architecture.md), [panduan GitHub dan Pages](docs/github-private.md), dan [laporan QA aktual](docs/qa-report.md) dan [perbandingan visual](docs/visual-comparison.md).
