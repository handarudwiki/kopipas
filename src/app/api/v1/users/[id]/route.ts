import { route } from "@/lib/api";
import { updateUser } from "@/server/org";

export const PATCH = route<{ id: string }>("user:manage", async ({ req, ctx, params }) =>
  updateUser(ctx, params.id, await req.json()),
);
