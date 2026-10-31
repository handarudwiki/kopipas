# Panduan Singkat KopiPass (Pilot)

KopiPass membantu eksportir menyiapkan **satu paket bukti EUDR per pengiriman**: peta kebun asal, hasil cek risiko deforestasi, bukti legalitas lahan, dan set dokumen ekspor yang sudah divalidasi.

Alurnya: **Lapangan** (petani → kebun → pembelian) dan **Dokumen** (pengiriman → unggah → validasi) bertemu di **Lot**, lalu **Paket bukti** dibuat bila keduanya bersih.

---

## 1. Peran

| Peran | Yang dikerjakan |
| --- | --- |
| **Admin eksportir** | Mengundang pengguna, mengatur ambang & rasio, memutuskan verifikasi kebun berisiko, **menyetujui & membuat paket bukti**, membuat/mencabut tautan importir |
| **Staf dokumen** | Membuat pengiriman, mengunggah dokumen, mengoreksi field, menjalankan validasi, menyusun & mengunci lot |
| **Petugas lapangan** | Aplikasi lapangan (`/field`): daftar petani, petakan kebun, foto bukti legalitas, catat pembelian — bisa tanpa internet |
| **Forwarder** | Mengunggah & memvalidasi dokumen pengiriman |
| **Super admin KopiPass** | Mengelola tenant dan dataset referensi hutan 2020 |

Undang pengguna di **Pengaturan → Pengguna & Peran → Undang pengguna**. Salin tautan undangan dan kirim ke orangnya (berlaku 7 hari, sekali pakai).

## 2. Petugas lapangan — aplikasi `/field`

1. Buka `https://<alamat-kopipass>/field` di HP Android (Chrome), masuk, lalu pilih **Tambahkan ke layar utama** agar bisa dibuka seperti aplikasi.
2. **Sebelum ke lapangan** (masih ada sinyal): di Beranda pilih radius lalu **Unduh** peta satelit offline.
3. **Daftarkan petani**: isi data, **centang persetujuan berbagi data** (wajib), simpan.
4. **Petakan kebun**:
   - Kebun **≤ 4 ha**: mode **Titik GPS** — berdiri di tengah kebun, tunggu akurasi **≤ 15 m** (hijau), tekan **Ambil titik**.
   - Kebun **> 4 ha**: wajib **poligon** — mode **Jalan keliling** (tekan *Tambah titik sudut* di setiap sudut) atau **Ketuk peta**.
   - Foto **bukti legalitas** (SHM/SKT/surat desa), atau pilih **Belum ada** bila memang tidak ada.
5. **Catat pembelian**: pilih petani dan kebun asal, tanggal, berat, bentuk (ceri/gabah/green bean).
6. Data tersimpan di HP dan **terkirim otomatis** saat online. Angka di pojok kanan atas = data yang masih antre. Data yang ditolak server (mis. akurasi GPS buruk) muncul di Beranda bagian *Gagal disinkron*.

## 3. Cek risiko deforestasi

- Setiap kebun baru atau yang berubah **otomatis diperiksa** terhadap peta tutupan hutan 31 Des 2020.
- Hasil: **LOLOS** (< 5% hutan), **PERLU VERIFIKASI** (5–20%, beririsan kawasan hutan, atau tanpa bukti legalitas), **BERISIKO** (> 20%), **TIDAK BISA DICEK** (> 4 ha tanpa poligon). Ambang dapat diubah di **Pengaturan → Organisasi**.
- Buka **Cek Risiko** untuk antrean. Admin membuka kebun → isi **Verifikasi lapangan** (catatan + foto) → pilih *Terverifikasi — LOLOS* atau *Dikonfirmasi BERISIKO*. Hanya admin yang dapat mengubah status, dan keputusan tercatat di audit log.

## 4. Lot

1. **Lot → Buat lot**: pilih pembelian; berat tersedia dihitung otomatis dengan rasio konversi (default ceri 0,16; gabah 0,8 ke green bean).
2. Isi berat lot. Bila melebihi pembelian, lot **tidak dapat dikunci**.
3. **Kunci lot** — lot terkunci tidak bisa diubah dan baru bisa ditautkan ke pengiriman.

## 5. Pengiriman & validasi dokumen

1. **Pengiriman → Buat pengiriman** (referensi, pembeli, pelabuhan, metode pembayaran, tanggal presentasi ke bank bila L/C).
2. Tab **Dokumen**: tarik-lepas PDF/JPG/PNG (invoice, packing list, B/L, SKA/COO, fitosanitari, PEB, L/C atau kontrak). Tipe terdeteksi otomatis; koreksi lewat menu tipe bila salah.
3. **Tinjau field**: field berlatar kuning (keyakinan < 80%) perlu dicek terhadap pratinjau. Koreksi → **Simpan koreksi** (tersimpan sebagai versi baru dan memicu validasi ulang). Dokumen hasil pindai harus diisi manual.
4. Tab **Lot & kebun**: **Tautkan lot** yang sudah dikunci.
5. **Jalankan validasi**. Tab **Temuan** menampilkan aturan D01–D15, tingkat, dokumen/field terkait, dan saran perbaikan.
   - Perbaiki data → validasi ulang → temuan otomatis **Selesai**.
   - Bila discrepancy disetujui pembeli: **Terima** dengan alasan (wajib).
6. Status **SIAP** hanya bila tidak ada ERROR terbuka. **Laporan PDF** tersedia di kanan atas.

## 6. Paket bukti EUDR & tautan importir (admin)

1. Tab **Paket bukti** → **Setujui & buat paket**. Tombol nonaktif dan menampilkan alasannya bila pengiriman belum SIAP atau ada kebun asal yang belum LOLOS/terverifikasi.
2. Paket berisi **PDF ringkasan** (bahasa Inggris, dengan hash SHA-256), **GeoJSON** semua kebun, dan **JSON** terstruktur. Nama petani tidak dibagikan.
3. Bila data berubah, muncul pemberitahuan — buat ulang untuk versi baru (hash baru).
4. **Buat tautan** untuk importir (default 90 hari). **Salin saat itu juga** — tautan hanya tampil sekali. Jumlah akses terlihat di tabel; **Cabut** kapan saja.

## 7. Audit & keamanan

- **Pengaturan → Audit Log**: setiap perubahan data (siapa, kapan, nilai lama/baru), percobaan akses yang ditolak, login, akses importir, dan konflik sinkronisasi.
- Setiap organisasi hanya melihat datanya sendiri.

## 8. Bantuan cepat

| Masalah | Solusi |
| --- | --- |
| "Akurasi GPS … melebihi batas" | Tunggu di area terbuka sampai akurasi ≤ 15 m |
| "Kebun > 4 ha wajib poligon" | Gunakan mode Jalan keliling / Ketuk peta |
| "Petani rujukan belum tersinkron" | Normal saat offline; akan terkirim otomatis setelah petani tersinkron |
| Tombol paket bukti nonaktif | Baca daftar alasan di tab Paket bukti |
| Lot tidak bisa dikunci | Berat lot melebihi pembelian setelah konversi — kurangi berat atau tambah pembelian |
