/**
 * Demo seed: one platform org (super admin) and one pilot exporter with farmers, mapped plots in
 * Dairi (North Sumatra), risk checks against the synthetic demo forest layer, purchases, a locked
 * lot, and three shipments (READY with evidence pack + share link, CHECKING, DRAFT).
 * All names, companies and numbers are fictitious.
 *
 *   npm run db:seed            (idempotent: demo data is created once)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import type { Polygon } from "geojson";
import { prisma } from "../src/lib/db";
import { runAsActor, type Ctx } from "../src/lib/context";
import { hashPassword } from "../src/lib/crypto";
import { setJobMode } from "../src/lib/jobs";
import "../src/server/register";
import { uploadDocument } from "../src/server/documents";
import { addEvidence, createFarmer, createPlot } from "../src/server/farmers";
import { createLot, createPurchase, linkLots, lockLot } from "../src/server/lots";
import { createShareLink, generatePack } from "../src/server/packs";
import { activateDataset, decideRiskCheck, validateFeatureCollection } from "../src/server/risk";
import { createShipment, runValidation } from "../src/server/shipments";
import { FIXTURE_SETS } from "../tests/fixtures/doc-sets";
import { renderFixturePdf } from "../tests/fixtures/render-pdf";

setJobMode("inline");
const PASSWORD = process.env.SEED_PASSWORD ?? "kopipass123";
type R = "SUPER_ADMIN" | "ADMIN" | "DOC_STAFF" | "FIELD_OFFICER" | "FORWARDER";

// 1×1 PNG used as a stand-in photo for legality evidence
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhgHAtGkU0gAAAABJRU5ErkJggg==", "base64");
const photo = (name: string) => new File([PNG], name, { type: "image/png" });

/** Irregular quadrilateral around a centre, roughly `d` degrees across. */
function quad(lon: number, lat: number, d: number): Polygon {
  const h = d / 2;
  return { type: "Polygon", coordinates: [[[lon - h, lat - h * 0.9], [lon + h * 1.1, lat - h], [lon + h, lat + h * 0.8], [lon - h * 0.95, lat + h], [lon - h, lat - h * 0.9]]] };
}

async function user(orgId: string, email: string, name: string, role: R, passwordHash: string) {
  return prisma.user.upsert({ where: { email }, update: {}, create: { orgId, email, name, role, passwordHash } });
}

async function ensureDataset(kind: string, version: string, name: string, file: string) {
  const existing = await prisma.referenceDataset.findFirst({ where: { kind, version } });
  if (existing) return existing;
  const ds = await prisma.referenceDataset.create({
    data: { kind, version, name, source: "Synthetic demo layer — replace with JRC GFC2020 / KLHK data for the pilot", geojson: validateFeatureCollection(JSON.parse(readFileSync(file, "utf8"))) as unknown as object, isActive: false },
  });
  await activateDataset({ userId: "", orgId: "", role: "SUPER_ADMIN", name: "seed", email: "" }, ds.id);
  return ds;
}

