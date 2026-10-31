import { Pill } from "./ui";

export function ShipmentStatusPill({ status }: { status: "DRAFT" | "CHECKING" | "READY" }) {
  if (status === "READY") return <Pill tone="ok">Siap</Pill>;
  if (status === "CHECKING") return <Pill tone="warn">Perlu perbaikan</Pill>;
  return <Pill tone="neutral">Draf</Pill>;
}

export function SeverityPill({ severity }: { severity: "ERROR" | "WARNING" | "INFO" }) {
  if (severity === "ERROR") return <Pill tone="err">ERROR</Pill>;
  if (severity === "WARNING") return <Pill tone="warn">WARNING</Pill>;
  return <Pill tone="info">INFO</Pill>;
}

export function FindingStatusPill({ status }: { status: "OPEN" | "RESOLVED" | "ACCEPTED" }) {
  if (status === "OPEN") return <Pill tone="danger" dot={false}>Terbuka</Pill>;
  if (status === "ACCEPTED") return <Pill tone="info" dot={false}>Diterima</Pill>;
  return <Pill tone="ok" dot={false}>Selesai</Pill>;
}

export function RiskPill({ status }: { status: "PENDING" | "PASS" | "REVIEW" | "RISK" | "ERROR" }) {
  switch (status) {
    case "PASS": return <Pill tone="ok">LOLOS</Pill>;
    case "REVIEW": return <Pill tone="warn">PERLU VERIFIKASI</Pill>;
    case "RISK": return <Pill tone="err">BERISIKO</Pill>;
    case "ERROR": return <Pill tone="danger">TIDAK BISA DICEK</Pill>;
    default: return <Pill tone="neutral">MENUNGGU</Pill>;
  }
}

export function ExtractionPill({ status }: { status: "PENDING" | "DONE" | "NEEDS_REVIEW" | "FAILED" }) {
  switch (status) {
    case "DONE": return <Pill tone="ok">Terekstrak</Pill>;
    case "NEEDS_REVIEW": return <Pill tone="warn">Isi manual</Pill>;
    case "FAILED": return <Pill tone="err">Gagal</Pill>;
    default: return <Pill tone="info">Memproses…</Pill>;
  }
}

export const PAYMENT_LABEL = { LC: "L/C", TT: "T/T", OTHER: "Lainnya" } as const;
export const FORM_LABEL = { CHERRY: "Ceri", PARCHMENT: "Gabah", GREEN: "Green bean" } as const;
