# NeilCRM

An inbound + outbound AI CRM for an infrastructure exchange (data center, power, fiber, colo). It abstracts away the underlying people/email database: you experience it as "AI finds & drafts outreach, tracks engagement, and helps you respond" — Monaco-style human-in-the-loop, narrowed to the infra vertical.

The app lives in [`app/`](app/). Planning docs are in [`docs/`](docs/).

---

## Stack (as built)

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| UI | Tailwind CSS v4 (component classes in `globals.css`; shadcn not yet added) |
| LLM | Anthropic Claude (`claude-opus-4-8`), streamed drafting |
| People data | Apollo.io (free plan → company-level enrichment) behind a `PeopleProvider` seam; PDL later |
| Database | Supabase Postgres, accessed via `@supabase/supabase-js` with the **secret key** server-side (`src/lib/supabase/admin.ts`). Schema in [`app/supabase/schema.sql`](app/supabase/schema.sql), RLS enabled |
| Email tracking | Open pixel + click redirector → `email_events` |

**Planned, not yet built:** Gmail wrap (per-user OAuth + send), Supabase Auth (`@supabase/ssr`, already a dep), follow-up sequences + reply triage (Inngest — re-add when we build it), Vercel deploy.

> ⚠️ `app/` runs a **modified** Next.js 16 whose APIs differ from upstream (e.g. instant client navigation requires an `unstable_instant` route export). Read the bundled guides in `app/node_modules/next/dist/docs/` before writing Next code — don't assume stock Next.js behavior.

---

## Run

```bash
cd app
pnpm install
cp .env.example .env.local   # then fill in the keys
pnpm dev                      # http://localhost:3000 → redirects to /compose
```

### Environment (`app/.env.local`)

See [`app/.env.example`](app/.env.example). Keys:

- `ANTHROPIC_API_KEY` — Claude drafting
- `APOLLO_API_KEY` — email/company enrichment
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase (browser/auth)
- `SUPABASE_SECRET_KEY` — server-side data access (bypasses RLS; never exposed to the browser)
- `SUPABASE_JWKS_URL` — for verifying auth JWTs (auth phase)

Routes return a clean `502` with a helpful message if a key is missing, so the UI loads regardless.

### Database

Create the tables once: open [`app/supabase/schema.sql`](app/supabase/schema.sql), paste it into the Supabase dashboard → **SQL Editor** → Run. It creates all tables and enables Row-Level Security (only the server secret key can read/write until auth policies are added).

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

## Roadmap

See [`docs/PLAN.md`](docs/PLAN.md). Next up: **Gmail wrap** (OAuth + send the approved draft with the tracking pixel injected), then auth, then the follow-up/triage agent layer.