async function main() {
  const passwordHash = await hashPassword(PASSWORD);
  const platform = (await prisma.organization.findFirst({ where: { name: "KopiPass Platform" } })) ?? (await prisma.organization.create({ data: { name: "KopiPass Platform", country: "ID" } }));
  await user(platform.id, "super@kopipass.id", "Super Admin", "SUPER_ADMIN", passwordHash);

  const org =
    (await prisma.organization.findFirst({ where: { name: "PT Kopi Nusantara Ekspor" } })) ??
    (await prisma.organization.create({ data: { name: "PT Kopi Nusantara Ekspor", npwp: "01.234.567.8-912.000", address: "Jl. Gatot Subroto No. 21, Medan 20112, Indonesia", country: "ID" } }));
  const admin = await user(org.id, "admin@kopinusantara.co.id", "Rina Hasibuan", "ADMIN", passwordHash);
  await user(org.id, "dokumen@kopinusantara.co.id", "Budi Santoso", "DOC_STAFF", passwordHash);
  const field = await user(org.id, "lapangan@kopinusantara.co.id", "Agus Ginting", "FIELD_OFFICER", passwordHash);
  await user(org.id, "forwarder@kopinusantara.co.id", "Siska Forwarding", "FORWARDER", passwordHash);

  await ensureDataset("FOREST_COVER_2020", "demo-2026.10", "DEMO tutupan hutan 2020 (sintetis)", "data/reference/forest-cover-2020.demo.geojson");
  await ensureDataset("FOREST_AREA", "demo-2026.10", "DEMO kawasan hutan (sintetis)", "data/reference/forest-area.demo.geojson");

  if (await prisma.shipment.findFirst({ where: { orgId: org.id, reference: "SHP-2026-001" } })) {
    console.log("Demo data already present — skipping. (npm run db:reset for a clean database)");
    return;
  }

  const adminCtx: Ctx = { userId: admin.id, orgId: org.id, role: "ADMIN", name: admin.name, email: admin.email };
  const fieldCtx: Ctx = { userId: field.id, orgId: org.id, role: "FIELD_OFFICER", name: field.name, email: field.email };
  const asUser = <T>(c: Ctx, fn: () => Promise<T>) => runAsActor({ orgId: c.orgId, actorId: c.userId }, fn);

  // ---- farmers + plots (Dairi, North Sumatra)
  const farmers = [
    { fullName: "Tigor Sinaga", village: "Lae Pondom", district: "Sidikalang", lon: 98.3062, lat: 2.7303 },
    { fullName: "Rugun Simanjuntak", village: "Bangun", district: "Parbuluan", lon: 98.2814, lat: 2.7515 },
    { fullName: "Jonner Purba", village: "Sitinjo", district: "Sitinjo", lon: 98.2655, lat: 2.7088 },
    { fullName: "Rosmawati Tumanggor", village: "Kuta Gugung", district: "Sumbul", lon: 98.3851, lat: 2.7801 },
    { fullName: "Batara Sihombing", village: "Pegagan Julu", district: "Sumbul", lon: 98.3992, lat: 2.7932 },
    { fullName: "Lamhot Manik", village: "Bukit Lau", district: "Tigalingga", lon: 98.2950, lat: 2.7880 },
    { fullName: "Sondang Nainggolan", village: "Kentara", district: "Lae Parira", lon: 98.2750, lat: 2.7280 },
    { fullName: "Hotman Lumbantobing", village: "Huta Rakyat", district: "Sidikalang", lon: 98.2900, lat: 2.7150 },
  ];
  const plots: { id: string; idx: number }[] = [];
  for (const [i, f] of farmers.entries()) {
    const farmer = await asUser(fieldCtx, () => createFarmer(fieldCtx, { ...f, regency: "Dairi", province: "Sumatera Utara", phone: `0812${String(60000000 + i * 1371).slice(0, 8)}`, consent: true }));
    const big = i % 3 === 0;
    const plot = await asUser(fieldCtx, () =>
      createPlot(fieldCtx, {
        farmerId: farmer.id, label: `Kebun ${f.village}`,
        declaredAreaHa: big ? 5.2 : 1.1 + (i % 4) * 0.6,
        ...(big ? { polygon: quad(f.lon, f.lat, 0.0021) } : { point: { type: "Point", coordinates: [f.lon, f.lat] }, gpsAccuracyM: 4 + (i % 5) }),
      }),
    );
    const evidence = i === 5 ? { type: "NONE", notes: "Tanah adat, surat keterangan desa sedang diurus" } : { type: i % 2 ? "SKT" : "SHM", documentNumber: `${i % 2 ? "SKT" : "SHM"}/DAIRI/${2010 + i}/${1200 + i * 7}` };
    await asUser(fieldCtx, () => addEvidence(fieldCtx, plot.id, evidence, evidence.type === "NONE" ? [] : [photo(`bukti-${i}.png`)]));
    plots.push({ id: plot.id, idx: i });
  }

  // a plot overlapping the synthetic forest block → RISK; one with a small forest patch → REVIEW
  const forestFarmer = await asUser(fieldCtx, () => createFarmer(fieldCtx, { fullName: "Marulak Situmorang", village: "Pardomuan", district: "Sumbul", regency: "Dairi", province: "Sumatera Utara", consent: true }));
  const riskPlot = await asUser(fieldCtx, () => createPlot(fieldCtx, { farmerId: forestFarmer.id, label: "Kebun Pardomuan (tepi hutan)", declaredAreaHa: 2, polygon: quad(98.3420, 2.7520, 0.0013) }));
  await asUser(fieldCtx, () => addEvidence(fieldCtx, riskPlot.id, { type: "SKT", documentNumber: "SKT/DAIRI/2019/0098" }, [photo("bukti-risk.png")]));
  const reviewPlot = await asUser(fieldCtx, () => createPlot(fieldCtx, { farmerId: forestFarmer.id, label: "Kebun Pardomuan 2", declaredAreaHa: 2, polygon: { type: "Polygon", coordinates: [[[98.3200, 2.7400], [98.3212, 2.7400], [98.3212, 2.7412], [98.3200, 2.7412], [98.3200, 2.7400]]] } }));
  await asUser(fieldCtx, () => addEvidence(fieldCtx, reviewPlot.id, { type: "SHM", documentNumber: "SHM/DAIRI/2015/3321" }, [photo("bukti-review.png")]));

  // ---- purchases + lot (only from plots that passed)
  const passPlots = await prisma.plot.findMany({ where: { orgId: org.id, riskStatus: "PASS" }, include: { farmer: true } });
  const purchaseIds: string[] = [];
  for (const [i, p] of passPlots.entries()) {
    const pu = await asUser(fieldCtx, () => createPurchase(fieldCtx, { farmerId: p.farmerId, plotId: p.id, date: `2026-09-${String(5 + i * 3).padStart(2, "0")}`, weightKg: 4200, form: "GREEN" }));
    purchaseIds.push(pu.id);
    await asUser(fieldCtx, () => createPurchase(fieldCtx, { farmerId: p.farmerId, plotId: p.id, date: `2026-10-${String(2 + i * 2).padStart(2, "0")}`, weightKg: 1800 + i * 150, form: "CHERRY" }));
  }
  const lot = await asUser(adminCtx, () => createLot(adminCtx, { code: "LOT-202610-001", productForm: "GREEN", weightKg: Math.min(20000, purchaseIds.length * 4200), purchaseIds }));
  await asUser(adminCtx, () => lockLot(adminCtx, lot.id));

  // ---- shipments
  const docsFor = async (shipmentId: string, setIdx: number) => {
    for (const d of FIXTURE_SETS[setIdx]!.docs) {
      const bytes = await renderFixturePdf(d);
      await asUser(adminCtx, () => uploadDocument(adminCtx, shipmentId, new File([Buffer.from(bytes)], `${d.type.toLowerCase().replace(/_/g, "-")}.pdf`, { type: "application/pdf" })));
    }
  };
  const base = { buyerName: "Hanseatic Coffee Traders GmbH", buyerAddress: "Am Sandtorkai 48, 20457 Hamburg, Germany", buyerCountry: "DE", portLoading: "Belawan", portDischarge: "Hamburg", hsCode: "0901.11", productDescription: "Indonesian Arabica Green Coffee Beans Grade 1, Sumatra Mandheling" };

  const s1 = await asUser(adminCtx, () => createShipment(adminCtx, { ...base, reference: "SHP-2026-001", paymentMethod: "LC", presentationDate: "2026-11-10" }));
  await docsFor(s1.id, 0);
  await asUser(adminCtx, () => linkLots(adminCtx, s1.id, { lotIds: [lot.id] }));
  await asUser(adminCtx, () => runValidation(org.id, s1.id, admin.id));

  const s2 = await asUser(adminCtx, () => createShipment(adminCtx, { ...base, reference: "SHP-2026-002", paymentMethod: "LC", presentationDate: "2026-11-25" }));
  await docsFor(s2.id, 1);
  await asUser(adminCtx, () => runValidation(org.id, s2.id, admin.id));

  await asUser(adminCtx, () => createShipment(adminCtx, { ...base, reference: "SHP-2026-003", buyerName: "Nordic Roasters AB", buyerAddress: "Hamngatan 12, Stockholm", buyerCountry: "SE", portDischarge: "Gothenburg", paymentMethod: "TT" }));

  // verify the REVIEW plot in the field so its future purchases could be packed too
  const rc = await prisma.riskCheck.findFirst({ where: { plotId: reviewPlot.id }, orderBy: { createdAt: "desc" } });
  if (rc && rc.status === "REVIEW") {
    await asUser(adminCtx, () => decideRiskCheck(adminCtx, reviewPlot.id, rc.id, { decision: "PASS", note: "Kunjungan 28 Okt 2026: petak hutan kecil adalah pohon pelindung kopi (naungan), bukan tutupan hutan alami." }));
  }

  const status = await prisma.shipment.findUniqueOrThrow({ where: { id: s1.id } });
  let shareUrl = "(shipment not READY — no pack)";
  if (status.status === "READY") {
    const pack = await generatePack(org.id, s1.id, admin.id);
    shareUrl = (await asUser(adminCtx, () => createShareLink(adminCtx, pack.packId, { label: "Hanseatic — compliance team" }))).url;
  }
  console.log(`Demo data created.\n  SHP-2026-001: ${status.status}\n  Importer link: ${shareUrl}`);
}

runAsActor({ orgId: null, actorId: null }, main)
  .then(async () => {
    console.log(`Users (password ${PASSWORD}): admin@kopinusantara.co.id, dokumen@…, lapangan@…, forwarder@…, super@kopipass.id`);
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
