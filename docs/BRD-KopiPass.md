# BRD – KopiPass

Oct 31, 2026 · @Diamond

## Ringkasan

KopiPass adalah aplikasi web + mobile yang membantu eksportir kopi skala kecil-menengah menyiapkan satu paket bukti per pengiriman ke Uni Eropa: peta kebun asal, hasil cek risiko deforestasi, bukti legalitas lahan, dan set dokumen ekspor yang sudah divalidasi. MVP harus bisa dipakai 3 eksportir pilot untuk minimal 10 pengiriman nyata.

Dokumen ini adalah spesifikasi build. Setiap kebutuhan punya ID dan kriteria penerimaan agar bisa dijadikan tugas dan tes.

**Konteks bisnis singkat**

- EUDR berlaku untuk operator besar dan menengah mulai 30 Desember 2026, dan untuk usaha mikro dan kecil mulai 30 Juni 2027 \[1\]. Importir Uni Eropa akan meminta geolokasi kebun dan bukti legalitas dari pemasok Indonesia.
- Sekitar 29,9% ekspor kopi Indonesia menuju Uni Eropa; kurang dari 1% petani swadaya memenuhi syarat ketertelusuran dan legalitas \[2\].
- 65–80% presentasi dokumen L/C ditolak pada pengajuan pertama \[3\].

**Target MVP (12 bulan)**

| Metrik | Target |
| --- | --- |
| Recall deteksi diskrepansi dokumen pada set uji | ≥ 95% |
| Kebun terpetakan dengan geolokasi 6 desimal | ≥ 500 |
| Pengiriman pilot dengan paket bukti diterima importir | ≥ 10 |
| Waktu penyiapan dokumen per pengiriman | turun 50% dari baseline |

## Pengguna dan peran

Sistem multi-tenant: setiap eksportir adalah satu organisasi, dan semua data (petani, kebun, lot, pengiriman) milik organisasi tersebut.

| Peran | Aplikasi | Bisa melakukan |
| --- | --- | --- |
| Admin eksportir | Web | Kelola organisasi dan pengguna, lihat semua data, setujui paket bukti |
| Staf dokumen | Web | Buat pengiriman, unggah dokumen, jalankan validasi, perbaiki temuan |
| Petugas lapangan | Mobile (Android) | Daftarkan petani, petakan kebun, foto bukti legalitas, catat pembelian ceri/gabah |
| Forwarder (opsional di MVP) | Web | Unggah dan validasi dokumen untuk beberapa eksportir yang memberi akses |
| Importir UE (tamu) | Tautan baca saja | Lihat dan unduh paket bukti lewat tautan bertanda tangan, tanpa akun |
| Super admin KopiPass | Web | Kelola tenant, pustaka aturan, dataset referensi |

## Ruang lingkup MVP

MVP hanya untuk kopi (HS 0901) dengan tujuan Uni Eropa; semua yang lain menunggu setelah pilot.

**Masuk MVP**

- Registrasi petani dan pemetaan kebun offline (titik untuk kebun ≤ 4 ha, poligon untuk > 4 ha).
- Cek risiko deforestasi otomatis per kebun terhadap peta tutupan hutan 31 Desember 2020.
- Pencatatan pembelian dari petani dan penyusunan lot (kebun → lot → pengiriman).
- Unggah set dokumen ekspor, ekstraksi field otomatis, validasi konsistensi, laporan temuan.
- Generator paket bukti EUDR per pengiriman (PDF + GeoJSON + JSON).
- Tautan berbagi baca-saja untuk importir.
- Bahasa antarmuka Indonesia; paket bukti dan laporan dalam bahasa Inggris.

**Tidak masuk MVP**

- Pengajuan due diligence statement ke sistem informasi UE (itu kewajiban importir).
- Integrasi langsung ke CEISA, e-SKA, atau sistem bank.
- Komoditas selain kopi; negara tujuan selain UE.
- Pembayaran, invoicing, dan billing di dalam aplikasi (ditagih manual saat pilot).
- Aplikasi iOS.

## Alur utama

Data kebun dari lapangan dan dokumen dari staf ekspor bertemu di pengiriman; paket bukti hanya terbit bila keduanya bersih.

&#91;embedded content: alur utama KopiPass · 3 jalur kerja\]

Kebun berstatus PERLU VERIFIKASI atau BERISIKO memblokir paket sampai admin memutuskan (F3.4, F6.2).

