import { route } from "@/lib/api";
import { findingsReportPdf } from "@/server/report";
import { getShipmentOr404 } from "@/server/shipments";

export const GET = route<{ id: string }>("shipment:read", async ({ ctx, params }) => {
  const s = await getShipmentOr404(ctx, params.id);
  const pdf = await findingsReportPdf(ctx, params.id);
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="findings-${s.reference.replace(/[^\w.-]/g, "_")}.pdf"`,
    },
  });
});
