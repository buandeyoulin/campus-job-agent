export interface PreparationJob { title: string; company: string; description: string }
export interface PreparationFact { status: "pending" | "confirmed" | "rejected"; content: { type: string; name?: string; evidence?: string; bullets?: string[] } }

const REQUIREMENTS = ["TypeScript", "JavaScript", "React", "Vue", "Python", "SQL", "沟通能力"];
const confirmed = (facts: PreparationFact[]) => facts.filter((fact) => fact.status === "confirmed");
const names = (facts: PreparationFact[]) => confirmed(facts).flatMap((fact) => fact.content.name ? [fact.content.name] : []);
const requirements = (job: PreparationJob) => REQUIREMENTS.filter((term) => job.description.toLocaleLowerCase().includes(term.toLocaleLowerCase()));

export function createTailoredResumeDraft(job: PreparationJob, facts: PreparationFact[]): string {
  const lines = ["# 定制简历草稿", `目标：${job.company} · ${job.title}`, "", "## 已确认且相关的事实"];
  for (const fact of confirmed(facts)) {
    const name = fact.content.name ?? fact.content.type;
    const evidence = fact.content.evidence ?? fact.content.bullets?.join("；") ?? "";
    lines.push(`- ${name}${evidence ? `：${evidence}` : ""}`);
  }
  return lines.join("\n");
}

export function createInterviewPack(job: PreparationJob, facts: PreparationFact[]): { questions: string[]; gaps: string[] } {
  const supported = names(facts).map((name) => name.toLocaleLowerCase());
  const found = requirements(job);
  return {
    questions: found.filter((term) => supported.includes(term.toLocaleLowerCase())).map((term) => `请结合你的经历说明如何使用 ${term}`),
    gaps: found.filter((term) => !supported.includes(term.toLocaleLowerCase())).map((term) => `${term}：尚无已确认事实可支撑`),
  };
}
