# NeilCRM app

Next.js 16 (App Router) + React 19 + TS + Tailwind v4. See `../docs` for product/architecture.

## Run

```bash
pnpm install
# add your keys to .env.local (see below)
pnpm dev   # http://localhost:3000 → redirects to /compose
```

## Env (`.env.local`)

Slice 1 (AI Compose) needs two keys:

- `ANTHROPIC_API_KEY` — Claude drafting
- `APOLLO_API_KEY` — email enrichment

The routes return a clean `502` with a helpful message if a key is missing, so the UI loads regardless.

## What's built — Slice 1: AI Compose + steer

Flow on `/compose`:

1. Paste recipient emails → **Enrich** (`POST /api/enrich`) resolves name/title/company via Apollo.
2. Pick a contact, add **sender context** (who you are / your offer) and an optional **steering prompt**.
3. **Draft** (`POST /api/draft`) streams a Claude-written email into an editable pane. **Revise** re-runs with your edits + new steering as context.

### ⚠️ Apollo plan limitation

The current `APOLLO_API_KEY` is on Apollo's **free plan**, which blocks all *person* endpoints (`people/match`, `bulk_match`, `mixed_people/search` → `403 API_INACCESSIBLE`). Only `organizations/enrich` works. So the adapter **degrades gracefully**: when person lookups are blocked it enriches the **company** by email domain (industry, size, description, keywords) and the AI personalizes on that, addressing the recipient generically (`matched:false, companyMatched:true`).

To resolve real names/titles, upgrade Apollo to a paid plan with API access, or wire People Data Labs (deferred). The adapter starts using person data automatically the moment the key can reach those endpoints.

### Key files

| Path | Role |
|---|---|
| `src/lib/people/` | Data-source abstraction. `apollo.ts` is the live adapter; `index.ts` adds a read-through TTL cache (fast repeat fetches). PDL slots in behind `PeopleProvider` later. |
| `src/lib/ai/draft.ts` | Claude drafting (opus-4-8, adaptive thinking, streamed). System prompt = infra-vertical cold-email rules; user steering overrides defaults. |
| `src/app/api/enrich/route.ts` | Emails → enriched contacts (cached). |
| `src/app/api/draft/route.ts` | Contact + context + steering → streamed draft. |
| `src/app/(dashboard)/compose/page.tsx` | The compose UI. |

## Next slices (not yet built)

- **Real Gmail wrap** — per-user Google OAuth, threaded inbox, send the draft through the user's Gmail.
- **Persistence** — Drizzle + Supabase for contacts/threads/drafts (schema sketched in `../docs/DATA_MODEL.md`).
- **Agent layer** — Inngest workflows for follow-ups and reply triage.
