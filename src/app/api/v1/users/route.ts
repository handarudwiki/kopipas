import { route } from "@/lib/api";
import { listUsers } from "@/server/org";

export const GET = route("user:manage", async ({ ctx }) => ({ items: await listUsers(ctx) }));
