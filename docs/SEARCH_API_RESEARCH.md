# People Search API Research (May 2026)

> **Status (2026-06-21):** historical research. Current decision is **Apollo now, PDL later** — see `ARCHITECTURE.md`. The original PDL-primary recommendation below still informs the eventual NL-search phase.

Goal: pick a primary + secondary data source for the infrastructure-operator search feature.

## TL;DR

- **Primary: People Data Labs (PDL).** 1.5B profiles, $0.01/record, raw API, SQL-like filters. Best fit for infra-vertical filtering (job titles, company industry, employee count).
- **Secondary: Apollo.io.** $49/mo entry; better-verified emails/phones; falls back to it when PDL is missing a contact.
- **On the bench: HeroHunt.ai.** Agent-native natural-language search if we want to skip building the NL→query translator ourselves.

## What we ruled out

| Provider | Why not |
|---|---|
| Proxycurl | **Dead.** Shut down January 2025 after LinkedIn enforcement action. |
| Clearbit | Acquired by HubSpot, rebranded Breeze Intelligence — no standalone API unless you're a HubSpot customer. |
| ZoomInfo | Enterprise pricing, annual seat-based contracts — overkill at our stage. |
| LinkedIn Sales Navigator | No usable public API for programmatic search. |

## Live options

### People Data Labs ([peopledatalabs.com](https://peopledatalabs.com))
- 1.5B+ person profiles, 180+ countries
- Pricing: Free tier exists, Pro from $98/mo, enterprise custom. Per-record ~$0.01.
- API: OpenAPI spec, SQL-like Elasticsearch query DSL, 5-language SDK
- **Why for NeilCRM:** the SQL-like filters let us write infra-specific queries:
  - `job_title_levels = "vp"` AND `job_title_role = "engineering"` AND `industry IN ("computer_networking", "telecommunications")`
  - `skills CONTAINS ("data center operations", "colocation")`
  - `experience.company.size = "10001+"` (hyperscaler filter)

### Apollo.io ([apollo.io](https://apollo.io))
- Pricing: free tier (limited), $49/mo Basic, $79/mo Pro
- Combined data + outreach + CRM features (we'd ignore the outreach/CRM parts)
- API exposes person search + email/phone reveal
- **Why secondary:** email verification quality is reportedly better than PDL's, useful as fallback enrichment.

### Coresignal ([coresignal.com](https://coresignal.com))
- 792M workforce records, compliant LinkedIn-equivalent data
- $49/mo entry
- Worth a second look if PDL freshness becomes a problem.

### HeroHunt.ai
- Differentiator: natural-language input + AI-powered scoring + contact verification + outreach automation **in one API**
- Tradeoff: we'd give up some control over the search query shape — and our HITL agent design depends on owning the loop end-to-end.

## Decision

Start with PDL only. Wire Apollo when we hit our first "PDL doesn't have an email" case. Keep HeroHunt's docs open in a tab in case we want to A/B the NL-query path.

## Sources

- [Best People Search APIs for AI Agents 2026 — HeroHunt](https://www.herohunt.ai/blog/best-people-search-apis-for-ai-agents-2026/)
- [9 Best People Data Labs Alternatives — Crustdata](https://crustdata.com/blog/people-data-labs-alternatives-b2b-data-providers)
- [People Data Labs Review 2026 — SyncGTM](https://www.syncgtm.com/blog/people-data-labs-review)
- [Best B2B Data Providers — Starnus](https://starnus.com/blog/best-b2b-data-providers-zoominfo-apollo-pdl)
- [Clearbit Alternatives — BounceWatch](https://api.bouncewatch.com/blog/api-data/clearbit-alternative-enrichment-api)
- [Monaco product page](https://www.monaco.com/product)
- [TechCrunch — Monaco launch](https://techcrunch.com/2026/02/11/former-founders-fund-vc-sam-blond-launches-ai-sales-startup-to-upend-salesforce/)
