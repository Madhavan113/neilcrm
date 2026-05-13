# NeilCRM — Plan

## North star

A CRM that, for an infrastructure exchange, does three things 10× better than HubSpot:

1. **Finds the right infra operators.** Natural-language search → ranked list of relevant contacts (with verified email, role, company, recency signal).
2. **Drafts and queues outreach for a human to approve.** Monaco-style human-in-the-loop. Agents don't auto-send.
3. **Watches the reply thread and pulls the human in at the right moment** — when a prospect signals interest, asks a pricing question, or proposes a meeting.

Everything else (contact table, deal stages, activity log, basic reporting) is table-stakes CRM and should be intentionally minimal.

---

## Phase 0 — Bootstrap (this week)

- [x] Research people search APIs ([SEARCH_API_RESEARCH.md](SEARCH_API_RESEARCH.md))
- [x] Pick stack ([ARCHITECTURE.md](ARCHITECTURE.md))
- [x] Create GitHub repo
- [ ] Scaffold Next.js app into `app/` subdirectory:
  ```bash
  pnpm dlx create-next-app@latest app \
    --ts --eslint --tailwind --src-dir --app --no-import-alias
  cd app && pnpm add @supabase/supabase-js @supabase/ssr drizzle-orm postgres \
    @anthropic-ai/sdk resend inngest zod
  pnpm add -D drizzle-kit
  ```
- [ ] Wire Supabase project (auth + Postgres) — copy URL + anon key into `.env.local`
- [ ] Install shadcn/ui: `pnpm dlx shadcn@latest init`

## Phase 1 — People Search MVP (week 1–2)

Goal: a single page where you type "VP of Infrastructure at hyperscale data centers in Texas" and get a ranked, clickable list of 20 real people you can save to NeilCRM.

- [ ] Sign up for People Data Labs free tier; store API key in `.env`
- [ ] Build `lib/search/pdl.ts` — wraps PDL Person Search API with infra-vertical defaults (job-title regex, industry filter, company employee-count bucket)
- [ ] Natural-language → PDL query translator using Claude (Opus 4.7 for the structured-output step)
- [ ] `app/(dashboard)/search/page.tsx` — search box, results table, "Save to contacts" action
- [ ] Drizzle schema for `contacts` + `companies` + `search_queries` (audit log)

## Phase 2 — CRM core (week 2–3)

Just enough to not be embarrassing:

- [ ] Contacts list + detail view (notes, tags, custom fields kept simple)
- [ ] Companies (auto-grouped by domain on save)
- [ ] Deals/pipelines — single pipeline, drag-between-stages
- [ ] Activity feed (every email send, every agent draft, every status change)
- [ ] Independent auth: Supabase email/password + magic link. Org/workspace model so multiple users per exchange.

## Phase 3 — Agent layer (week 3–5)

The differentiator. Three Inngest workflows:

- [ ] **Draft outbound** — given a saved contact + context, Claude drafts an opening email. Queued in an "Approval Inbox" UI. Human edits → send via Resend (or via Gmail API if connected).
- [ ] **Follow-up scheduler** — watches threads; if no reply in N days, drafts a follow-up. Same approval queue.
- [ ] **Reply triage** — incoming reply (Resend inbound webhook or Gmail push) → Claude classifies as: interested / not interested / question / meeting-request / unsubscribe. Meeting-request fires a notification + proposes 3 times from the user's Google Calendar free-busy.

Agents log every decision to the activity feed with the prompt + model output (auditability).

## Phase 4 — Polish & deploy (week 5+)

- [ ] Deploy to Vercel, Supabase, Inngest Cloud
- [ ] Sentry for errors, Axiom for structured logs
- [ ] Stripe billing if we ever sell this
- [ ] Onboarding flow + invite teammates

---

## What we are deliberately NOT building (yet)

- Mobile app
- Marketing-automation features (landing pages, forms, ads)
- A second pipeline / customizable pipelines
- Reporting dashboards beyond a single "this week's outreach" view
- API for third parties to integrate with NeilCRM
- Multi-tenant SaaS — single-org for now

These can come once the core loop works.
