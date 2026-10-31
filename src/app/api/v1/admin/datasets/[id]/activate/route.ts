import { route } from "@/lib/api";
import { activateDataset } from "@/server/risk";

export const POST = route<{ id: string }>("dataset:manage", async ({ ctx, params }) => activateDataset(ctx, params.id));
