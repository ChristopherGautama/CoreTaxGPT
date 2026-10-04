# GitHub dan GitHub Pages

Simulator mendukung dua cara pemakaian: situs statis GitHub Pages dan server lokal. Instruksi lanjutan pemilik meminta push ke origin serta publikasi melalui tautan GitHub; panduan ini menggantikan panduan awal yang membatasi pekerjaan pada Git lokal. Bukti riset dan laporan QA awal tetap berlaku sesuai cakupan/tanggal pemeriksaannya.

## Tujuan dan status publikasi

- Repository origin: **https://github.com/ChristopherGautama/CoreTaxGPT**.
- Target situs: **https://christophergautama.github.io/CoreTaxGPT/**.
- Default branch untuk publikasi: `main`; branch implementasi awal: `codex/coretax-learning-simulator`.
- Visibilitas repository saat diperiksa: **PUBLIC**; pengaturan ini sudah ada dan tidak diubah oleh pekerjaan deployment.
- Workflow: [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml), dipicu oleh push ke `main` atau dijalankan manual melalui **Actions → Deploy Coretax Learning Simulator to GitHub Pages → Run workflow**.
- Status saat dokumen ini disiapkan: **UNVERIFIED — deployment dan akses situs belum dikonfirmasi**. Keberadaan konfigurasi build/workflow saja belum membuktikan situs aktif.

GitHub Pages menyajikan HTML, JavaScript, CSS, dan aset simulator. GitHub tidak menerima progres latihan: snapshot disimpan dalam IndexedDB browser. Ekspor cadangan adalah unduhan ke perangkat pengguna, bukan upload ke repository.

Alamat `http://127.0.0.1:5173` hanya tersedia pada komputer yang menjalankan server lokal. Tautan itu tidak dapat membuka server di workspace pengembangan dari perangkat lain. Gunakan target situs setelah status deployment berhasil, atau jalankan aplikasi pada komputer sendiri.

## Persiapan dan pemeriksaan lokal

Gunakan Node.js 24 dan npm 11+. Jangan menyimpan token pada remote URL atau berkas repository.

```sh
git status --short --branch
git remote -v
npm ci
npm run typecheck
npm run test:domain
npm run test:integration
npm run build:pages
npm run preview
```

Buka **http://127.0.0.1:4173/CoreTaxGPT/**. Periksa login, navigasi, refresh rute, penyimpanan progres, serta console/network. Build Pages menggunakan base path `/CoreTaxGPT/` dan hash routing. Untuk nama repository berbeda, tetapkan `PAGES_BASE_PATH` pada build, misalnya:

```sh
PAGES_BASE_PATH=/NamaRepository/ npm run build:pages
```

Base path harus mengikuti lokasi situs yang diterbitkan. Untuk build lokal biasa, gunakan `npm run build` dan buka `http://127.0.0.1:4173` setelah menjalankan preview.

## Commit dan push ke origin

Repository yang sudah ada dipertahankan; jangan membuat repository publik baru atau mengganti remote/visibilitas secara diam-diam. Sebelum push, tinjau berkas staged dan pastikan tidak ada data nyata atau credential:

```sh
git diff --stat
git diff --cached --stat
git diff --cached
git status --short
```

File yang belum dilacak baru muncul dalam diff setelah staged. `.gitignore` mengecualikan dependency, hasil build, laporan sementara Playwright, environment, sertifikat, cookie, credential, dan cadangan lokal. Fixture login demo sengaja dapat dibaca dan bukan credential produksi.

Sesudah perubahan ditinjau dan disimpan dalam commit, push branch yang dimaksud dengan autentikasi GitHub resmi pada lingkungan kerja. Contoh untuk menyimpan branch implementasi:

```sh
git push -u origin codex/coretax-learning-simulator
```

Workflow publikasi otomatis dipicu oleh push ke `main`. Untuk perubahan pada branch implementasi, gabungkan revisi yang telah diperiksa ke `main` terlebih dahulu, atau jalankan workflow secara manual pada branch yang dipilih. Push branch implementasi saja tidak memicu deployment otomatis. Push yang berhasil juga tidak otomatis berarti situs telah diterbitkan: workflow harus menghasilkan deployment berhasil. Jangan menaruh PAT, cookie, password, atau private key di chat, file aplikasi, maupun remote URL.

## Mengaktifkan dan memeriksa Pages

1. Periksa visibilitas repository dan dukungan GitHub Pages pada akun/organisasi. Pages pada repository private memerlukan paket yang mendukungnya; situs Pages juga dapat terbuka untuk umum meskipun repository private. Jangan mengubah private menjadi public hanya untuk mengatasi keterbatasan paket tanpa keputusan pemilik.
2. Di repository, buka **Settings → Pages** dan pilih sumber **GitHub Actions** sesuai workflow proyek. Pada pemeriksaan awal, `has_pages` bernilai `false`; konfigurasi workflow belum merupakan bukti bahwa Pages sudah aktif.
3. Push revisi yang telah lolos pemeriksaan ke `main` atau jalankan **Actions → Deploy Coretax Learning Simulator to GitHub Pages → Run workflow**. Berkas `.github/workflows/deploy-pages.yml` menggunakan Node.js 24, menjalankan `npm ci`, typecheck, tes, dan `build:pages`, lalu mengunggah `dist/` serta menjalankan konfigurasi/deployment Pages. Tidak diperlukan API key aplikasi. Status akhir tetap harus diperiksa; kegagalan izin atau konfigurasi Pages tidak disamarkan sebagai deployment berhasil.
4. Tunggu job deployment berhasil dan periksa URL yang ditampilkan pada environment `github-pages`/Settings Pages. Periksa juga URL target secara langsung; job hijau saja bukan pemeriksaan akses browser.
5. Buka situs, masuk dengan `pic` / `Belajar123!`, refresh rute di dalam aplikasi, dan pastikan status serta progres latihan tetap tersedia pada browser yang sama. Semua halaman harus menampilkan penanda simulasi.

Situs statis memerlukan koneksi untuk pemuatan berkas dari GitHub Pages. Tidak ada service worker yang menjamin pemuatan ulang offline. Untuk penggunaan offline yang dapat diandalkan, gunakan build lokal setelah dependency/aset tersedia.

## Progres dan batas penggunaan

- Data hanya untuk latihan sintetis. Jangan memasukkan identitas, dokumen pajak, password, OTP, sertifikat, atau passphrase asli.
- Auth demo dan role PIC/drafter/signer adalah aturan pembelajaran browser, bukan perlindungan akses situs.
- Penyimpanan dibedakan menurut browser dan origin. Progres localhost tidak otomatis muncul di Pages; gunakan **Ekspor progres** lalu **Impor progres**. Simpan cadangan sebelum menghapus data situs.
- Tidak ada akun cloud, sinkronisasi, analytics, telemetry, maupun request ke DJP, Dukcapil, bank, MPN, dan penyedia sertifikat.
- PDF/screenshot referensi tetap mempunyai atribusi dalam manifest. Menyimpan atau menerbitkan kode tidak mengubah status verifikasi maupun hak atas sumber tersebut. Artefak situs memakai aset aplikasi yang dipilih; bukti QA/referensi tidak otomatis menjadi aset runtime.
