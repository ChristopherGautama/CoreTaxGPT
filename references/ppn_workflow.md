# Workflow PPN — kontrak pembelajaran

**DESIGN** untuk state internal dan kontrol lokal; dasar dokumentasi R00 hlm.4–21, S04/S05/S06/S10/S11/S14/S15 dan Q01–Q24. Primer lengkap tidak diakses ulang; lihat source-register.

1. Login persona demo → validasi 2FA fixture jika aktif → pilih WP yang diwakili. Aktor dan WP aktif disimpan terpisah; izin dicek pada aksi, bukan hanya tombol. PIC memberi penugasan; relasi pihak terkait tidak otomatis memberi role signer.
2. Faktur keluaran: draft → validasi data/rincian → upload/penerbitan terpisah dari impor → signing oleh role berwenang dengan sertifikat latihan → approval simulasi. Draft belum menambah PK. Approved dikunci; koreksi membuat relasi/versi baru. Tidak ada XML yang diklaim kompatibel produksi tanpa schema primer.
3. PM: periksa dokumen, pemilik, eligible material/formal, masa dan kredit sebelumnya → kredit/nonkredit/approved netral/invalid. Noneligible tetap dicatat; PPnBM tidak menjadi kredit PM. Januari–April jalur biasa; Mei perlu analisis pembetulan, bukan hilangnya hak otomatis.
4. Retur: referensi faktur/baris → tanggal/nilai atau kuantitas dalam sisa transaksi → upload → penjual setuju/tolak → hanya retur efektif mengubah masa tanggal retur. Retur ditolak/menunggu tidak mengurangi PK. Retur November atas Oktober masuk November. Pengganti mengikuti masa asal; pembatalan dan retur bukan edit approved.
5. Konsep normal otomatis tersedia 1 bulan berikutnya; cek dahulu agar tidak ganda. SPT September fixture telah dilaporkan. Posting menyimpan lineage dan merekonsiliasi dokumen approved efektif/PM eligible/retur efektif. Posting berulang idempotent; sumber berubah membuat konsep perlu ditinjau ulang.
6. Tinjau A2/B2/B3 dan Induk. Pada kasus dasar A2→I.A.2=PK55juta; B2→II.B=PM22juta; II.E=3juta dari ledger September; II.G→III.C=25juta; III.E=KB30juta. Total turunan tidak ditimpa kosmetik.
7. Pernyataan dan signing memeriksa role/WP/sertifikat/versi. Bayar dan Lapor memisahkan konsep, menunggu pembayaran, pelunasan dan pelaporan. KB memilih deposit cukup atau billing seluruh sisa sesuai bucket; baseline tidak menggabung sebagian deposit+sebagian billing untuk satu SPT.
8. Billing baru belum lunas. Berlaku tepat 336jam sejak terbit. Cancel unpaid mengembalikan konsep ke tahap yang dapat ditinjau; paid tidak dihapus/dibayar ulang. Deposit berasal dari lot dan berkurang karena allocation, bukan edit saldo bebas.
9. Bukti pembayaran SIM lahir dari setoran/alokasi; BPE SIM hanya setelah pelaporan. Nihil dan LB tetap signing/pelaporan. SPT KB30juta yang dibayar tetap hasil KB30juta, dengan kewajiban pelunasan nol.
10. Pembetulan menyimpan versi sebelumnya dan BPE lama; versi efektif terbaru menjadi dasar. Aturan dipilih dengan masa dan tanggal penyampaian. Setoran/refund dikumpulkan dari bucket/alokasi relevan, hindari setoran di muka dua kali. Kompensasi sumber/penggunaan/adjustment dipertahankan.

Semua kejadian merekam actorUserId, actingTaxpayerId, objek, aksi, waktu clock latihan dan relasi sumber. Reset mengembalikan graph skenario secara atomik; replay menampilkan jejak kejadian tanpa menggandakan transaksi. Export/import diberi format simulator dan watermark.
