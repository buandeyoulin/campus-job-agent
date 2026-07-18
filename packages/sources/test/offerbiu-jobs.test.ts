import { describe, expect, it, vi } from "vitest";
import { fetchOfferBiuJobs, mapOfferBiuPosting } from "../src/offerbiu.js";

const posting = {
  id: "rec-2027-chip-1",
  companyName: "示例半导体",
  companyNature: "民企",
  industry: "电子/半导体",
  recruitType: "秋招",
  targetYears: [2027],
  locations: ["上海", "深圳"],
  positionsText: "数字 IC 设计工程师、芯片验证工程师",
  deadlineText: "招满为止",
  announcementUrl: "https://news.example.com/chip-campus",
  applyUrl: "https://careers.example.com/chip-campus",
  examPolicy: "需要笔试",
  noteText: "面向应届生",
  sourceUpdatedAt: "2026-07-17T16:00:00Z",
};

describe("OfferBiu recruitment postings", () => {
  it("maps one OfferBiu posting to the normalized local job shape", () => {
    expect(mapOfferBiuPosting(posting, "2026-07-18T06:00:00.000Z")).toMatchObject({
      source: "offerbiu",
      sourceJobId: "rec-2027-chip-1",
      sourceUrl: "https://careers.example.com/chip-campus",
      title: "数字 IC 设计工程师、芯片验证工程师",
      company: "示例半导体",
      location: "上海、深圳",
      capturedAt: "2026-07-18T06:00:00.000Z",
    });
  });

  it("reads every page for the 2027 and 2026 cohorts with the API maximum page size", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = new URL(String(input));
      const season = Number(url.searchParams.get("seasonYear"));
      const page = Number(url.searchParams.get("page"));
      const pages = season === 2027 ? 2 : 1;
      const item = {
        ...posting,
        id: `rec-${season}-${page}`,
        seasonYear: season,
        targetYears: [season],
      };
      return new Response(JSON.stringify({
        success: true,
        data: { items: [item], page, size: 50, totalItems: pages, totalPages: pages, previewLimited: false },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const jobs = await fetchOfferBiuJobs({
      fetcher: fetcher as typeof fetch,
      now: () => new Date("2026-07-18T06:00:00.000Z"),
      concurrency: 2,
    });

    expect(jobs.map((job) => job.sourceJobId)).toEqual([
      "rec-2027-0",
      "rec-2027-1",
      "rec-2026-0",
    ]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetcher.mock.calls) {
      expect(new URL(String(url)).searchParams.get("size")).toBe("50");
      expect(new Headers(init?.headers).get("accept")).toBe("application/json");
    }
  });

  it("collects both public preview pages without requesting protected pages", async () => {
    const requestedPages: number[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page"));
      requestedPages.push(page);
      return new Response(JSON.stringify({
        success: true,
        data: {
          items: [{ ...posting, id: `preview-${page}` }],
          page,
          size: 50,
          totalItems: 2_809,
          totalPages: 57,
          previewLimited: true,
        },
      }), { status: 200 });
    });

    const jobs = await fetchOfferBiuJobs({ fetcher: fetcher as typeof fetch, seasons: [2027], concurrency: 1 });

    expect(jobs.map((job) => job.sourceJobId)).toEqual(["preview-0", "preview-1"]);
    expect(requestedPages).toEqual([0, 1]);
  });

  it("uses and closes a browser-backed session for the production fetch path", async () => {
    const pageFetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const season = Number(url.searchParams.get("seasonYear"));
      return new Response(JSON.stringify({
        success: true,
        data: { items: [{ ...posting, id: `rec-${season}-1` }], page: 1, size: 50, totalItems: 1, totalPages: 1 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const close = vi.fn(async () => undefined);
    const browserSessionFactory = vi.fn(async () => ({ fetcher: pageFetcher as typeof fetch, close }));
    const blockedGlobalFetch = vi.fn(async () => { throw new Error("global fetch must not be used"); });
    vi.stubGlobal("fetch", blockedGlobalFetch);

    try {
      const jobs = await fetchOfferBiuJobs({
        seasons: [2027],
        now: () => new Date("2026-07-18T06:00:00.000Z"),
        browserSessionFactory,
      });
      expect(jobs).toHaveLength(1);
      expect(browserSessionFactory).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(blockedGlobalFetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("paces browser-backed page requests to respect OfferBiu rate limits", async () => {
    const pageFetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page"));
      return new Response(JSON.stringify({
        success: true,
        data: {
          items: [{ ...posting, id: `rec-2027-${page}` }],
          page,
          size: 50,
          totalItems: 2,
          totalPages: 2,
        },
      }), { status: 200 });
    });
    const wait = vi.fn(async (_milliseconds: number) => undefined);

    await fetchOfferBiuJobs({
      seasons: [2027],
      browserSessionFactory: async () => ({ fetcher: pageFetcher as typeof fetch, close: async () => undefined }),
      wait,
      requestDelayMs: 3_000,
    });

    expect(pageFetcher).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledWith(3_000);
  });

  it("falls back to the announcement URL and skips records without any external URL", () => {
    expect(mapOfferBiuPosting({ ...posting, applyUrl: null }, "2026-07-18T06:00:00.000Z")?.sourceUrl)
      .toBe("https://news.example.com/chip-campus");
    expect(mapOfferBiuPosting({ ...posting, applyUrl: null, announcementUrl: null }, "2026-07-18T06:00:00.000Z"))
      .toBeNull();
  });
});
