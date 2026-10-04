# Mapping formulir, engine, dan asal aturan

Status: **DESIGN** untuk nama rule pack dan kontrak mesin; **VERIFIED terhadap kutipan R00/gambar tertanam**; **UNVERIFIED** untuk naskah primer lengkap. Ini bukan bukti PASS tes. Seluruh angka uang disimpan sebagai nilai desimal/string presisi, identitas/nomor sebagai string, waktu dari clock simulasi.

## Field Induk dan lineage

| Sumber | Tujuan | Aturan/arti | Bukti |
| --- | --- | --- | --- |
| A1 ekspor | I.A.1 | Ekspor, bukan PK domestik dipungut sendiri | R00:13–14; S11 Lampiran E |
| A2 kode04/05 | I.A.2 | DPP nilai lain/besaran tertentu | R00:14 |
| A2 kode06 | I.A.3 | Skema turis asing | R00:8,14 |
| A2 kode01/09/10 | I.A.4 | Penyerahan dipungut sendiri lainnya | R00:14 |
| Faktur digunggung dipungut sendiri | I.A.5 | Tidak dihitung ulang dalam A2 | R00:14 |
| A2 kode02/03 | I.A.6 | Penjualan kepada Pemungut PPN | R00:14 |
| A2 kode07 | I.A.7 | Fasilitas tidak dipungut sesuai syarat | R00:14 |
| A2 kode08 | I.A.8 | Fasilitas dibebaskan | R00:14 |
| B1 eligible | II.A | PM impor/pemanfaatan luar daerah pabean | R00:13,15 |
| B2 kode04/05 | II.B | PM eligible domestik DPP nilai lain/besaran tertentu | R00:13,15; V12 |
| B2 kode01/09/10 | II.C | PM eligible domestik lainnya | R00:13,15; V12 |
| B2 kode02/03 | II.D | Perolehan dalam kapasitas pemungut | R00:13,15 |
| Ledger kompensasi | II.E | Hak kompensasi efektif, bukan pembelian | R00:15,20–21 |
| Penghitungan kembali PM | II.F | Hanya kasus berdasar aturan, bukan penyeimbang | R00:15 |
| II.A+II.B+II.C+II.D+II.E+II.F | II.G | PM yang dapat diperhitungkan pada kolom PPN | R00:15; V12 |
| B3 | II.H | PM nonkredit/fasilitas; tidak mengurangi PK | R00:13,15 |
| II.G | III.C | PM yang dapat diperhitungkan | R00:16; V17 |
| I.A.2+I.A.3+I.A.4+I.A.5 (PPN) | III.A | PK harus dipungut sendiri | R00:16 |
| Alokasi pembayaran di muka dalam masa yang sama | III.B | PPN disetor di muka, bukan seluruh histori | R00:16 |
| Kelebihan pemungutan PPN | III.D | Bukan PM; memerlukan fakta pendukung | R00:16 |
| C, PKP sebagai Pihak Lain Pasal 32A | VIII.A | Dipisah PPN/PPnBM | R00:13,16 |

Peta ini mencakup bentuk formulir; keberadaan mapping tidak otomatis berarti setiap rezim diimplementasikan. C/Pihak Lain tidak disamakan dengan Pemungut PPN Pasal 16A pada bagian VII. Unsupported regime memberi validasi eksplisit.

## Rule pack dan kontrak fungsi murni

| ID konseptual | Input | Output/invariant | Sumber |
| --- | --- | --- | --- |
| PPN-GENERAL-131-2024 | Harga neto, jenis perlakuan | DPP=neto×11/12; PPN=DPP×12%; simpan nilai sebelum pembulatan | R00:8,21–22; S12:2–5 |
| GROSS-TO-NET-GENERAL | Bruto termasuk PPN | Neto=bruto/1,11; faktor11/12 tidak mengeluarkan pajak bruto | R00:8–9 |
| SPT-IDR-HALF-UP | Pajak desimal | Pecahan<0,5 turun, ≥0,5 naik | R00:22; S11 PDF 190 |
| PM-CREDIT-WINDOW | Masa faktur, masa kredit, status, kelayakan, kredit terdahulu | Selisih0–3 masa; di luar itu jalur biasa blok + penjelasan pembetulan; duplikat ditolak | R00:9; S11a:122/Q03 |
| INVOICE-EFFECTIVE | Snapshot approved, pengganti/batal/retur efektif | Satu versi efektif; retur dibatasi sisa dan masa tanggal retur | R00:9–10; S11a:48–50/Q05/Q06 |
| POST-LINEAGE | WP, masa, sumber efektif, kompensasi | Agregasi deterministik, tidak berganda; sumber berubah→stale | R00:11–12 (DESIGN kontrol) |
| AMENDMENT-2026-10-01 | Masa, tanggal penyampaian, III.A/B/C/D, setoran/refund | III.E=A−B−C−D; III.F=setoran−SKPPKP; III.G=E−F | R00:16,19–20; S14:8,39–40 |
| PPnBM-PEDAGOGIC | Neto1miliar, asumsi produsen/objek sah, tarif latihan 20% | PPN120juta, PPnBM200juta; PM tidak mengurangi PPnBM | R00:23; ASSUMPTION klasifikasi/tarif |
| PPnBM-AMENDMENT | VI.A/B, setoran/refund SKPLB | VI.C=A−B; VI.D=setoran−SKPLB; VI.E=C−D | R00:16; S14:41–42 |
| COMPENSATION-ADJUSTMENT | Hak sumber lama/baru, penggunaan historis, saldo penerima | Saldo penerima+hakbaru−haklama; versi sumber/penggunaan tetap tersimpan | R00:20–21; V18/S14:45–49 |
| BILLING-336H | createdAt, clock, status | Aktif iff clock<createdAt+336 jam dan unpaid; tepat batas expired; paid idempotency | R00:18; S15 |
| RULE-SELECTION | taxPeriod, filingDate, status proses | Tidak hanya tahun transaksi; transisi 30 Sep/1 Okt diuji pada masa Agustus 2026 | R00:19; S14:8/S18:II |

Setoran di muka yang telah mengurangi III.E tidak boleh memberi manfaat dua kali saat setoran/refund pembetulan dialokasikan. Simulator perlu menyimpan asal dan alokasi per bucket; angka signed diterapkan pada hasil kewajiban, besaran payment/refund disimpan positif sebagai magnitude event.

## Batas versi historis

Aturan 2026 tidak otomatis diterapkan pada penyampaian sebelum 1 Oktober 2026. Penanganan historis delta, bila tersedia untuk latihan perbandingan, diberi label historis dan versi eksplisit; cakupan masa 2024/legacy di luar rule pack ditolak. Proses yang sudah masuk sebelum perubahan dan belum selesai memerlukan ketentuan peralihan; bila tidak ada fixture terverifikasi, tampilkan UNVERIFIED.
