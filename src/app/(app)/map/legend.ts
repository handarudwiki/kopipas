import { RISK_COLORS } from "@/lib/risk-colors";

export const RISK_LEGEND: [string, string][] = [
  ["Lolos", RISK_COLORS.PASS!],
  ["Perlu verifikasi", RISK_COLORS.REVIEW!],
  ["Berisiko", RISK_COLORS.RISK!],
  ["Tidak bisa dicek", RISK_COLORS.ERROR!],
  ["Menunggu", RISK_COLORS.PENDING!],
  ["Hutan 2020", "#16a34a99"],
];
