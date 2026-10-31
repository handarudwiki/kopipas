import { z } from "zod";

/** Org-configurable settings with BRD defaults (F3.2, F4.3, D04, D13). */
export const orgSettingsSchema = z.object({
  risk: z
    .object({
      /** R01: forest cover < passBelowPct → PASS */
      passBelowPct: z.number().min(0).max(100).default(5),
      /** R03: forest cover > riskAbovePct → RISK */
      riskAbovePct: z.number().min(0).max(100).default(20),
      /** F2.2: reject GPS fixes worse than this */
      maxGpsAccuracyM: z.number().positive().default(15),
      /** F2.4: polygon required above this area */
      polygonRequiredAboveHa: z.number().positive().default(4),
    })
    .default({ passBelowPct: 5, riskAbovePct: 20, maxGpsAccuracyM: 15, polygonRequiredAboveHa: 4 }),
  conversion: z
    .object({
      /** kg green bean per kg of each form (F4.3) */
      CHERRY: z.number().positive().default(0.16),
      PARCHMENT: z.number().positive().default(0.8),
      GREEN: z.number().positive().default(1),
    })
    .default({ CHERRY: 0.16, PARCHMENT: 0.8, GREEN: 1 }),
  validation: z
    .object({
      /** D04 weight tolerance in percent */
      weightTolerancePct: z.number().min(0).max(10).default(0.5),
      /** D10 presentation period */
      presentationDays: z.number().int().positive().default(21),
      /** D13 phyto / COO date window relative to shipment (days before / after) */
      certMaxDaysBefore: z.number().int().min(0).default(30),
      certMaxDaysAfter: z.number().int().min(0).default(7),
    })
    .default({ weightTolerancePct: 0.5, presentationDays: 21, certMaxDaysBefore: 30, certMaxDaysAfter: 7 }),
  share: z
    .object({ defaultExpiryDays: z.number().int().positive().default(90) })
    .default({ defaultExpiryDays: 90 }),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export function parseSettings(raw: unknown): OrgSettings {
  const r = orgSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : orgSettingsSchema.parse({});
}
