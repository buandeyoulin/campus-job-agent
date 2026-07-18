import type { Company, CompanyCareerSource, NormalizedJob } from "@campus-job-agent/contracts";

export interface OfficialJobBatch {
  completeness: "complete" | "partial";
  jobs: NormalizedJob[];
  sourceCheckedAt: string;
}

export interface CareerSourceAdapter {
  readonly id: string;
  supports(source: CompanyCareerSource): boolean;
  fetch(source: CompanyCareerSource, context: { company: Company; capturedAt: string }): Promise<OfficialJobBatch>;
}

const MAX_BYTES = 2 * 1024 * 1024;
export const SOURCE_USER_AGENT = "campus-job-agent/0.1 (+https://github.com/buandeyoulin/campus-job-agent)";

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new Error("Career source exceeds 2 MiB limit");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Career source exceeds 2 MiB limit"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function fetchBoundedSource(url: string, fetcher: typeof fetch, accept: string): Promise<{ text: string; finalUrl: string; contentType: string }> {
  let current = new URL(url);
  if (current.protocol !== "https:" || current.username || current.password) throw new Error("Only credential-free HTTPS career sources are allowed");
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetcher(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: accept, "User-Agent": SOURCE_USER_AGENT },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 5) throw new Error("Career source redirect limit exceeded");
      current = new URL(location, current);
      if (current.protocol !== "https:") throw new Error("Career source redirect left HTTPS");
      continue;
    }
    if (!response.ok) throw new Error(`Career source returned HTTP ${response.status}`);
    return { text: await readBounded(response), finalUrl: response.url || current.toString(), contentType: response.headers.get("content-type") ?? "" };
  }
  throw new Error("Career source redirect limit exceeded");
}
