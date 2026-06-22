# NeilCRM

An inbound + outbound AI CRM for an infrastructure exchange (data center, power, fiber, colo). It abstracts away the underlying people/email database — you experience it as "AI finds & drafts outreach, tracks engagement, and helps you respond." Monaco-style human-in-the-loop, narrowed to the infra vertical.

The Next.js app is in [`app/`](app/). This README is the single source of truth (design + setup + roadmap).

---

## Stack (as built)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS v4 (component classes in `globals.css`; shadcn not yet added) |
| LLM | Anthropic Claude (`claude-opus-4-8`), streamed drafting |
| People data | Apollo.io (free plan → company-level enrichment) behind a `PeopleProvider` seam; PDL later |
| Database | Supabase Postgres via `@supabase/supabase-js` with the **secret key** server-side (`src/lib/supabase/admin.ts`). Schema in [`app/supabase/schema.sql`](app/supabase/schema.sql), RLS enabled |
| Email tracking | Open pixel + click redirector → `email_events` |

**Planned, not yet built:** Gmail wrap (per-user OAuth + send), Supabase Auth (`@supabase/ssr`, already a dep), follow-up sequences + reply triage (Inngest — re-add when we build it), Vercel deploy.

> ⚠️ `app/` runs a **modified** Next.js 16 whose APIs differ from upstream (e.g. instant client navigation requires an `unstable_instant` route export). Read the bundled guides in `app/node_modules/next/dist/docs/` before writing Next code — don't assume stock Next.js behavior.

---

## Setup

```bash
cd app
pnpm install
pnpm dev          # http://localhost:3000 → redirects to /compose
```

### Environment

There is one env file: **`app/.env.local`** (gitignored — never committed). Create it with:

```bash
# app/.env.local
ANTHROPIC_API_KEY=               # Claude drafting
APOLLO_API_KEY=                  # email/company enrichment
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # browser-safe key (auth phase)
SUPABASE_SECRET_KEY=             # SERVER ONLY — bypasses RLS, never exposed to the browser
SUPABASE_JWKS_URL=               # verify auth JWTs (auth phase)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Routes return a clean `502` with a helpful message if a key is missing, so the UI loads regardless.

### Database

Create the tables once: open [`app/supabase/schema.sql`](app/supabase/schema.sql), paste it into the Supabase dashboard → **SQL Editor** → Run. It (re-)creates all tables and enables Row-Level Security — only the server secret key can read/write until auth policies are added. The file is idempotent (it resets NeilCRM's tables first), so it's safe to re-run; that reset wipes existing NeilCRM data, which is fine during setup.

---

## What works today — AI Compose + steer

On `/compose`:

1. Paste recipient emails → **Enrich** (`POST /api/enrich`) resolves company/role via Apollo (read-through cached).
2. Add **sender context** + an optional **steering prompt**.
3. **Draft** (`POST /api/draft`) streams a Claude-written email into an editable pane; **Revise** re-runs with your edits + new steering.

Open/click tracking endpoints (`/api/track/open|click/[trackingId]`) are wired and log to `email_events` once the schema is applied.

### Key files

| Path | Role |
|---|---|
| `src/lib/people/` | Data-source seam. `apollo.ts` adapter (degrades to company-level on the free plan) + read-through cache. PDL slots in behind `PeopleProvider`. |
| `src/lib/ai/draft.ts` | Claude drafting — infra cold-email system prompt; user steering overrides. |
| `src/lib/email/` | `tracking.ts` (pixel + link injection), `events.ts` (records `email_events` via Supabase). |
| `src/lib/supabase/admin.ts` | Server-side Supabase client (secret key). |
| `src/app/(dashboard)/compose/page.tsx` | The compose UI. |
| `supabase/schema.sql` | Canonical DB schema (apply via Supabase SQL Editor). |

---

## Architecture decisions

**Supabase client, not Drizzle.** We scaffolded Drizzle + a direct Postgres connection, then switched to the Supabase JS client + secret key so we never manage a Postgres connection string. The schema is plain SQL (`app/supabase/schema.sql`) applied via the SQL Editor; server code reads/writes through the admin client (bypasses RLS). The browser/publishable key is denied by RLS until auth policies exist. Trade-off: no typed query builder — acceptable for now; revisit with Supabase generated types or re-add Drizzle if relational queries get painful.

**Apollo now, PDL later.** Apollo sits behind `PeopleProvider`, so People Data Labs can slot in without touching callers. The current Apollo key is **free-plan**, which blocks person endpoints (`people/match`, `bulk_match`, search → 403 `API_INACCESSIBLE`); only `organizations/enrich` works, so the adapter falls back to company-level enrichment and the AI personalizes on the company.

**Fast drafting.** Claude `claude-opus-4-8` with thinking off + `effort: low` and streaming → ~2s time-to-first-token on short emails; the strict output-format system prompt preserves quality.

---

## Data model

Conceptual map; exact DDL lives in `app/supabase/schema.sql`. snake_case, UUID PKs, timestamps everywhere, all scoped by `org_id` for future multi-tenancy.

| Table | Purpose |
|---|---|
| `orgs`, `users` | Workspace + app-side user profile (auth identity comes from Supabase later). |
| `companies`, `contacts` | People + their companies; contact `status` tracks the funnel (`new`→`opened`→`clicked`→`replied`→…). |
| `email_threads`, `email_messages` | Conversation state. Messages carry a `tracking_id` embedded in the pixel + links. |
| `email_events` | Append-only engagement signal: `opened` (pixel), `clicked` (redirector), `replied`, `bounced`, … Powers conversion + follow-up gating. Note: Apple Mail Privacy Protection pre-fetches pixels, so treat opens as a soft signal; weight clicks/replies higher. |
| `sequences`, `sequence_enrollments` | Follow-up cadences; a reply/unsubscribe pauses the enrollment so we never follow up after engagement. |
| `agent_drafts` | Human-in-the-loop approval queue for AI drafts. |
| `reply_classifications` | Inbound intent (`interested`/`question`/`meeting_request`/`objection`/…) + `proposed_action` for a structured, human-approved response. |
| `activities` | Append-only audit feed. |

Planned (not in the schema yet): `search_queries` (NL people-search), `deals` (single pipeline), `agent_runs` (Inngest audit).

---

## Roadmap

**Done:** app scaffold · AI Compose + steer (`/compose`, `/api/enrich`, `/api/draft`) · Apollo adapter · open/click tracking · Supabase DB + schema.

**Next — Gmail wrap:** per-user Google OAuth; send the approved draft through the user's real Gmail with the tracking pixel injected; persist threads/messages. Then inbound (Gmail Pub/Sub) ingest.

**Then:** Supabase Auth (`@supabase/ssr`) + per-org RLS policies → CRM core (contacts/companies/activity, single deal pipeline) → agent layer (re-add Inngest: follow-up scheduler + reply triage) → Vercel deploy.

**Deliberately deferred:** NL people-search + PDL, mobile, marketing automation, customizable pipelines, deep reporting, multi-tenant SaaS.