## Kebutuhan fungsional

Enam modul. Prioritas: M = wajib MVP, S = sebaiknya ada, C = jika sempat.

### F1 — Organisasi dan akses

| ID | Kebutuhan | Kriteria penerimaan | Prioritas |
| --- | --- | --- | --- |
| F1.1 | Login email + password, undang pengguna ke organisasi | Pengguna undangan bisa set password dan hanya melihat data organisasinya | M |
| F1.2 | Peran sesuai tabel Pengguna dan peran | Endpoint menolak aksi di luar peran (HTTP 403) dan tercatat di audit log | M |
| F1.3 | Audit log semua perubahan data | Setiap create/update/delete menyimpan siapa, kapan, nilai lama, nilai baru | M |

### F2 — Petani dan pemetaan kebun (mobile)

| ID | Kebutuhan | Kriteria penerimaan | Prioritas |
| --- | --- | --- | --- |
| F2.1 | Daftarkan petani: nama, desa, kecamatan, kabupaten, kontak, persetujuan berbagi data | Petani tidak bisa disimpan tanpa centang persetujuan | M |
| F2.2 | Rekam titik kebun dengan GPS, 6 angka desimal | Koordinat tersimpan dengan 6 desimal; akurasi GPS ditampilkan dan ditolak bila > 15 m | M |
| F2.3 | Rekam poligon dengan berjalan mengelilingi kebun atau mengetuk titik di peta | Poligon valid (tertutup, tidak berpotongan sendiri); luas dihitung otomatis | M |
| F2.4 | Wajib poligon bila luas yang dinyatakan > 4 ha | Simpan ditolak bila luas > 4 ha tetapi hanya ada titik | M |
| F2.5 | Foto dan tipe bukti legalitas lahan (SHM, SKT, surat keterangan desa, lainnya) | Minimal 1 foto atau status "belum ada" tercatat eksplisit | M |
| F2.6 | Bekerja penuh tanpa internet, sinkron otomatis | 7 hari data bisa diantre; konflik diselesaikan dengan versi terbaru per field dan dicatat | M |
| F2.7 | Peta dasar offline untuk area kerja | Petugas bisa mengunduh tile area sebelum ke lapangan | S |

### F3 — Cek risiko deforestasi

| ID | Kebutuhan | Kriteria penerimaan | Prioritas |
| --- | --- | --- | --- |
| F3.1 | Setiap kebun baru/berubah otomatis diperiksa terhadap peta tutupan hutan 31 Des 2020 | Job selesai < 60 detik per kebun; hasil: % area berhutan di 2020 | M |
| F3.2 | Klasifikasi status: LOLOS / PERLU VERIFIKASI / BERISIKO | Ambang dapat dikonfigurasi admin; default lihat bagian Aturan | M |
| F3.3 | Cek tumpang tindih dengan batas kawasan hutan (bila dataset tersedia) | Kebun yang beririsan ditandai PERLU VERIFIKASI | S |
| F3.4 | Verifikasi lapangan untuk kebun berisiko: catatan + foto + keputusan | Status berubah hanya lewat keputusan admin, tersimpan di audit log | M |
| F3.5 | Tampilan peta kebun dengan lapisan hutan 2020 | Admin dapat melihat poligon di atas lapisan hutan | S |

### F4 — Pembelian dan lot

| ID | Kebutuhan | Kriteria penerimaan | Prioritas |
| --- | --- | --- | --- |
| F4.1 | Catat pembelian: petani, kebun, tanggal, berat, bentuk (ceri, gabah, green bean) | Pembelian wajib menunjuk kebun yang terdaftar | M |
| F4.2 | Buat lot dari satu atau lebih pembelian | Lot menyimpan daftar kebun asal dan total berat | M |
| F4.3 | Konversi berat antar bentuk dengan rasio yang bisa diatur | Rasio default dapat diubah per organisasi | S |
| F4.4 | Peringatan bila berat lot melebihi total pembelian setelah konversi | Lot tidak bisa dikunci saat terjadi kelebihan | M |

### F5 — Validasi dokumen ekspor

