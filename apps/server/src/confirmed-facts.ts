import type { ProfileFact } from "@campus-job-agent/contracts";

export function summarizeConfirmedFact(fact: ProfileFact): string {
  const content = fact.content;
  if (content.type === "education") return `${content.school}，${content.degree} ${content.major}（${content.startDate || "时间待补充"}—${content.endDate || "至今"}）${content.details ? `：${content.details}` : ""}`;
  if (content.type === "internship") return `${content.company} · ${content.role}（${content.startDate || "时间待补充"}—${content.endDate || "至今"}）：${content.bullets.join("；") || "职责待补充"}`;
  if (content.type === "project") return `${content.name}${content.role ? ` · ${content.role}` : ""}：${content.bullets.join("；") || "项目内容待补充"}${content.technologies.length ? `；技术：${content.technologies.join("、")}` : ""}`;
  return `${content.name}${content.category ? `（${content.category}）` : ""}${content.evidence ? `：${content.evidence}` : ""}`;
}
