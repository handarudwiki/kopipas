import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { currentActor } from "./context";

/**
 * Models whose writes are NOT audited (they are logs/ledgers themselves, or high-churn system rows).
 */
const UNAUDITED = new Set(["AuditLog", "Job", "SyncReceipt"]);

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Secrets never land in the audit log. */
const REDACTED_KEYS = new Set(["passwordHash", "inviteTokenHash", "tokenHash", "rawText"]);

function toJson(v: unknown): unknown {
  if (v === undefined) return null;
  return JSON.parse(
    JSON.stringify(v, (k, val) => (REDACTED_KEYS.has(k) && val != null ? "[redacted]" : val)),
  );
}

function makeClient() {
  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  type Delegate = {
    findUnique: (a: unknown) => Promise<unknown>;
    findMany: (a: unknown) => Promise<unknown[]>;
  };
  const delegate = (model: string) =>
    (base as unknown as Record<string, Delegate>)[lowerFirst(model)];

  async function write(
    model: string,
    action: string,
    entityId: string | null,
    before: unknown,
    after: unknown,
    orgHint?: string | null,
  ) {
    const actor = currentActor();
    const rec = (after ?? before) as Record<string, unknown> | null;
    const orgId =
      (rec && typeof rec.orgId === "string" ? rec.orgId : null) ??
      (model === "Organization" && rec ? (rec.id as string) : null) ??
      orgHint ??
      actor?.orgId ??
      null;
    await base.auditLog.create({
      data: {
        orgId,
        entity: lowerFirst(model),
        entityId,
        action,
        actorId: actor?.actorId ?? null,
        before: before == null ? undefined : (toJson(before) as object),
        after: after == null ? undefined : (toJson(after) as object),
      },
    });
  }

  // F1.3 — every create/update/delete stores who, when, old value and new value.
  return base.$extends({
    name: "audit-log",
    query: {
      $allModels: {
        async create({ model, args, query }) {
          const result = (await query(args)) as Record<string, unknown>;
          if (!UNAUDITED.has(model)) await write(model, "CREATE", String(result.id ?? ""), null, result);
          return result;
        },
        async update({ model, args, query }) {
          if (UNAUDITED.has(model)) return query(args);
          const before = await delegate(model).findUnique({ where: args.where });
          const result = (await query(args)) as Record<string, unknown>;
          await write(model, "UPDATE", String(result.id ?? ""), before, result);
          return result;
        },
        async upsert({ model, args, query }) {
          if (UNAUDITED.has(model)) return query(args);
          const before = await delegate(model).findUnique({ where: args.where });
          const result = (await query(args)) as Record<string, unknown>;
          await write(model, before ? "UPDATE" : "CREATE", String(result.id ?? ""), before, result);
          return result;
        },
        async delete({ model, args, query }) {
          if (UNAUDITED.has(model)) return query(args);
          const result = (await query(args)) as Record<string, unknown>;
          await write(model, "DELETE", String(result.id ?? ""), result, null);
          return result;
        },
        async updateMany({ model, args, query }) {
          if (UNAUDITED.has(model)) return query(args);
          const before = (await delegate(model).findMany({ where: args.where })) as Record<string, unknown>[];
          const result = await query(args);
          const after = (await delegate(model).findMany({
            where: { id: { in: before.map((b) => b.id) } },
          })) as Record<string, unknown>[];
          for (const b of before) {
            const a = after.find((x) => x.id === b.id) ?? null;
            await write(model, "UPDATE", String(b.id ?? ""), b, a);
          }
          return result;
        },
        async deleteMany({ model, args, query }) {
          if (UNAUDITED.has(model)) return query(args);
          const before = (await delegate(model).findMany({ where: args.where })) as Record<string, unknown>[];
          const result = await query(args);
          for (const b of before) await write(model, "DELETE", String(b.id ?? b.lotId ?? ""), b, null);
          return result;
        },
        async createMany({ model, args, query }) {
          const result = await query(args);
          if (!UNAUDITED.has(model)) {
            const rows = Array.isArray(args.data) ? args.data : [args.data];
            for (const r of rows) await write(model, "CREATE", null, null, r);
          }
          return result;
        },
      },
    },
  });
}

export type DB = ReturnType<typeof makeClient>;

const g = globalThis as unknown as { __kopipassPrisma?: DB };
export const prisma: DB = g.__kopipassPrisma ?? makeClient();
if (process.env.NODE_ENV !== "production") g.__kopipassPrisma = prisma;
