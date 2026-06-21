# NeilCRM — Data Model (sketch)

Goal: minimal schema for Phase 1–3. Drizzle conventions, snake_case, UUID PKs, `created_at`/`updated_at` on every table. All tables scoped by `org_id` so we can add multi-tenancy later without a migration.

## Core entities

### `orgs`
- `id`, `name`, `slug`, `created_at`

### `users`
- `id`, `org_id`, `email`, `full_name`, `role` (`owner` | `member`), `created_at`
- Auth identity comes from Supabase `auth.users`; this table is the app-side profile.

### `companies`
- `id`, `org_id`, `name`, `domain`, `industry`, `employee_count`, `metadata` (jsonb — raw PDL company blob), `created_at`, `updated_at`
- Auto-grouped: when a contact is saved, derive/upsert company by email domain.

### `contacts`
- `id`, `org_id`, `company_id` (nullable), `full_name`, `email`, `phone`, `title`, `linkedin_url`
- `source` (`pdl` | `apollo` | `manual` | `imported`), `source_record_id`, `source_payload` (jsonb)
- `status` (`new` | `contacted` | `replied` | `qualified` | `disqualified`)
- `tags` (text[]), `notes` (markdown), `last_activity_at`
- `created_by`, `created_at`, `updated_at`

### `search_queries`
- `id`, `org_id`, `user_id`, `nl_query` (text), `compiled_query` (jsonb — what we sent to PDL), `result_count`, `created_at`
- Useful for auditing + caching + improving the NL→query prompt over time.

## CRM workflow entities

### `deals`
- `id`, `org_id`, `name`, `company_id`, `primary_contact_id`, `stage`, `value_cents`, `currency`, `expected_close_at`, `owner_user_id`, `created_at`, `updated_at`
- Single hardcoded pipeline for MVP: `new` → `qualified` → `proposal` → `negotiation` → `won` | `lost`.

### `activities`
- `id`, `org_id`, `actor_type` (`user` | `agent` | `system`), `actor_id` (nullable), `verb` (`saved_contact` | `drafted_email` | `sent_email` | `received_reply` | `classified_reply` | `proposed_meeting` | `stage_changed` | ...), `subject_type` (`contact` | `deal` | `email`), `subject_id`, `payload` (jsonb), `created_at`
- Append-only feed. Powers the timeline view + agent audit log.

## Agent / messaging entities

### `email_threads`
- `id`, `org_id`, `contact_id`, `subject`, `provider` (`resend` | `gmail`), `provider_thread_id`, `last_message_at`, `status` (`open` | `replied` | `closed`), `created_at`

### `email_messages`
- `id`, `thread_id`, `direction` (`outbound` | `inbound`), `from_address`, `to_address`, `body_html`, `body_text`, `agent_draft_id` (nullable — links to the draft this came from), `sent_at`, `received_at`
- `provider_message_id` (Gmail message id), `tracking_id` (uuid embedded in the pixel + wrapped links so we can attribute opens/clicks back to this exact message)

### `agent_drafts`
- `id`, `org_id`, `contact_id`, `thread_id` (nullable for first-touch), `kind` (`first_touch` | `follow_up` | `reply`), `model` (`sonnet-4-6` | `opus-4-7`), `prompt` (text), `body_markdown` (text), `status` (`awaiting_approval` | `approved` | `edited` | `rejected` | `sent`), `created_by_agent_run_id`, `reviewed_by_user_id` (nullable), `reviewed_at`, `created_at`

### `agent_runs`
- `id`, `org_id`, `inngest_run_id`, `workflow` (`draft_outbound` | `follow_up` | `triage_reply`), `input` (jsonb), `output` (jsonb), `status`, `started_at`, `finished_at`
- One row per Inngest function invocation. Lets us replay/debug agent decisions.

### `reply_classifications`
- `id`, `email_message_id`, `intent` (`interested` | `not_interested` | `question` | `meeting_request` | `objection` | `auto_reply` | `unsubscribe` | `other`), `confidence`, `summary` (one-line gist), `proposed_action` (jsonb — the structured next step the human approves), `model`, `created_at`

## Engagement, follow-ups & structured response (added 2026-06-21)

The differentiator is closing the loop: know when a prospect engages, follow up
automatically until they reply, and respond to inbound in a structured, human-approved
way. These entities power that.

### `email_events` — the engagement/conversion signal
- `id`, `org_id`, `message_id`, `contact_id`, `type` (`queued` | `sent` | `delivered` | `opened` | `clicked` | `replied` | `bounced` | `complained` | `unsubscribed` | `failed`), `occurred_at`, `metadata` (jsonb — clicked URL, coarse user-agent/IP, bounce reason), `created_at`
- Append-only. `opened` comes from the tracking pixel, `clicked` from the link redirector, `replied` from inbound ingestion. This table is what conversion reporting + "should I follow up?" decisions read from.
- **Caveat to encode in product logic:** Apple Mail Privacy Protection pre-fetches the pixel, so a raw `opened` can be a machine open. Treat opens as a soft signal; weight clicks and replies higher.

### `sequences` — a named follow-up cadence
- `id`, `org_id`, `name`, `steps` (jsonb — `[{ day_offset, kind: 'follow_up', prompt_template }]`), `active`, `created_at`, `updated_at`

### `sequence_enrollments` — a contact moving through a sequence
- `id`, `org_id`, `contact_id`, `sequence_id`, `thread_id` (nullable), `current_step`, `status` (`active` | `paused` | `completed` | `stopped`), `next_action_at`, `paused_reason`, `created_at`, `updated_at`
- A reply or unsubscribe flips status to `paused`/`stopped` so we never follow up after someone engages. The follow-up worker (Inngest) wakes on `next_action_at`, drafts the next step into the approval queue, and advances `current_step`.

### `reply_classifications` (expanded — see below)
- Inbound replies are classified, then routed to a structured response. Intents drive a playbook: `meeting_request` → propose times; `question` → draft an answer; `objection` → draft a rebuttal; `unsubscribe` → suppress + stop sequence.

## Indexes (initial)
- `email_events(org_id, contact_id, occurred_at desc)`, `email_events(message_id, type)`
- `sequence_enrollments(org_id, status, next_action_at)` — the follow-up worker's poll query

- `contacts(org_id, status, last_activity_at desc)`
- `contacts(org_id, email)` unique
- `email_threads(org_id, contact_id, last_message_at desc)`
- `activities(org_id, created_at desc)`
- `agent_drafts(org_id, status, created_at desc)`

## What's missing on purpose

No `pipelines` table — single hardcoded pipeline. No `custom_fields` table — we have `metadata` jsonb columns where needed. No `tasks` table for human todos — out of scope until people ask for it. No `attachments` — out of scope.
