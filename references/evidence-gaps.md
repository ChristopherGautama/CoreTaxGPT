# Evidence gaps dan akibatnya

Cutoff: **4 Oktober 2026**. Gap di sini tidak berarti tes aplikasi gagal; juga tidak boleh ditutup dengan menandai PASS tanpa pemeriksaan. Status implementasi aktual dilaporkan terpisah.

| ID | Status | Hal yang belum terverifikasi | Akibat pada simulator |
| --- | --- | --- | --- |
| G01 | UNVERIFIED | Sumber primer lengkap tidak berhasil diunduh: delapan URL resmi ditolak proxy 403 setelah network permission | Formula mengikuti permintaan eksplisit pengguna dan R00; sumber primer tidak diberi VERIFIED; tidak mengklaim audit hukum independen |
| G02 | UNVERIFIED | `update2026.pdf` utuh dan lampiran perubahan 2026 tidak tersedia | Hanya formula/contoh yang jelas dalam R00 dan salindia tertanam; bagian khusus tetap overview |
| G03 | UNVERIFIED | Paket `PROMPT_IMPLEMENTASI_CORETAX.md`, catatan, manifest, report asli terpisah tidak ditemukan | File references baru dilabeli rekonstruksi, bukan disamarkan sebagai paket asli |
| G04 | UNVERIFIED | Sesi login/internal produksi, pesan error literal, seluruh hak akses per profil | Akun/role/status/error lokal DESIGN; tidak ada panggilan API produksi |
| G05 | ASSUMPTION | Font asli, CSS, radius, spacing dan viewport sumber crop internal | Pengukuran raster dicatat; font sistem/CSS approximation; tidak mengklaim pixel-perfect |
| G06 | VERIFIED sebagai perbedaan artefak | Manual2024/2025 navy dan Buku Besar2026 putih berbeda generasi | uiEvidenceVersion dicantumkan per layar; shell tunggal simulator adalah pilihan desain |
| G07 | UNVERIFIED | Seluruh pembulatan faktur per baris produksi | Hanya pembulatan SPT half-up dipastikan sebagai kontrak; DPP pecahan tidak dibulatkan dini |
| G08 | UNVERIFIED | BPE/bukti bayar produksi terkini dan format nomor/QR yang sah | Dokumen didesain edukatif, semua nomor SIM-, watermark, tanpa QR validasi DJP |
| G09 | UNVERIFIED | Schema XML impor Coretax, batas upload, extension terkini | Tidak mengklaim ekspor/impor kompatibel DJP; format progress simulator eksplisit |
| G10 | UNVERIFIED | Klasifikasi barang/tarif PPnBM nyata, tarif kendaraan/nonkendaraan | Hanya kasus pedagogis1miliar/20% dengan asumsi produsen/objek sah; tidak menjadi lookup barang mahal |
| G11 | UNVERIFIED | Kesiapan produksi penyesuaian kompensasi baru | Label “simulasi berbasis aturan; kesiapan produksi belum diverifikasi” |
| G12 | UNVERIFIED | Kalender hari libur resmi berversi seluruh masa | Tidak mengklaim penyesuaian tenggat tahunan lengkap; gunakan tanggal fixture tanpa kalender buatan |
| G13 | UNVERIFIED | Seluruh rezim khusus, fasilitas, Pihak Lain, pemungut, PIB/PEB, PBK | Overview atau validasi unsupported; tidak fallback ke nonmewah umum |
| G14 | UNVERIFIED | SPT Tahunan PPh/eBupot/PBB/modul khusus lengkap | “Belum disimulasikan” dengan alasan; tidak ada tombol sukses palsu |
| G15 | DESIGN | Responsive 390×844 tanpa screenshot mobile produksi | Adaptasi belajar, bukan replika seluruh M-Pajak |
| G16 | ASSUMPTION | Validitas legal skenario asal kompensasi, eligible PM, produsen mewah | Dijelaskan sebagai fixture sintetis; mahasiswa tidak memasukkan data nyata |
| G17 | UNVERIFIED | Proses pemeriksaan/refund/pembetulan yang sedang berlangsung dan legacy sebelum 2025 | Tidak menyediakan keberhasilan generik tanpa fixture proses dan expected result |
| G18 | UNVERIFIED | Hak reproduksi/distribusi ulang paket sumber di luar pembelajaran pribadi | Aset disimpan sebagai referensi lokal beratribusi; tidak dipublikasikan/deploy oleh pekerjaan ini |

Sumber yang dapat diperiksa ulang kelak sudah disimpan sebagai URL dan halaman pada `source-register.json`. Pembaruan bukti harus membuat versi baru, bukan mengganti aturan skenario historis diam-diam. Bukti baru setelah cutoff memerlukan rule pack baru dengan tanggal berlaku/observasi masing-masing.
