import type { DocumentType, PaymentMethod, Severity } from "@/generated/prisma/enums";

export type DocFacts = {
  id: string;
  type: DocumentType;
  fileName?: string;
  /** current field values by name */
  fields: Record<string, string | null | undefined>;
};

export type ShipmentFacts = {
  paymentMethod: PaymentMethod;
  /** ISO date the documents are (to be) presented to the bank; defaults to today */
  presentationDate: string;
  docs: DocFacts[];
  /** shipment net weight in kg (from shipment record, else invoice / packing list) */
  shipmentNetWeightKg: number | null;
  lots: { count: number; totalGreenKg: number };
  settings: { weightTolerancePct: number; presentationDays: number; certMaxDaysBefore: number; certMaxDaysAfter: number };
};

export type Ref = { documentId?: string; documentType?: DocumentType; field?: string; value?: string | null };

export type RuleFinding = {
  ruleId: string;
  severity: Severity;
  message: string;
  suggestion: string | null;
  refs: Ref[];
};

export type RuleDef = {
  id: string;
  title: string;
  severity: Severity;
  applies: "ALL" | "LC";
  check: string;
  params: Record<string, unknown>;
  suggestion?: string;
};

export type RuleSet = { version: string; rules: RuleDef[] };

/** A check returns zero or more problems; severity defaults to the rule's. */
export type Problem = { message: string; refs: Ref[]; severity?: Severity };
export type Check = (facts: ShipmentFacts, params: Record<string, unknown>) => Problem[];
