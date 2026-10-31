import { route } from "@/lib/api";
import { listAuditLogs } from "@/server/org";

export const GET = route("audit:read", async ({ req, ctx }) => {
  const sp = req.nextUrl.searchParams;
  return listAuditLogs(ctx, {
    entity: sp.get("entity") ?? undefined,
    entityId: sp.get("entityId") ?? undefined,
    action: sp.get("action") ?? undefined,
    cursor: sp.get("cursor") ?? undefined,
    take: sp.get("take") ? Number(sp.get("take")) : undefined,
  });
});
