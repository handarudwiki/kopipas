import { route } from "@/lib/api";

export const GET = route(null, async ({ ctx }) => ({ user: ctx }));
