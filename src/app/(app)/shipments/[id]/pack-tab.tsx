import type { Ctx } from "@/lib/context";
import type { getShipmentDetail } from "@/server/shipments";
import { Empty, TableCard } from "@/components/ui";

type Shipment = Awaited<ReturnType<typeof getShipmentDetail>>;

/** Evidence pack tab (M6). */
export async function PackTab({ s, ctx }: { s: Shipment; ctx: Ctx }) {
  void s;
  void ctx;
  return <TableCard><Empty title="Paket bukti" hint="Tersedia setelah modul paket bukti aktif." /></TableCard>;
}
