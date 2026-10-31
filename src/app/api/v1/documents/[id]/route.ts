import { z } from "zod";
import { route } from "@/lib/api";
import { deleteDocument, setDocumentType } from "@/server/documents";

type P = { id: string };
export const PATCH = route<P>("shipment:write", async ({ req, ctx, params }) => {
  const { type } = z.object({ type: z.string() }).parse(await req.json());
  return setDocumentType(ctx, params.id, type);
});
export const DELETE = route<P>("shipment:write", async ({ ctx, params }) => {
  await deleteDocument(ctx, params.id);
  return { ok: true };
});
