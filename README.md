# KopiPass

Paket bukti EUDR dan validator dokumen ekspor untuk eksportir kopi skala kecil-menengah.
Spesifikasi lengkap: [`docs/BRD-KopiPass.md`](docs/BRD-KopiPass.md).

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind v4) · Prisma 7 · PostgreSQL.

## Menjalankan lokal

```bash
cp .env.example .env            # isi DATABASE_URL, TEST_DATABASE_URL, AUTH_SECRET
npm install
npm run db:migrate              # terapkan migrasi
npm run db:seed                 # organisasi + pengguna contoh
npm run dev
```

Akun contoh (password `kopipass123`):

| Email | Peran |
| --- | --- |
| admin@kopinusantara.co.id | Admin eksportir |
| dokumen@kopinusantara.co.id | Staf dokumen |
| lapangan@kopinusantara.co.id | Petugas lapangan |
| super@kopipass.id | Super admin KopiPass |

## Tes

```bash
npm test          # vitest, memakai TEST_DATABASE_URL
npm run lint && npm run typecheck
```
