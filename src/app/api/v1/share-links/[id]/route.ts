import { route } from "@/lib/api";
import { revokeShareLink } from "@/server/packs";

/** Revoke a share link (admin). */
export const DELETE = route<{ id: string }>("share:manage", async ({ ctx, params }) => revokeShareLink(ctx, params.id));
