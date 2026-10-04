# Inventaris riset implementasi — cutoff 4 Oktober 2026

**SIMULASI BELAJAR • BUKAN LAYANAN DJP**

Dokumen ini disusun selama implementasi dari PDF unggahan pengguna. Ini bukan `report.md` asli paket riset dan bukan audit produksi Coretax. Teks PDF 30 halaman dibaca, 18 gambar tertanam diekstrak tanpa perubahan, semua gambar diperiksa, dan tautan sumber diambil dari anotasi PDF. Artefak sumber asli di direktori attachments tidak diubah. Hash tersedia pada `source-register.json`.

## Status bukti

- **VERIFIED** berarti bukti benar-benar diperiksa, dengan cakupan verifikasi dinyatakan. R00 dan gambar V01–V18 diverifikasi sebagai isi artefak unggahan; status ini tidak mengesahkan klaim riset sebagai observasi langsung tim implementasi.
- **DESIGN** adalah keputusan simulator: data sintetis, state internal, pembatasan akses, UI belajar, watermark, penyimpanan, migrasi, clock latihan dan mode ujian.
- **ASSUMPTION** adalah asumsi yang eksplisit, termasuk persona, kelayakan PM dalam fixture, tarif PPnBM pedagogis 20%, font, sebagian spacing dan responsive mobile.
- **UNVERIFIED** berarti belum berhasil diperiksa secara langsung atau bukti tidak lengkap. Seluruh sumber primer eksternal tetap berstatus ini dalam sesi implementasi.

Penanda asal dalam laporan dipertahankan secara terpisah: LIVE-PUB (observasi publik menurut penulis riset), DOC (manual/FAQ), RULE/RULE-DOC (hukum/materi), DESIGN dan GAP. LIVE-PUB pada R00 tidak berarti tim implementasi membuka login produksi.

## Apa yang tersedia

PDF `Riset_Coretax_UI_Workflow_PPN_PPnBM_2026.pdf` adalah satu-satunya paket sumber yang ditemukan. Berkas prompt, report, register, catatan dan `update2026.pdf` utuh yang disebut pengguna tidak ditemukan sebagai berkas terpisah. Bukti UI yang tersedia berasal dari gambar yang tertanam pada PDF. Daftar inventaris lengkap ada di `package-inventory.json`.

Delapan URL awal resmi pengguna dicoba melalui jaringan normal. Percobaan awal terhalang izin koneksi; retry dengan izin network resmi tetap memperoleh `Tunnel connection failed: 403 Forbidden` dari proxy. Tidak ada bypass atau klaim telah membaca konten primer yang tidak berhasil diambil. Lihat `network-observations.json`. Pekerjaan lokal tetap diteruskan memakai spesifikasi pengguna dan bukti artefak.

## Keputusan versi

| Dimensi | Baseline | Batas |
| --- | --- | --- |
| Cutoff pengetahuan proyek | 2026-10-04 | Perubahan kemudian tidak masuk otomatis |
| UI login | R00 gambar 3, S02, observasi dilaporkan 2026-10-04 | Screenshot 1265×712; DOM/font asli tidak tersedia |
| UI internal faktur/SPT | S04 Jan 2025, S05 edisi tercetak 20240909; shell S07 edisi 20250106 | Bukti historis; tanggal direktori bukan versi UI |
| Buku Besar | Gambar S14 hlm. 65/69, materi diperbarui 2026-10-01 | Shell putih berbeda generasi dari shell navy 2024/2025 |
| Aturan PPN umum | PMK 131/2024, PER-11/PJ/2025 sebagaimana dijelaskan dalam R00 dan diminta pengguna | Primer lengkap belum diakses pada sesi ini |
| Pembetulan | PER-12/PJ/2026: tanggal penyampaian sejak 2026-10-01 untuk ruang lingkup masa sejak 2025 | Materi menyebut kesiapan infrastruktur; produksi tidak diuji |
| Billing | PER-8/PJ/2026; 336 jam sejak terbit | Tidak mengubah jatuh tempo pajak |
| Masa dasar | Oktober 2026 | Fixture, bukan tanggal aktual |
| Clock dasar | 15 November 2026 | Dikontrol simulator; tidak mengikuti jam komputer |

## Temuan yang menentukan perilaku

Harga jual, DPP nilai lain, tarif hukum dan hasil efektif adalah data berbeda. Nonmewah umum memakai 12% × 11/12 × harga neto; faktur Rp100 juta memberi PPN Rp11 juta. Harga bruto Rp111 juta dibagi 1,11 untuk kembali ke neto. Formulir III.B adalah setoran di muka, III.C adalah PM yang dapat diperhitungkan dari II.G, dan III.D adalah kelebihan pemungutan; ketiganya tidak boleh tertukar.

Approval faktur bukan kredit PM, posting bukan pelaporan, billing bukan pembayaran, dan pembayaran bukan BPE. Retur memengaruhi masa tanggal retur setelah keputusan yang relevan; pengganti memakai masa faktur asal dan menyimpan relasi. SPT dilaporkan dan faktur approved harus tetap berupa snapshot sejarah.

Koreksi pembetulan baru menghitung setoran dikurangi refund menurut bucket, bukan menyalin nilai KB/LB SPT lama. Screenshot salindia perubahan masih memperlihatkan beberapa label lama dengan panah “Perubahan Calculation Rule”; formula baru harus dijelaskan di UI. Kompensasi adalah ledger hak, pemakaian dan penyesuaian, bukan faktur PM baru atau KB semu ketika LB berkurang.

## Referensi lanjutan lokal

- `source-register.json`: 45 entri, URL dari PDF, versi, halaman dan cakupan verifikasi.
- `visual-manifest.json`: 18 gambar, atribusi, hash, dimensi, pengukuran warna dan approximation.
- `screen-map.md`: kontrak layar dan sumbernya, bukan sertifikat implementasi.
- `rule-mapping.md` dan `tax_rules.md`: hubungan formula, field dan aturan versi.
- `ppn_workflow.md`: urutan dan invariants dokumen.
- `ui_research.md`: pengamatan visual dan batas pencocokan.
- `expected-results.json`: angka latihan deterministik; bukan bukti kelulusan tes.
- `evidence-gaps.md`: hal yang belum diketahui dan akibatnya.

Hasil build, tes domain/integrasi, Playwright, console/network dan screenshot aplikasi harus dibaca dari laporan QA aktual. Dokumen riset ini tidak memberikan PASS terhadap implementasi yang belum diuji.