| ID | Kebutuhan | Kriteria penerimaan | Prioritas |
| --- | --- | --- | --- |
| F5.1 | Buat pengiriman dan tautkan satu atau lebih lot | Pengiriman menampilkan total berat lot dan daftar kebun | M |
| F5.2 | Unggah dokumen (PDF/JPG/PNG): invoice, packing list, B/L, SKA/COO, sertifikat fitosanitari, PEB, L/C atau kontrak | Tipe dokumen terdeteksi otomatis, bisa dikoreksi manual | M |
| F5.3 | Ekstraksi field ke skema JSON per tipe dokumen | Setiap field punya nilai, skor keyakinan, dan lokasi halaman; field yakin < 0,8 ditandai untuk dicek | M |
| F5.4 | Pengguna dapat mengoreksi field hasil ekstraksi | Koreksi disimpan sebagai versi baru dan memicu validasi ulang | M |
| F5.5 | Jalankan aturan validasi (bagian Aturan) | Setiap temuan berisi ID aturan, tingkat (ERROR/WARNING/INFO), dokumen dan field terkait, pesan, saran perbaikan | M |
| F5.6 | Laporan temuan per pengiriman (web + PDF) | Status pengiriman SIAP hanya bila tidak ada ERROR terbuka | M |
| F5.7 | Tandai temuan sebagai "diterima dengan alasan" | Alasan wajib diisi dan tercatat | S |

### F6 — Paket bukti EUDR

| ID | Kebutuhan | Kriteria penerimaan | Prioritas |
| --- | --- | --- | --- |
| F6.1 | Generate paket per pengiriman: PDF ringkasan, GeoJSON semua kebun, JSON data terstruktur | Isi sesuai daftar di bagian Aturan; dibuat < 2 menit | M |
| F6.2 | Paket hanya bisa dibuat bila semua kebun LOLOS atau sudah diverifikasi | Tombol nonaktif dengan alasan yang jelas | M |
| F6.3 | Paket diberi hash SHA-256 dan nomor versi | Hash tercetak di PDF; perubahan data membuat versi baru | M |
| F6.4 | Tautan berbagi bertanda tangan dengan masa berlaku | Default 90 hari; dapat dicabut admin; setiap akses tercatat | M |

## Model data

Semua tabel punya `id` (UUID), `org_id`, `created_at`, `updated_at`, `created_by`; geometri disimpan di PostGIS dengan SRID 4326.

| Entitas | Field utama | Relasi |
| --- | --- | --- |
| organization | name, npwp, address, country | punya banyak user, farmer, shipment |
| user | email, name, role, password\_hash, is\_active | milik organization |
| farmer | full\_name, village, district, regency, province, phone, consent\_at, consent\_scope | punya banyak plot |
| plot | farmer\_id, geom\_point, geom\_polygon, declared\_area\_ha, computed\_area\_ha, gps\_accuracy\_m, captured\_at, captured\_by | milik farmer; punya banyak legality\_evidence, risk\_check |
| legality\_evidence | plot\_id, type (SHM/SKT/SKD/OTHER/NONE), document\_number, photo\_keys\[\], notes | milik plot |
| risk\_check | plot\_id, dataset\_version, forest\_pct\_2020, overlaps\_forest\_area, status (PASS/REVIEW/RISK), decided\_by, decision\_note | milik plot; satu plot bisa punya banyak versi |
| purchase | farmer\_id, plot\_id, date, weight\_kg, form (CHERRY/PARCHMENT/GREEN) | milik plot |
| lot | code, product\_form, weight\_kg, locked\_at | punya banyak purchase lewat lot\_purchase |
| shipment | reference, buyer\_name, buyer\_country, port\_loading, port\_discharge, hs\_code, status (DRAFT/CHECKING/READY), payment\_method (LC/TT/OTHER) | punya banyak lot dan document |
| document | shipment\_id, type, file\_key, page\_count, extraction\_status, version | milik shipment; punya banyak extracted\_field |
| extracted\_field | document\_id, name, value, confidence, page, bbox, corrected\_by | milik document |
| finding | shipment\_id, rule\_id, severity, message, suggestion, refs (dokumen/field), status (OPEN/RESOLVED/ACCEPTED), accept\_reason | milik shipment |
| evidence\_pack | shipment\_id, version, sha256, pdf\_key, geojson\_key, json\_key, generated\_at | milik shipment; punya banyak share\_link |
| share\_link | evidence\_pack\_id, token\_hash, expires\_at, revoked\_at, access\_count | milik evidence\_pack |
| audit\_log | entity, entity\_id, action, actor\_id, before, after | semua entitas |

