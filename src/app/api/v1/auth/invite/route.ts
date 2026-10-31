import { route } from "@/lib/api";
import { inviteUser } from "@/server/auth";

export const POST = route("user:manage", async ({ req, ctx }) => inviteUser(ctx, await req.json()));
