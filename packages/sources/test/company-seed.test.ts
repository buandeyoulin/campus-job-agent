import { describe, expect, it } from "vitest";
import { loadSemiconductorCompanySeed } from "../src/index.js";

describe("semiconductor company seed", () => {
  it("loads 20 unique reviewed semiconductor companies", () => {
    const seed = loadSemiconductorCompanySeed();
    expect(seed).toHaveLength(20);
    expect(new Set(seed.map((item) => item.officialDomain)).size).toBe(20);
    expect(seed.every((item) => item.industries.length > 0)).toBe(true);
    expect(seed.every((item) => item.careerSources.length > 0)).toBe(true);
  });

  it("uses HTTPS official sources with explicit cross-domain evidence", () => {
    const seed = loadSemiconductorCompanySeed();
    const aggregateHosts = /(^|\.)(51job|zhaopin|liepin|zhipin)\.com$/;
    for (const company of seed) {
      for (const source of company.careerSources) {
        const url = new URL(source.url);
        expect(url.protocol).toBe("https:");
        expect(url.hostname).not.toMatch(aggregateHosts);
        const sameDomain = url.hostname === company.officialDomain || url.hostname.endsWith(`.${company.officialDomain}`);
        const hasOfficialAtsEvidence = source.evidence.some((item) => item.kind === "official_ats_link");
        expect(sameDomain || hasOfficialAtsEvidence).toBe(true);
      }
    }
  });
});
