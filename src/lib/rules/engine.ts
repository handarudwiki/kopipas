import { readFileSync } from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { CHECKS } from "./checks";
import type { RuleDef, RuleFinding, RuleSet, ShipmentFacts } from "./types";

let cached: RuleSet | null = null;

/** Loads the versioned rule library from rules/document-rules.yaml (rules are data, not code). */
export function loadRuleSet(file = path.join(process.cwd(), "rules", "document-rules.yaml")): RuleSet {
  if (cached && process.env.NODE_ENV === "production") return cached;
  const doc = loadYaml(readFileSync(file, "utf8")) as RuleSet;
  if (!doc?.version || !Array.isArray(doc.rules)) throw new Error("invalid rule file");
  for (const r of doc.rules) {
    if (!CHECKS[r.check]) throw new Error(`rule ${r.id}: unknown check "${r.check}"`);
    r.params ??= {};
  }
  cached = doc;
  return doc;
}

/** Runs every applicable rule. Deterministic: same facts + same rule set → same findings. */
export function evaluate(facts: ShipmentFacts, ruleSet: RuleSet = loadRuleSet(), only?: string[]): RuleFinding[] {
  const out: RuleFinding[] = [];
  for (const rule of ruleSet.rules) {
    if (only && !only.includes(rule.id)) continue;
    if (rule.applies === "LC" && facts.paymentMethod !== "LC") continue;
    for (const p of runRule(rule, facts)) out.push(p);
  }
  return out;
}

export function runRule(rule: RuleDef, facts: ShipmentFacts): RuleFinding[] {
  const problems = CHECKS[rule.check]!(facts, rule.params);
  return problems.map((p) => ({
    ruleId: rule.id,
    severity: p.severity ?? rule.severity,
    message: p.message,
    suggestion: rule.suggestion ?? null,
    refs: p.refs,
  }));
}

/** Stable identity of a finding across re-validations (keeps ACCEPTED decisions). */
export function fingerprint(f: Pick<RuleFinding, "ruleId" | "refs" | "message">): string {
  const refs = f.refs
    .map((r) => `${r.documentType ?? ""}:${r.field ?? ""}`)
    .sort()
    .join("|");
  return `${f.ruleId}#${refs || f.message.slice(0, 60)}`;
}