## Aturan validasi dan paket bukti

Keputusan lolos/gagal diambil oleh aturan deterministik yang dapat diaudit; LLM hanya mengekstrak field dan menulis saran perbaikan. Aturan disimpan sebagai data (YAML/JSON) berversi agar bisa ditambah tanpa ubah kode. Daftar ini adalah set awal dan harus ditinjau praktisi trade finance sebelum pilot.

**Aturan dokumen (set awal)**

| ID | Aturan | Tingkat | Berlaku |
| --- | --- | --- | --- |
| D01 | Nama eksportir/beneficiary sama di semua dokumen (pencocokan setelah normalisasi PT, Tbk, tanda baca) | ERROR | Semua |
| D02 | Nama dan alamat pembeli/consignee konsisten antar dokumen dan dengan L/C/kontrak | ERROR | Semua |
| D03 | Deskripsi barang di invoice sesuai L/C; dokumen lain boleh lebih umum tetapi tidak bertentangan | ERROR | L/C |
| D04 | Berat bersih dan kotor konsisten invoice, packing list, B/L, PEB (toleransi dapat diatur) | ERROR | Semua |
| D05 | Jumlah kemasan (karung) konsisten packing list dan B/L | ERROR | Semua |
| D06 | Nomor kontainer dan segel konsisten B/L dan packing list | ERROR | Semua |
| D07 | HS code konsisten dan termasuk 0901 | ERROR | Semua |
| D08 | Pelabuhan muat dan bongkar sesuai L/C/kontrak | ERROR | Semua |
| D09 | Tanggal B/L tidak melewati batas pengapalan terakhir pada L/C | ERROR | L/C |
| D10 | Tanggal presentasi ≤ 21 hari setelah tanggal pengapalan dan dalam masa berlaku L/C, kecuali L/C menyatakan lain | ERROR | L/C |
| D11 | Nilai invoice tidak melebihi nilai L/C; mata uang sama | ERROR | L/C |
| D12 | Incoterm dan nomor L/C/kontrak tercantum sesuai | WARNING | Semua |
| D13 | Tanggal sertifikat fitosanitari dan SKA/COO wajar terhadap tanggal pengapalan (aturan dapat diatur) | WARNING | Semua |
| D14 | Dokumen yang disyaratkan L/C/kontrak semuanya ada | ERROR | Semua |
| D15 | Berat pengiriman ≤ total berat lot yang ditautkan | ERROR | Semua |

**Aturan risiko kebun (default, dapat diatur)**

| ID | Aturan | Hasil |
| --- | --- | --- |
| R01 | Tutupan hutan 2020 di dalam kebun < 5% | LOLOS |
| R02 | Tutupan hutan 2020 5–20%, atau beririsan dengan kawasan hutan | PERLU VERIFIKASI |
| R03 | Tutupan hutan 2020 > 20% | BERISIKO |
| R04 | Luas dinyatakan > 4 ha tanpa poligon | ERROR, tidak bisa dicek |
| R05 | Tidak ada bukti legalitas | PERLU VERIFIKASI |

**Isi paket bukti EUDR per pengiriman**

- Deskripsi produk, HS code, dan kuantitas (berat bersih).
- Negara produksi.
- Geolokasi semua kebun asal (titik atau poligon, 6 desimal) dalam GeoJSON.
- Rentang tanggal panen/pembelian.
- Nama dan alamat eksportir serta pembeli.
- Ringkasan hasil cek risiko per kebun, versi dataset, dan keputusan verifikasi.
- Daftar bukti legalitas lahan per kebun.
- Ringkasan validasi dokumen ekspor (tanpa temuan ERROR terbuka).
- Hash SHA-256, versi paket, tanggal pembuatan.

## Arsitektur dan tech stack

Satu backend Python melayani web, mobile, dan halaman importir; ekstraksi, validasi, cek risiko, dan pembuatan paket berjalan sebagai job async agar API tetap cepat.

