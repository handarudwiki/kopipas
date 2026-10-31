import { route } from "@/lib/api";
import { readDocumentFile } from "@/server/documents";

export const GET = route<{ id: string }>("shipment:read", async ({ ctx, params }) => {
  const { doc, data } = await readDocumentFile(ctx, params.id);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": doc.mimeType,
      "content-disposition": `inline; filename="${doc.fileName.replace(/[^\w.-]/g, "_")}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=300",
    },
  });
});
