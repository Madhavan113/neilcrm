# NeilCRM — Architecture & Stack

Reflects what's **actually built** as of 2026-06-21. Items marked _(planned)_ are designed but not yet implemented.

## Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript | One framework; Route Handlers are the backend. Note: this repo runs a **modified** Next.js 16 — see `app/AGENTS.md`. |
| UI | Tailwind CSS v4 | Component classes live in `globals.css`. shadcn/ui not added yet. |
| LLM | Anthropic Claude (`claude-opus-4-8`) | Streamed drafting. Thinking off + `effort: low` for fast time-to-first-token on short emails. |
| People data | **Apollo.io** (now), People Data Labs _(later)_ | Behind a `PeopleProvider` seam (`src/lib/people`). The current Apollo key is **free-plan**, so person endpoints are blocked and the adapter degrades to company-level enrichment by domain. |
| Database | **Supabase Postgres** | Accessed via `@supabase/supabase-js` with the **secret key** server-side (`src/lib/supabase/admin.ts`), which bypasses RLS. Schema in `app/supabase/schema.sql`. |
| Email tracking | Open pixel + click redirector | `/api/track/open|click/[trackingId]` → `email_events`. |
| Auth | Supabase Auth via `@supabase/ssr` _(planned)_ | Publishable key + JWKS already configured in env. |
| Outbound email | Gmail API, per-user OAuth _(planned)_ | The "Superhuman wrap." Sends the approved draft with the tracking pixel injected. |
| Inbound email | Gmail Pub/Sub _(planned)_ | Reply ingestion → classification. |
| Agent orchestration | Inngest _(planned)_ | Follow-up sequences + reply triage. Dependency removed until we build this phase. |
| Hosting | Vercel + Supabase _(planned)_ | Not deployed yet. |

## Why Supabase client (not Drizzle)

We initially scaffolded Drizzle ORM with a direct Postgres connection, but switched to the **Supabase JS client + secret key** so we never need to manage a Postgres connection string. The schema is plain SQL (`app/supabase/schema.sql`, generated once from the original Drizzle schema) applied via the Supabase SQL Editor. Server code reads/writes through the admin client, which bypasses RLS; the browser/publishable key is denied by RLS until auth policies exist.

Trade-off: we lose Drizzle's typed query builder. Acceptable for the current surface; if relational query ergonomics become painful we can layer Drizzle back on (it needs the Postgres connection string) or use Supabase's generated types.

## Why Apollo now, PDL later

The user supplied an Apollo key, so Apollo is the only data source today. It sits behind `PeopleProvider`, so People Data Labs (the originally-researched primary — see `SEARCH_API_RESEARCH.md`) can slot in without touching callers. The free Apollo plan blocks person lookups (`people/match`, `bulk_match`, search all 403 `API_INACCESSIBLE`); only `organizations/enrich` works, so the adapter falls back to company-level enrichment and the AI personalizes on the company.

## High-level flow

```
Compose page ──▶ /api/enrich ──▶ Apollo (company-level)
     │
     ▼
 /api/draft ──▶ Claude (streamed) ──▶ editable draft
     │
     ▼ (planned)
 Gmail send (pixel injected) ──▶ recipient
     │                              │ opens/clicks
     ▼                              ▼
 email_messages              /api/track/open|click ──▶ email_events
                                    │
                                    ▼ (planned)
                          reply ingest ──▶ classify ──▶ structured response / follow-up
```

## Repository layout

```
neilcrm/
├── README.md                 # single source of truth for setup + status
├── docs/                     # ARCHITECTURE, DATA_MODEL, PLAN, SEARCH_API_RESEARCH
└── app/
    ├── .env.example
    ├── supabase/schema.sql   # canonical DB schema (apply via SQL Editor)
    └── src/
        ├── app/
        │   ├── (dashboard)/compose/
        │   └── api/{enrich,draft,track/*}
        └── lib/
            ├── people/        # Apollo adapter + PeopleProvider seam + cache
            ├── ai/            # Claude drafting
            ├── email/         # tracking pixel/links + event recording
            └── supabase/      # server-side admin client
```
