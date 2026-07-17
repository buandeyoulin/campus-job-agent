import { NormalizedJobSchema, type NormalizedJob, type ProbeResult } from "@campus-job-agent/contracts";

const API = "https://careers.tencent.com/tencentcareer/api/post/Query";

export interface TencentFetchOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  pageSize?: number;
  maxJobs?: number;
}

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

function totalPosts(input: unknown): number {
  const count = (input as { Data?: { Count?: unknown } })?.Data?.Count;
  return Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
}

export async function fetchTencentJobs(options: TencentFetchOptions = {}): Promise<NormalizedJob[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 50);
  const maxJobs = Math.min(Math.max(options.maxJobs ?? 100, 1), 100);
  const all: NormalizedJob[] = [];
  let expected = maxJobs;

  for (let pageIndex = 1; all.length < expected; pageIndex += 1) {
    const url = new URL(API);
    url.searchParams.set("timestamp", String(now().getTime()));
    url.searchParams.set("keyword", "实习");
    url.searchParams.set("pageIndex", String(pageIndex));
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("language", "zh-cn");
    const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Tencent public API returned HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (pageIndex === 1) expected = Math.min(totalPosts(payload), maxJobs);
    const jobs = parseTencentResponse(payload, now().toISOString());
    all.push(...jobs);
    if (jobs.length === 0 || all.length >= expected) break;
  }
  return all.slice(0, maxJobs);
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
