# NeilCRM — Architecture & Stack

## Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript | One framework, server components keep most data-fetching off the client, easy Vercel deploy |
| UI | Tailwind CSS + shadcn/ui | Fast to build, no design lock-in (copy-in components, customize freely) |
| Backend | Next.js Route Handlers + Server Actions | No second service to run. Push to Vercel = backend deployed |
| Database | Postgres via Supabase | Postgres is the right call for relational CRM data. Supabase bundles auth, RLS, storage |
| ORM | Drizzle | Type-safe, lightweight, SQL-first (vs. Prisma's heavier abstraction) |
| Auth | Supabase Auth (email/password + magic link) | Independent of Google/Microsoft SSO. Multi-user via Supabase Organizations pattern |
| Primary people search | **People Data Labs** | 1.5B profiles, $0.01/record, raw API, SQL-like filters — best for infra-vertical filtering |
| Secondary enrichment | **Apollo.io** | Cheaper email/phone verification; fallback when PDL doesn't have a contact |
| LLM | Anthropic Claude API | Sonnet 4.6 for drafting, Opus 4.7 for reply classification and tool-use planning |
| Agent orchestration | Inngest | Event-driven, durable execution, free tier covers MVP, great DX for HITL approval gates |
| Outbound email | Resend (default) or Gmail API (per-user OAuth) | Resend for the system mailbox; Gmail when we want the user's own address as the "from" |
| Inbound email | Resend inbound webhooks or Gmail Pub/Sub | Mirrors send choice |
| Calendar | Google Calendar API (OAuth) | Read free/busy, draft event invites |
| Hosting | Vercel + Supabase + Inngest Cloud | Three managed services. No infra to babysit |
| Observability | Sentry (errors), Axiom (logs) | Wired up Phase 4 |

## Why this stack vs alternatives

**Why not FastAPI + React separately?** Two deploys, two languages, more glue code. The CRM doesn't have CPU-bound Python workloads that would justify the split.

**Why Supabase over Clerk + Neon?** Clerk has better UX but charges per MAU. Supabase Auth is "good enough" and bundling auth with the DB simplifies row-level security policies (org_id scoping).

**Why Inngest over BullMQ/Trigger.dev?** Inngest's step-function model is *purpose-built* for agent workflows with human-approval gates — `step.waitForEvent("user.approved-draft")` is exactly what we need. BullMQ would force us to roll our own state machine.

**Why PDL over Apollo as primary?** Apollo bundles outreach features we'd be paying for and not using. PDL is pure data, cheaper per-record, and its query language lets us write *infra-specific* filters (job titles matching `^(VP|Director|Head) of (Infrastructure|Data Center|Network|Capacity)`, company-keyword "colocation OR fiber OR hyperscale OR substation"). Apollo is the secondary because its outreach-quality emails are slightly better when PDL gives us a person without one.

**Why not just HeroHunt?** HeroHunt is the "agent-native search" option and might be a faster Phase-1 win, but it bundles too much of the agent layer — we'd lose the ability to design our own HITL flow. Keep it on the bench as a fallback if PDL's natural-language wrapper proves slow to build.

## High-level flow

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Search Page    │───▶│  /api/search     │───▶│  PDL API         │
│  (NL query)     │    │  Claude → query  │    └──────────────────┘
└─────────────────┘    └──────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Save selected   │──▶ Postgres (contacts)
                       └──────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Inngest event:  │
                       │  contact.added   │
                       └──────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Agent: draft    │──▶ Approval Inbox
                       │  outbound        │     (human edits + sends)
                       └──────────────────┘
                              │
                              ▼
                       ┌──────────────────┐    ┌──────────────────┐
                       │  Resend / Gmail  │───▶│  Reply lands     │
                       └──────────────────┘    │  inbound webhook │
                                                └──────────────────┘
                                                         │
                                                         ▼
                                                ┌──────────────────┐
                                                │ Agent: classify  │
                                                │ → schedule/follow│
                                                │   up/notify      │
                                                └──────────────────┘
```

## Repository layout (target)

```
neilcrm/
├── README.md
├── docs/
│   ├── PLAN.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   └── SEARCH_API_RESEARCH.md
├── app/                          # Next.js app (created by create-next-app)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── search/
│   │   │   │   ├── contacts/
│   │   │   │   ├── sequences/
│   │   │   │   └── inbox/
│   │   │   └── api/
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── db/               # Drizzle schema + queries
│   │   │   ├── search/           # PDL + Apollo clients
│   │   │   ├── agents/           # Claude prompts, Inngest fns
│   │   │   ├── email/            # Resend + Gmail adapters
│   │   │   └── auth/             # Supabase server/client helpers
│   ├── drizzle/                  # migrations
│   ├── package.json
│   └── .env.local                # NOT committed
└── scripts/
    └── seed.ts
```
