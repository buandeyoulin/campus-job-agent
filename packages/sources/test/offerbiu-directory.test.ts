import { describe, expect, it } from "vitest";
import { extractOfferBiuCompanyEntries, extractOfferBiuCompanyPages } from "../src/offerbiu.js";

describe("OfferBiu company directory extraction", () => {
  it("keeps only explicit public external career links", () => {
    const entries = extractOfferBiuCompanyEntries([
      { companyName: "Example Semiconductor", href: "https://careers.example.com/campus" },
      { companyName: "OfferBiu internal page", href: "https://offerbiu.com/company/example" },
      { companyName: "Login only", href: "https://example.com/login" },
      { companyName: "Footer link", href: "https://example.com/about" },
      { companyName: "", href: "https://jobs.example.com/openings" },
      { companyName: "Example Semiconductor", href: "https://careers.example.com/campus" },
    ]);

    expect(entries).toEqual([{
      companyName: "Example Semiconductor",
      careerUrl: "https://careers.example.com/campus",
      directorySource: "offerbiu",
      directoryUrl: "https://offerbiu.com/companies/",
    }]);
  });

  it("allows a public OfferBiu company detail page to provide the external career URL", () => {
    const pages = extractOfferBiuCompanyPages([
      { companyName: "Example Semiconductor", href: "https://offerbiu.com/company/example-semiconductor" },
      { companyName: "Jobs index", href: "https://offerbiu.com/jobs/" },
    ]);
    const entries = extractOfferBiuCompanyEntries([
      { companyName: pages[0]!.companyName, href: "https://jobs.example.com/campus", directoryUrl: pages[0]!.href },
    ]);

    expect(entries).toEqual([expect.objectContaining({
      companyName: "Example Semiconductor",
      careerUrl: "https://jobs.example.com/campus",
      directoryUrl: "https://offerbiu.com/company/example-semiconductor",
    })]);
  });
});
