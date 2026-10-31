import { route } from "@/lib/api";
import { correctFields, getDocumentFields } from "@/server/documents";

type P = { id: string };
export const GET = route<P>("shipment:read", async ({ ctx, params }) => getDocumentFields(ctx, params.id));
export const PATCH = route<P>("shipment:write", async ({ req, ctx, params }) => correctFields(ctx, params.id, await req.json()));
