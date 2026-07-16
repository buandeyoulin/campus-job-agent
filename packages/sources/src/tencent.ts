import { NormalizedJobSchema, type NormalizedJob, type ProbeResult } from "@campus-job-agent/contracts";

const API = "https://careers.tencent.com/tencentcareer/api/post/Query";

function parseChineseDate(value: unknown): string | undefined {
  const match = String(value ?? "").match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  if (!year || !month || !day) return undefined;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString();
}

export function parseTencentResponse(input: unknown, capturedAt: string): NormalizedJob[] {
  const posts = (input as { Data?: { Posts?: unknown[] } })?.Data?.Posts;
  if (!Array.isArray(posts)) return [];
  return posts.flatMap((raw) => {
    const post = raw as Record<string, unknown>;
    if (!post.PostId || !post.RecruitPostName || !post.Responsibility) return [];
    const url = String(post.PostURL || `https://careers.tencent.com/jobdesc.html?postId=${post.PostId}`).replace(/^http:/, "https:");
    return [NormalizedJobSchema.parse({
      source: "tencent",
      sourceJobId: String(post.PostId),
      sourceUrl: url,
      title: String(post.RecruitPostName),
      company: "腾讯",
      location: String(post.LocationName ?? ""),
      description: [post.BGName && `BG: ${post.BGName}`, post.CategoryName && `类别: ${post.CategoryName}`, post.Responsibility].filter(Boolean).join("\n"),
      postedAt: parseChineseDate(post.LastUpdateTime),
      capturedAt,
    })];
  });
}

export async function probeTencent(fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<ProbeResult> {
  const checkedAt = now().toISOString();
  const url = `${API}?timestamp=${now().getTime()}&keyword=实习&pageIndex=1&pageSize=5&language=zh-cn`;
  try {
    const response = await fetchImpl(url, { redirect: "error" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const jobs = parseTencentResponse(await response.json(), checkedAt);
    return { name: "tencent", status: jobs.length > 0 ? "pass" : "fail", summary: jobs.length > 0 ? "Tencent public API returned jobs" : "Tencent public API returned no usable jobs", details: { jobCount: jobs.length }, checkedAt };
  } catch {
    return { name: "tencent", status: "fail", summary: "Tencent public API request failed", details: {}, checkedAt };
  }
}
