import { createHash } from "node:crypto";
import type { CandidateFactContent } from "@campus-job-agent/contracts";

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function anchors(fact: CandidateFactContent): string[] {
  switch (fact.type) {
    case "education":
      return [fact.type, fact.school, fact.degree, fact.major, fact.startDate, fact.endDate];
    case "internship":
      return [fact.type, fact.company, fact.role, fact.startDate, fact.endDate];
    case "project":
      return [fact.type, fact.name, fact.role, fact.startDate, fact.endDate];
    case "skill":
      return [fact.type, fact.name, fact.category];
  }
}

function canonicalFact(fact: CandidateFactContent): Record<string, string | string[]> {
  return Object.fromEntries(
    Object.entries(fact)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map(normalized) : normalized(value),
      ]),
  );
}

export function factFingerprint(fact: CandidateFactContent): string {
  return createHash("sha256").update(JSON.stringify(canonicalFact(fact))).digest("hex");
}

export type DuplicateSuggestion = {
  kind: "exact" | "similar";
  factIndex: number;
} | null;

export function duplicateSuggestion(
  candidate: CandidateFactContent,
  existing: CandidateFactContent[],
): DuplicateSuggestion {
  const candidateFingerprint = factFingerprint(candidate);
  const exact = existing.findIndex((fact) => factFingerprint(fact) === candidateFingerprint);
  if (exact >= 0) return { kind: "exact", factIndex: exact };

  const candidateKey = normalized(anchors(candidate)[1] ?? "");
  const similar = existing.findIndex((fact) => (
    fact.type === candidate.type
    && normalized(anchors(fact)[1] ?? "") === candidateKey
  ));
  return similar >= 0 ? { kind: "similar", factIndex: similar } : null;
}
