# KopiPass

EUDR evidence packs and export-document validation for small and mid-size Indonesian coffee exporters.
Spec: [`docs/BRD-KopiPass.md`](docs/BRD-KopiPass.md) · User guide (ID): [`docs/PANDUAN.md`](docs/PANDUAN.md)

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind v4) · Prisma 7 · PostgreSQL · MapLibre GL · Turf · pdf-lib · Vitest

## Quick start

```bash
cp .env.example .env              # DATABASE_URL, TEST_DATABASE_URL, AUTH_SECRET (openssl rand -hex 32)
docker compose up -d db           # optional: Postgres on :5433 (or use your own Postgres 15+)
npm install                       # also generates the Prisma client + copies the MapLibre worker
npm run db:migrate
npm run db:seed                   # demo tenant, farmers, plots, lots, 3 shipments, evidence pack + importer link
npm run dev
```

Demo users (password `kopipass123`): `admin@kopinusantara.co.id` (admin), `dokumen@…` (document staff),
`lapangan@…` (field officer → opens `/field`), `forwarder@…`, `super@kopipass.id` (super admin).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm test` | Vitest against `TEST_DATABASE_URL` (migrations applied automatically, non-destructive) |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` (CI runs all three) |
| `npm run db:reset` | Drop, re-migrate and re-seed the dev database |
| `npm run dataset:load -- --kind FOREST_COVER_2020 --version … --name … --file x.geojson` | Load/activate a reference layer |
| `npm run dataset:demo` | Load the synthetic demo forest layers |
| `npm run fixtures:pdf` | Write the 5 synthetic document sets as PDFs to `tests/fixtures/pdf/` |
| `scripts/backup.sh` / `scripts/restore.sh` | `pg_dump` + storage archive with 30-day / 60-month retention |

## What is implemented (BRD milestones)

| Milestone | Where |
| --- | --- |
| **M0** auth, roles, audit (F1) | `src/lib/auth`, `src/lib/db.ts` (Prisma extension audits every write), `src/server/auth.ts` |
| **M1** document validator (F5) | `src/lib/docs` (detect, extract, parse), `rules/document-rules.yaml`, `src/lib/rules`, `src/server/{shipments,documents,report}.ts` |
| **M2** farmers & plots (F2) | `src/lib/geo`, `src/server/farmers.ts`, MapLibre components in `src/components/map.tsx` |
| **M3** risk check (F3) | `src/lib/geo/risk.ts` (R01–R05), `src/server/risk.ts`, `data/reference/*.demo.geojson` |
| **M4** offline field app (F2.6–F2.7) | `/field` PWA: `src/app/field`, `src/lib/field`, `public/sw.js`, `POST /api/v1/sync` |
| **M5** purchases & lots (F4, D15) | `src/server/lots.ts` |
| **M6** evidence pack & sharing (F6) | `src/server/packs.ts`, public page `src/app/p/[token]` |
| **M7** hardening | tenant-isolation tests, `/api/health`, `src/instrumentation.ts` + `src/lib/monitoring.ts`, backups, guide |

REST API lives under `/api/v1` (cookie session for the web, `Authorization: Bearer <jwt>` for API clients; `POST /api/v1/auth/login` returns the token). Every query is scoped by `orgId`.

## Deviations from the BRD's default stack (and why)

The BRD allows proposing alternatives; these were chosen to deliver the whole MVP as one Next.js + Prisma + PostgreSQL codebase:

| BRD default | Here | Notes |
| --- | --- | --- |
| FastAPI + SQLAlchemy + Alembic | Next.js route handlers + Prisma migrations | Same endpoints under `/api/v1` |
| PostGIS geometry | GeoJSON columns + Turf.js (area, union, intersection) | `docker-compose.yml` uses the PostGIS image so spatial SQL can be adopted later |
| Celery + Redis | `job` table + in-process runner (`src/lib/jobs.ts`), poll `GET /api/v1/jobs/{id}` | Fine for pilot volumes; swap for a queue when scaling out |
| S3 / MinIO | Local filesystem `STORAGE_DIR` (`src/lib/storage.ts`) | Keys are org-prefixed; adapter is one file |
| OCR + LLM extraction | Deterministic label extractor on PDF text with page + bbox | Scans/images are flagged for manual entry. LLM/OCR provider and data residency are open BRD questions — plug in behind the `Extractor` interface |
| WeasyPrint | pdf-lib | |
| Expo app (Android) | Offline-first PWA at `/field` (IndexedDB queue, service worker, offline tiles) | Same `/sync` contract an Expo app would use |

## Things to confirm before the pilot

- **Reference data:** the bundled forest layers are **synthetic demo data**. Load an accepted forest-cover-2020 layer (e.g. vectorised JRC GFC2020) and forest-area boundaries for the pilot regencies via *Super Admin → Dataset Referensi*.
- **Rules:** D01–D15 thresholds and R01–R05 defaults need review by trade-finance / EUDR practitioners (BRD open questions).
- **Email:** invites and share links are shown in the UI for copying; no email provider is wired.
- **Production:** set `AUTH_SECRET`, `APP_URL`, `ERROR_WEBHOOK_URL` (optional), serve over HTTPS, use encrypted disks for Postgres and `STORAGE_DIR` (N4), and schedule `scripts/backup.sh`.
