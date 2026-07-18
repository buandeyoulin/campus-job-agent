import { describe, expect, it } from "vitest";
import { classifyCareerSource } from "../src/index.js";

describe("career source classifier", () => {
  it("recognizes valid JobPosting JSON-LD", () => {
    const html = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Verification Engineer"}</script>';
    expect(classifyCareerSource("https://example.com/jobs/1", html, [])).toEqual({ kind: "json_ld", adapter: "json-ld" });
  });

  it("does not trust an ATS-looking hostname without official-link evidence", () => {
    expect(classifyCareerSource("https://jobs.lever.co/example", "<html>Open roles</html>", [])).toEqual({ kind: "html", adapter: "unclassified" });
  });

  it("recognizes an externally hosted tenant only with official ATS evidence", () => {
    const evidence = [{ kind: "official_ats_link" as const, url: "https://example.com/careers", detail: "Official homepage link" }];
    expect(classifyCareerSource("https://jobs.lever.co/example", "<html>Open roles</html>", evidence)).toEqual({ kind: "html", adapter: "external-ats" });
  });
});
