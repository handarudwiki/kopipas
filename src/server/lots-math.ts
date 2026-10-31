import type { ProductForm } from "@/generated/prisma/enums";
import type { OrgSettings } from "@/lib/settings";

/** F4.3 — convert a weight between product forms via green-bean equivalents. */
export function toGreenKg(kg: number, form: ProductForm, conv: OrgSettings["conversion"]): number {
  return kg * conv[form];
}

export function convertKg(kg: number, from: ProductForm, to: ProductForm, conv: OrgSettings["conversion"]): number {
  return toGreenKg(kg, from, conv) / conv[to];
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
