import "dotenv/config";
import { prisma } from "../src/lib/db";
import { runAsActor } from "../src/lib/context";
import { hashPassword } from "../src/lib/crypto";

const PASSWORD = process.env.SEED_PASSWORD ?? "kopipass123";

async function upsertUser(orgId: string, email: string, name: string, role: "SUPER_ADMIN" | "ADMIN" | "DOC_STAFF" | "FIELD_OFFICER" | "FORWARDER", passwordHash: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { orgId, email, name, role, passwordHash },
  });
}

async function main() {
  const passwordHash = await hashPassword(PASSWORD);

  const platform =
    (await prisma.organization.findFirst({ where: { name: "KopiPass Platform" } })) ??
    (await prisma.organization.create({ data: { name: "KopiPass Platform", country: "ID" } }));
  await upsertUser(platform.id, "super@kopipass.id", "Super Admin", "SUPER_ADMIN", passwordHash);

  const org =
    (await prisma.organization.findFirst({ where: { name: "PT Kopi Nusantara Ekspor" } })) ??
    (await prisma.organization.create({
      data: {
        name: "PT Kopi Nusantara Ekspor",
        npwp: "01.234.567.8-912.000",
        address: "Jl. Gatot Subroto No. 21, Medan, Sumatera Utara 20112, Indonesia",
        country: "ID",
      },
    }));
  const admin = await upsertUser(org.id, "admin@kopinusantara.co.id", "Rina Hasibuan", "ADMIN", passwordHash);
  await upsertUser(org.id, "dokumen@kopinusantara.co.id", "Budi Santoso", "DOC_STAFF", passwordHash);
  await upsertUser(org.id, "lapangan@kopinusantara.co.id", "Agus Ginting", "FIELD_OFFICER", passwordHash);

  console.log(`Seeded orgs + users (password: ${PASSWORD}). Admin id ${admin.id}`);
  return { org, admin };
}

runAsActor({ orgId: null, actorId: null }, main)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
