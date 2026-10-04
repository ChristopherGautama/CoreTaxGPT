# Peta layar dan kontrak bukti

ID layar di bawah merupakan **DESIGN**, bukan route DJP. Tabel memetakan kebutuhan ke bukti; kolom cakupan bukan klaim kelulusan implementasi. Fitur yang benar-benar selesai dan hasil tes ada di laporan QA aktual. Semua layar memuat penanda tetap **SIMULASI BELAJAR • BUKAN LAYANAN DJP**.

Bukti teks `R00` telah dibaca; gambar `Vxx` telah diperiksa sebagai gambar tertanam. Seluruh asal primer `Sxx/Qxx` belum berhasil diakses ulang. P0 adalah cakupan latihan terbatas, P1 memerlukan aturan/expected result lengkap, P2 adalah overview “Belum disimulasikan”.

| ID | Layar/area | Kelompok kontrol dan urutan penting | Bukti | Cakupan/versi |
| --- | --- | --- | --- | --- |
| UI-01 | Landing | Bahasa, identitas, tautan login | V02 / S01, R00:3 | P0; publik dilaporkan 2026-10-04 |
| UI-02 | Login | ID, sandi/visibility, verifikasi lokal, lupa, masuk, daftar, aktivasi, bahasa/tema | V03 / S02, R00:3–4 | P0; publik dilaporkan 2026-10-04 |
| UI-03 | Lupa sandi | Persona/kontak fixture, token demo, validasi akses | Q20, R00:4 | P0; alur lokal DESIGN |
| UI-04 | Aktivasi/Daftar demo | Pilih persona sintetis, kontak, verifikasi, pernyataan | V04 / Q21, R00:4 | P0; cabang demo, bukan registrasi nyata |
| UI-05 | Profil | Identitas, PKP, alamat, KLU, TKU | S08, R00:4–6 | P0; struktur DOC 2024, fixture DESIGN |
| UI-06 | Pemilih akun/impersonate | Aktor, WP aktif, kapasitas, kembali diri sendiri | V10 / S06, R00:5 | P0; akses dipaksa di service |
| UI-07 | Relasi/role | Pihak terkait, role drafter/signer, scope, tanggal | S06, R00:5 | P0; role bukan status hukum kuasa |
| UI-08 | KODJP | Permohonan demo, passphrase latihan, status sertifikat | S10, R00:5 | P0; DOC Des2025; status internal DESIGN |
| UI-09 | Verifikasi dua langkah | Setup, kode fixture, aktif/belum aktif | Q24, R00:26 | P0; tidak mengirim OTP |
| UI-10 | Dasbor e-Faktur | Ringkasan masa, daftar keluaran/masukan/retur | S05, R00:26 | P0; data diturunkan |
| UI-11 | Pajak Keluaran | Identitas WP, sidebar, toolbar, filter, sort, pagination, scroll | V05 / S04:29 | P0; DOC Jan2025 |
| UI-12 | Editor faktur | Tanggal, kode, jenis, periode, referensi, pembeli, rincian | V06 / S05:14 | P0; DOC 20240909; label Indonesia DESIGN bila tak terlihat |
| UI-13 | Detail transaksi | Barang/jasa, uraian, satuan, harga, kuantitas, diskon, DPP, PPN, PPnBM | V07 / S05:16; R00:7–8 | P0; formula 2026 terpisah UI 2024 |
| UI-14 | Impor data | Pilih file, preview, validasi per baris, duplikat; impor belum approval | Q01, R00:26 | P1; format simulator harus eksplisit, XML kompatibel DJP UNVERIFIED |
| UI-15 | Signing faktur/SPT | Actor/WP, role, sertifikat, passphrase demo, snapshot | Q13 / S06/S10, R00:5,9 | P0; tidak ada sertifikat nyata |
| UI-16 | Pajak Masukan | Filter/detail, kredit/nonkredit/netral/invalid, alasan/masa | V08 / S04:32; Q03 | P0; DOC historis, keputusan simulator terpisah |
| UI-17 | Retur pembeli | Faktur sumber, tanggal/kuantitas/nilai, simpan/upload | Q06, R00:10 | P0; sisa transaksi divalidasi |
| UI-18 | Retur penjual | Notifikasi, detail, setuju/tolak | Q06, R00:10 | P0; approval mengubah masa retur |
| UI-19 | Pengganti/pembatalan | Referensi asal, alasan, versi/relasi, keputusan jika perlu | S11a:48–50/Q05 | P0; histori tidak ditimpa |
| UI-20 | Dokumen lain | PIB/PEB/dokumen setara, masa/pemilik, tarik fixture | Q08, R00:11 | P1; overview sampai schema/expected result memadai |
| UI-21 | Uang muka/pelunasan | Kontrak, nomor sumber, basis telah difakturkan, sisa | Q07, R00:10 | P1; kasus matematika tersedia, UI belum otomatis diklaim lengkap |
| UI-22 | Daftar SPT | Konsep, menunggu pembayaran, dilaporkan; masa/jenis | V09 / S04:34 | P0; DOC Jan2025 |
| UI-23 | Konsep normal | Cari konsep otomatis, periode, normal/pembetulan, posting | V10 / S04:34; Q02 | P0; pembatasan masa sesuai fixture |
| UI-24 | A1/A2 | Dokumen penyerahan, harga/DPP/PPN/PPnBM, sumber efektif | S11:191–231, R00:12–14 | P0 A2; A1 tidak berisi kasus ekspor yang belum didukung |
| UI-25 | B1/B2/B3 | PM kredit/nonkredit dan perolehan; masa kredit | V11 / S05:58; S11 | P0 B2/B3; B1 overview jika impor belum didukung |
| UI-26 | Lampiran C | Hanya PKP Pihak Lain Pasal 32A→VIII.A | S11, R00:13 | P1 overview; bukan pemungut Pasal 16A |
| UI-27 | Induk I–III | Identitas, klasifikasi sumber, II.G→III.C, hasil signed | V12/V17 / S14:38/40 | P0; formulir/rule 2026, bukan UI live |
| UI-28 | Induk IV–IX | PPnBM terpisah; KMS/pemungut/pihak lain kondisional | V13 / S14:42; S11 | P0 VI pedagogis; bagian khusus overview |
| UI-29 | Pernyataan SPT | Identitas penandatangan, jabatan, pernyataan, validasi | S11, R00:17 | P0; field wajib lokal DESIGN bila detail tak diamati |
| UI-30 | Bayar dan Lapor | Hasil KB/LB/nihil, metode, konfirmasi signing | V14 / S05:60; Q02/Q09/Q10 | P0; deposit cukup atau billing penuh |
| UI-31 | Billing SPT | Nomor SIM, nilai/bucket/masa, createdAt/expiresAt | S15, R00:18 | P0; 336 jam, bukan label “lunas” |
| UI-32 | Billing mandiri/tagihan | Jalur/KAP/KJS menurut jenis kewajiban | S09/Q22 | P1 overview sampai fixture legal lengkap |
| UI-33 | Daftar billing | Aktif/expired/cancelled/paid, cancel, terbit ulang, bayar demo | Q11/S15, R00:18 | P0; paid tidak dihapus/diulang |
| UI-34 | Deposit | Lot sumber, sisa, alokasi; saldo cukup/kurang | Q09/Q10/Q23, R00:17–19 | P0; sumber sintetis, bukan top-up bank |
| UI-35 | Buku Besar | Masa/tanggal/jenis/KAP/KJS, total/filter, ekspor | V15/V16 / S14:65/69 | P0; shell 2026 berbeda dari navy historis |
| UI-36 | SPT dilaporkan/BPE | Snapshot versi, waktu, signer, bukti SIM | Q02/Q12, R00:18 | P0; bentuk BPE DESIGN, bukan dokumen resmi |
| UI-37 | Pembetulan | Versi asal, tanggal filing, setoran/refund per bucket, supersedes | V17 / S14:40; R00:19–20 | P0; rule dipilih tanggal/masa |
| UI-38 | Kompensasi | Sumber, penggunaan, adjustment, masa penerima, saldo | V18 / S14:45–49 | P0; produksi UNVERIFIED |
| UI-39 | Notifikasi/dokumen/audit | Kejadian, status, unduh watermark, aktor/WP/waktu | S08, R00:27 | P0; audit/replay DESIGN |
| UI-40 | PBK/layanan lanjutan | Sumber, peta tahapan, alasan belum didukung | S09/S15 | P1 overview; tidak ada keberhasilan palsu |
| UI-41 | Peta modul | Portal Saya, e-Faktur, eBupot, SPT, Bantuan, Pembayaran, Buku Besar, Layanan WP, Manajemen Akses, Pertukaran Informasi | V01/S03/S07/S20 | P0 peta; P2 PPh/eBupot/PBB/khusus overview |
| UI-42 | Pusat latihan | Terpandu/Mandiri/Ujian, kasus, hint, nilai, reset/replay, ekspor/impor | R00:24 | P0; seluruhnya DESIGN |

Pada mobile, navigasi horizontal dapat discroll dan sidebar beradaptasi. Semua kolom tetap dapat dicapai melalui scroll atau tampilan detail; tombol penting tidak boleh hilang. Tanggal/nomor/identitas di gambar penerbit tidak digunakan sebagai data fixture.
