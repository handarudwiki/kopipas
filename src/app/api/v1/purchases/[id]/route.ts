import { route } from "@/lib/api";
import { deletePurchase } from "@/server/lots";

export const DELETE = route<{ id: string }>("purchase:write", async ({ ctx, params }) => {
  await deletePurchase(ctx, params.id);
  return { ok: true };
});
