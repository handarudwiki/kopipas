import type { Role } from "@/generated/prisma/enums";

/**
 * Role → permission matrix (BRD "Pengguna dan peran", F1.2).
 * Admin eksportir sees all org data and approves evidence packs.
 */
export const PERMISSIONS = {
  "org:manage": ["ADMIN"],
  "user:manage": ["ADMIN"],
  "audit:read": ["ADMIN", "SUPER_ADMIN"],
  "settings:manage": ["ADMIN"],

  "farmer:read": ["ADMIN", "DOC_STAFF", "FIELD_OFFICER"],
  "farmer:write": ["ADMIN", "FIELD_OFFICER"],
  "plot:read": ["ADMIN", "DOC_STAFF", "FIELD_OFFICER"],
  "plot:write": ["ADMIN", "FIELD_OFFICER"],
  "risk:decide": ["ADMIN"],
  "sync": ["ADMIN", "FIELD_OFFICER"],

  "purchase:read": ["ADMIN", "DOC_STAFF", "FIELD_OFFICER"],
  "purchase:write": ["ADMIN", "FIELD_OFFICER"],
  "lot:read": ["ADMIN", "DOC_STAFF", "FIELD_OFFICER"],
  "lot:write": ["ADMIN", "DOC_STAFF"],

  "shipment:read": ["ADMIN", "DOC_STAFF", "FORWARDER"],
  "shipment:write": ["ADMIN", "DOC_STAFF", "FORWARDER"],
  "finding:update": ["ADMIN", "DOC_STAFF", "FORWARDER"],

  "pack:read": ["ADMIN", "DOC_STAFF"],
  "pack:generate": ["ADMIN"],
  "share:manage": ["ADMIN"],

  "tenant:manage": ["SUPER_ADMIN"],
  "dataset:manage": ["SUPER_ADMIN"],
  "rules:read": ["SUPER_ADMIN", "ADMIN", "DOC_STAFF"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, perm: Permission): boolean {
  return (PERMISSIONS[perm] as readonly Role[]).includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin KopiPass",
  ADMIN: "Admin Eksportir",
  DOC_STAFF: "Staf Dokumen",
  FIELD_OFFICER: "Petugas Lapangan",
  FORWARDER: "Forwarder",
};
