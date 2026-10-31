import type { Ctx } from "@/lib/context";
import type { getShipmentDetail } from "@/server/shipments";

type Shipment = Awaited<ReturnType<typeof getShipmentDetail>>;

/** Tabs added by later milestones (lots, evidence pack). */
export function extraTabs(s: Shipment): { key: string; href: string; label: string; count?: number }[] {
  void s;
  return [];
}

export function ShipmentExtraTabs({ tab, shipment, ctx }: { tab: string; shipment: Shipment; ctx: Ctx }) {
  void tab;
  void shipment;
  void ctx;
  return null;
}