&#91;embedded content: arsitektur MVP KopiPass\]

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Backend | Python 3.12, FastAPI, SQLAlchemy, Alembic | Ekosistem geospasial dan dokumen paling lengkap di Python |
| Database | PostgreSQL 16 + PostGIS | Query spasial (luas, irisan, overlay) langsung di database |
| Job async | Celery + Redis | Ekstraksi dan cek risiko bisa butuh puluhan detik |
| Storage | S3-compatible (MinIO lokal) | Foto, dokumen, dan paket bukti |
| Geospasial | Shapely, rasterio, GeoPandas | Validasi poligon dan overlay raster tutupan hutan |
| Dokumen | pdfplumber/PyMuPDF untuk PDF teks, OCR untuk hasil scan, LLM dengan output JSON skema | Ekstraksi field; keputusan tetap di mesin aturan |
| PDF output | WeasyPrint (HTML ke PDF) | Laporan temuan dan paket bukti |
| Web | Next.js + TypeScript, MapLibre GL | Dashboard dan peta |
| Mobile | React Native (Expo) + SQLite + expo-location | Offline-first, satu bahasa dengan web |
| Infrastruktur | Docker Compose untuk dev; satu VM + managed Postgres untuk pilot | Sederhana untuk tim kecil |

Pilihan ini default; Claude Code boleh mengusulkan alternatif dengan alasan sebelum mengganti.

## API endpoint

REST JSON di bawah `/api/v1`, autentikasi JWT; semua endpoint otomatis dibatasi ke organisasi pengguna. Spesifikasi lengkap di-generate sebagai OpenAPI dari kode.

| Method | Path | Fungsi |
| --- | --- | --- |
| POST | /auth/login, /auth/invite, /auth/accept | Login dan undangan pengguna |
| GET/POST | /farmers | Daftar dan buat petani |
| GET/PATCH | /farmers/{id} | Detail dan ubah petani |
| GET/POST | /plots | Daftar dan buat kebun (GeoJSON) |
| GET/PATCH | /plots/{id} | Detail dan ubah kebun; perubahan geometri memicu cek risiko |
| POST | /plots/{id}/evidence | Unggah bukti legalitas |
| GET | /plots/{id}/risk-checks | Riwayat cek risiko |
| POST | /plots/{id}/risk-checks/{rid}/decision | Keputusan verifikasi |
| POST | /sync | Sinkronisasi batch dari mobile (idempoten dengan client\_id) |
| GET/POST | /purchases, /lots | Pembelian dan lot |
| POST | /lots/{id}/lock | Kunci lot |
| GET/POST | /shipments | Daftar dan buat pengiriman |
| POST | /shipments/{id}/lots | Tautkan lot |
| POST | /shipments/{id}/documents | Unggah dokumen (multipart) |
| GET/PATCH | /documents/{id}/fields | Lihat dan koreksi field hasil ekstraksi |
| POST | /shipments/{id}/validate | Jalankan validasi (async, kembalikan job\_id) |
| GET | /shipments/{id}/findings | Daftar temuan |
| PATCH | /findings/{id} | Ubah status temuan |
| POST | /shipments/{id}/evidence-packs | Generate paket bukti (async) |
| POST | /evidence-packs/{id}/share-links | Buat tautan berbagi |
| GET | /public/packs/{token} | Akses importir tanpa login |
| GET | /jobs/{id} | Status job async |

## Kebutuhan non-fungsional

| ID | Kategori | Kebutuhan |
| --- | --- | --- |
| N1 | Offline | Mobile berfungsi penuh tanpa internet; sinkron idempoten, tidak ada duplikasi saat dikirim ulang |
| N2 | Perangkat | Android 10+, RAM 3 GB; APK < 60 MB |
| N3 | Kinerja | Ekstraksi + validasi satu set 7 dokumen < 3 menit; halaman web < 2 detik |
| N4 | Keamanan | HTTPS, enkripsi data saat disimpan, password di-hash (argon2/bcrypt), token tautan berbagi disimpan sebagai hash |
| N5 | Isolasi tenant | Setiap query wajib filter org\_id; tes otomatis memastikan tidak ada kebocoran antar organisasi |
| N6 | Privasi | Persetujuan petani tercatat; data dibagikan ke importir hanya lewat paket yang disetujui admin (UU No. 27/2022 tentang PDP) |
| N7 | Keterlacakan | Paket bukti dan cek risiko menyimpan versi dataset dan versi aturan yang dipakai |
| N8 | Retensi | Data dan paket bukti disimpan minimal 5 tahun |
| N9 | Biaya LLM | Ekstraksi memakai output terstruktur; cache per hash file agar dokumen yang sama tidak diproses ulang |
| N10 | Kualitas kode | Tes unit untuk setiap aturan D01–D15 dan R01–R05; CI menjalankan lint, tipe, dan tes |

