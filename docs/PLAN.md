# NeilCRM — Plan

## North star

An inbound + outbound AI CRM for an infrastructure exchange that does three things 10× better than HubSpot:

1. **Reaches the right infra operators with AI-drafted, human-steered outreach.** You give it emails (or, later, a natural-language search); it enriches them and drafts a curated email you can prompt and edit.
2. **Tracks engagement and follows up** — opens, clicks, replies → automatic follow-up sequences that stop the moment someone engages.
3. **Responds to inbound in a structured way** — classify the reply, propose the next step, keep a human in the loop.

Everything else (contact table, deal stages, reporting) is table-stakes and stays intentionally minimal.

---

## Done

- **Bootstrap** — Next.js 16 app in `app/` (App Router, React 19, Tailwind v4); GitHub repo.
- **AI Compose + steer** (`/compose`) — paste emails → Apollo enrich → Claude streams a draft → prompt-steer + edit. (`/api/enrich`, `/api/draft`.)
- **Apollo adapter** behind a `PeopleProvider` seam; degrades to company-level on the free plan.
- **Engagement tracking** — open pixel + click redirector (`/api/track/*`) → `email_events`.
- **Database** — Supabase Postgres; schema in `app/supabase/schema.sql` (12 tables incl. engagement/sequences/structured-response), accessed via the Supabase secret-key client. RLS on.

## Next — Gmail wrap

The headline outbound surface. Per-user Google OAuth; send the approved draft through the user's real Gmail with the tracking pixel injected; persist `email_threads`/`email_messages`. Inbound (Gmail Pub/Sub) ingest follows.

## Then — Auth

Supabase Auth via `@supabase/ssr` (publishable key + JWKS already configured). Org/workspace model; add per-org RLS policies (tables are currently locked to the server secret key).

## Then — CRM core

Contacts list + detail, companies (auto-grouped by domain), activity feed, a single deal pipeline.

## Then — Agent layer (re-add Inngest)

- **Follow-up scheduler** — `sequence_enrollments.next_action_at` due → draft next step into the approval queue; pause on reply/unsubscribe.
- **Reply triage** — inbound reply → Claude classifies intent → `reply_classifications.proposed_action` → structured, human-approved response.

## Then — Polish & deploy

Vercel + Supabase deploy; error/log observability; onboarding.

---

## Deliberately NOT building yet

Mobile app · marketing automation · customizable pipelines · deep reporting · third-party API · multi-tenant SaaS (single-org for now). NL people-search (`search_queries`) and PDL come after the core outbound/inbound loop works.
