# OfferBiu company-directory adapter

OfferBiu is treated as a public directory of company recruiting entry points, not as a job database.

The adapter follows this bounded workflow:

1. Read the public `https://offerbiu.com/companies/` directory page.
2. Follow at most 200 public OfferBiu company-detail pages found there.
3. Store only an explicit external HTTP(S) recruitment link from a company-detail page. The record retains the exact OfferBiu detail-page URL as provenance.
4. Never log in, submit a form, access a private API, or infer a recruiting URL from a company name.

Links to OfferBiu itself are not stored as career sites. They remain navigational pages used to find the external recruiting link. Account pages and links without a recruiting signal are discarded.

On 2026-07-18, the unauthenticated public directory page exposed navigation and login links but no company-detail links, so a live scan correctly returned zero entries. This is an availability fact, not a reason to manufacture records. The local company database and API are still ready for explicit public entries when the page exposes them or when another public directory adapter is added.