## Urutan build untuk Claude Code

Bangun per milestone; setiap milestone harus lulus tes dan bisa didemokan sebelum lanjut. Berikan BRD ini ke Claude Code, lalu minta satu milestone per sesi.

1. **M0 — Fondasi.** Monorepo, Docker Compose (Postgres+PostGIS, Redis, MinIO), FastAPI dengan migrasi Alembic, Next.js, CI, model `organization`, `user`, `audit_log`, autentikasi F1.
2. **M1 — Validator dokumen (nilai tercepat, tanpa lapangan).** Model `shipment`, `document`, `extracted_field`, `finding`; unggah dokumen; ekstraksi dengan OCR + LLM ke skema JSON; mesin aturan D01–D14 dari file YAML; halaman temuan dan laporan PDF. Siapkan 5 set dokumen contoh sintetis sebagai fixture tes.
3. **M2 — Petani dan kebun via web.** Model `farmer`, `plot`, `legality_evidence`; input GeoJSON/unggah KML; peta di web.
4. **M3 — Cek risiko.** Loader dataset tutupan hutan 2020 untuk area pilot, job `risk_check` (R01–R05), alur verifikasi F3.4.
5. **M4 — Aplikasi mobile offline.** Expo + SQLite, registrasi petani, titik dan poligon GPS, foto, antrean sinkron ke `/sync`.
6. **M5 — Pembelian, lot, dan tautan ke pengiriman.** F4 dan aturan D15.
7. **M6 — Paket bukti dan tautan berbagi.** F6: PDF, GeoJSON, JSON, hash, halaman publik importir.
8. **M7 — Pengerasan pilot.** Tes isolasi tenant, pemantauan error, backup, panduan pengguna singkat.

**Contoh prompt untuk Claude Code**

```
Baca docs/BRD-KopiPass.md. Kerjakan milestone M1 saja.
Ikuti model data, API, dan aturan D01–D14 di BRD.
Tulis tes untuk setiap aturan sebelum implementasinya.
Tanyakan dulu bila ada keputusan yang tidak tercakup BRD.
```

## Asumsi dan pertanyaan terbuka

**Asumsi**

- Importir UE menerima paket bukti dalam format PDF + GeoJSON; format pasti dikonfirmasi dengan importir pilot.
- Petugas lapangan memakai HP Android milik sendiri atau milik eksportir.
- Dataset tutupan hutan 2020 yang dipakai adalah peta referensi terbuka yang diakui untuk EUDR; versi pasti dikonfirmasi saat M3.

**Pertanyaan terbuka**

- [ ] Dataset batas kawasan hutan apa yang tersedia secara legal untuk dipakai (F3.3)?
- [ ] Ambang R01–R03 perlu ditinjau ahli kepatuhan EUDR atau mengikuti permintaan importir?
- [ ] Daftar aturan D01–D15 perlu ditinjau praktisi trade finance; adakah aturan khas kopi (sertifikat ICO, cupping, organik) yang wajib masuk?
- [ ] Penyedia LLM dan OCR mana yang dipakai, dan apakah dokumen boleh diproses di luar Indonesia?
- [ ] Apakah forwarder masuk MVP atau setelah pilot?
- [ ] Jadwal EUDR bisa berubah lagi; siapa yang memantau dan memperbarui aturan?

## Sumber

1. [European Commission – Delay until December 2026 and other developments in the implementation of the EUDR](https://trade.ec.europa.eu/access-to-markets/en/news/delay-until-december-2026-and-other-developments-implementation-eudr-regulation)
2. [ERIA – Navigating the EUDR: challenges and opportunities for Indonesia's trade](https://www.eria.org/uploads/1781507909-policy-brief-tradepag-navigating-the-european-union-deforestation-regulation-eudr-challenges-and-opportunities-for-indonesias-trade-english-version.pdf/)
3. [Trade Finance Global – Presentation of documents](https://www.tradefinanceglobal.com/letters-of-credit/presentation-of-documents/)
4. [Antara – Ekspor kopi Indonesia semester I 2025](https://jogja.antaranews.com/berita/774081/indonesia-ekspor-2067-ribu-ton-kopi-di-semester-pertama-2025)
