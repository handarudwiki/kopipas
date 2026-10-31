import { route } from "@/lib/api";
import { deleteEvidence } from "@/server/farmers";

export const DELETE = route<{ id: string }>("plot:write", async ({ ctx, params }) => {
  await deleteEvidence(ctx, params.id);
  return { ok: true };
});
