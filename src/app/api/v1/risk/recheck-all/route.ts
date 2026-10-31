import { route } from "@/lib/api";
import { recheckAll } from "@/server/risk";

export const POST = route("settings:manage", async ({ ctx }) => recheckAll(ctx));
