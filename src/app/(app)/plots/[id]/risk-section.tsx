import type { Ctx } from "@/lib/context";
import type { getPlot } from "@/server/farmers";
import { Card, Empty } from "@/components/ui";

type Plot = Awaited<ReturnType<typeof getPlot>>;

/** Risk check history + verification (filled in by M3). */
export function RiskSection({ plot, ctx }: { plot: Plot; ctx: Ctx }) {
  void ctx;
  return (
    <Card title="Cek risiko deforestasi">
      {plot.riskChecks.length === 0 && <Empty title="Belum ada cek risiko" />}
    </Card>
  );
}
