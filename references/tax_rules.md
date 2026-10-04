# Catatan aturan pajak dan versi

Catatan ini adalah rekonstruksi implementasi, bukan `tax_rules.md` paket asli. **VERIFIED**: teks/angka pada R00 dibaca dan beberapa salindia tertanam diperiksa. **UNVERIFIED**: naskah primer lengkap dan kesiapan produksi. Formula implementasi juga merupakan persyaratan eksplisit pengguna. Sumber/cutoff dipisahkan dari tanggal fixture.

## Nonmewah umum

Harga neto setelah diskon, sebelum PPN, adalah nilai ekonomi. DPP nilai lain = harga neto×11/12; PPN = DPP nilai lain×12%; tarif hukum tetap12%. Harga bruto dibagi1,11 untuk kembali ke neto. DPP pecahan tidak dibulatkan dini. Rezim ini tidak menjadi fallback untuk fasilitas, besaran tertentu, objek khusus, ekspor atau seluruh barang berharga mahal. R00 hlm.8,21–22; S12 Pasal2–5.

Rupiah SPT menggunakan pembulatan half-up: 100,49→100; 100,50→101. Dasar atribusi S11 Lampiran, PDF hlm.190, sebagaimana dikutip R00 hlm.22. Perilaku pembulatan setiap baris faktur produksi belum diuji.

## Kode transaksi

04 adalah jalur DPP nilai lain yang relevan untuk latihan nonmewah umum; kode mengikuti definisi/prioritas, bukan pilihan tarif terkecil. 05 besaran tertentu; 06 skema turis asing; 10 penyerahan lainnya di luar01–09. 02/03 pemungut; 07 tidak dipungut/ditanggung pemerintah sesuai fasilitas; 08 dibebaskan; 09 aktiva tujuan awal bukan diperjualbelikan. Kode/rezim di luar rule pack harus ditolak eksplisit. R00 hlm.8; S11 hlm.157–161.

## Pengkreditan dan masa

PM valid dan eligible dapat dikreditkan masa sama atau tiga masa berikutnya; Januari sampai April. Kredit biasa Mei ditolak dengan penjelasan jalur pembetulan perlu dianalisis. Dokumen approved tidak otomatis eligible. Double credit ditolak per WP/dokumen; keputusan nonkredit/netral/invalid terpisah. PPnBM tidak dikreditkan sebagai PM. Retur efektif mengikuti masa tanggal retur; pengganti mengikuti masa faktur asal. R00 hlm.9–10, S11a Pasal48–50/122, Q03/Q05/Q06.

## Pembetulan berlaku 1 Oktober 2026

Rule selection memakai masa + tanggal penyampaian. Untuk pembetulan masa sejak Januari 2025 yang disampaikan sejak 1 Oktober 2026, terapkan rule baru menurut ruang lingkup yang dijelaskan R00. Uji historis memakai masa Agustus 2026 yang normalnya sudah dilaporkan, dan clock 30 September versus 1 Oktober; jangan membuat skenario pelaporan Oktober pada September.

Nilai signed: KB positif, LB negatif. III.E=III.A−III.B−III.C−III.D. III.F=setoran PPN−refund SKPPKP yang relevan sebelum pembetulan. III.G=III.E−III.F. VI.C=VI.A−VI.B; VI.D=setoran PPnBM−refund SKPLB; VI.E=VI.C−VI.D. Refund harus jenis keputusan yang tepat, bukan seluruh uang masuk. Bagian VIII berbeda menurut tax bucket dan kapasitas Pihak Lain; tidak disimulasikan hanya dengan menyalin formula III.

Kompensasi contoh: hak Oktober200ribu→100ribu, LB November300ribu telah diteruskan ke Desember. Penyesuaian Desember=300ribu−200ribu+100ribu=200ribu. Tidak ada KB semu100ribu karena hak berkurang. Penyesuaian tertentu menunggu kesiapan infrastruktur menurut materi; simulator menandainya sebagai simulasi berbasis aturan, kesiapan produksi belum diverifikasi. R00 hlm.19–21; S14 hlm.8,35–49; S18 PasalII (salinan sekunder).

## Pembayaran dan batas waktu

Billing aktif jika clock<createdAt+336 jam, expired tepat batas. Billing aktif tidak memperpanjang tenggat SPT. Approval faktur tanggal20 bulan berikutnya dibedakan dari setor/lapor PPN akhir bulan berikutnya. Tidak tersedia kalender hari libur primer berversi dalam artefak; jangan mengarang penyesuaian seluruh tahun. Untuk fixture Oktober2026, tanggal20/30November tidak memerlukan mengklaim kalender nasional lengkap. R00 hlm.18–19; S15, S16a/S16b, S11a Pasal44.

## PPnBM pedagogis

**ASSUMPTION**: persona skenario adalah produsen yang menyerahkan BKP sah tergolong mewah, basis1miliar, tarif latihan20%. PPN120juta; PPnBM200juta; total1,32miliar. PM22juta hanya mengurangi bucket PPN menjadi98juta. Tarif 20% tidak dipetakan ke semua produk mahal atau seluruh kendaraan. Klasifikasi produk nyata di luar cakupan. R00 hlm.21–23.
