import { route } from "@/lib/api";
import { fieldSnapshot } from "@/server/sync";

export const GET = route("sync", async ({ ctx }) => fieldSnapshot(ctx));
