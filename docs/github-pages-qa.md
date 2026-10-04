# QA build GitHub Pages

**VERIFIED — PASS lokal**, diuji ulang 4 Oktober 2026: build produksi Pages berhasil; **5/5 tes Playwright Pages lulus** (5,3 detik). **19/19 tes E2E lokal yang sudah ada juga lulus** sesudah perbaikan routing (46,0 detik). Typecheck lulus melalui proses build. Publikasi URL GitHub Pages masih **UNVERIFIED** pada laporan ini; keberhasilan build lokal tidak membuktikan publikasi sudah aktif.

Run pertama menemukan bug nyata: query e-Faktur dibaca melalui `window.location.search`, yang tidak membaca `#/efaktur?tab=input`; penggantian tab juga menimpa hash. Implementasi sudah memakai query dari React Router, dan tes ulang memverifikasi direct link, perpindahan tab, serta reload.

| Pemeriksaan yang dijalankan | Hasil |
| --- | --- |
| Server hanya melayani berkas statis pada `/CoreTaxGPT/`; route pathname `/CoreTaxGPT/spt` dan berkas tak dikenal menghasilkan 404 | PASS |
| Entry HTML, bundle JS/CSS, serta favicon tersedia di base path proyek | PASS |
| Login demo → Portal → posting SPT KB Rp30 juta → reload; status POSTED dan data IndexedDB dipertahankan | PASS |
| Browser back/forward, direct `#/efaktur?tab=input`, tab retur, dan reload route hash | PASS |
| Mode Mandiri dipertahankan setelah membuka `#/belajar` langsung dan reload | PASS |
| Error runtime/console, respons gagal, request lintas origin, atau request aset di luar base path | Tidak ditemukan dalam 5 tes Pages |
| Regresi 19 E2E lokal, termasuk PM, pembetulan, pembayaran, ekspor/impor, reset, desktop dan mobile | PASS |

Build menghasilkan bundle JavaScript sekitar 560 kB sebelum gzip (sekitar 168,5 kB gzip). Vite memberi peringatan ukuran chunk lebih dari 500 kB; build tetap berhasil. Tidak ada klaim audit performa jaringan publik atau kesetiaan pixel pada laporan ini.

Pengujian tambahan terpisah berada di `tests/pages/`. Suite ini menggunakan hasil build produksi dengan base path `/CoreTaxGPT/`, server statis yang hanya mendengarkan `127.0.0.1:4174`, dan **tanpa fallback HTML untuk pathname yang tidak ada**. Dengan demikian reload route hash tidak bergantung pada fallback development server Vite.

Jalankan dari root repository:

```bash
npm run build:pages
npx playwright test --config tests/pages/playwright.config.ts
```

Untuk memeriksa publikasi yang sudah aktif, jalankan suite browser terhadap URL repository; pengujian implementasi server lokal akan dilewati secara eksplisit:

```bash
PAGES_TEST_URL=https://PEMILIK.github.io/CoreTaxGPT/ npx playwright test --config tests/pages/playwright.config.ts
```

Yang diperiksa: login → portal → posting SPT → reload; navigasi back/forward; direct hash route dengan query; aset JavaScript/CSS dan favicon di dalam base path; error console dan request jaringan; serta penyimpanan mode belajar dan hasil posting di IndexedDB. Suite memakai profil browser baru per tes dan hanya data sintetis.

Laporan HTML: `qa/playwright-report/pages/`. Screenshot hasil posting: `qa/screenshots/pages-spt-1366x768.png`. Hasil pengujian lokal tidak sendiri membuktikan bahwa publikasi GitHub Pages sudah aktif; URL publik harus diperiksa secara terpisah.
