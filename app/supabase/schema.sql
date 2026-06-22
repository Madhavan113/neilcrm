-- NeilCRM schema for Supabase. Paste into Supabase → SQL Editor → Run.
-- This is the canonical schema (the original Drizzle schema was removed).
-- Idempotent: the reset block below drops NeilCRM's tables + types first, so the
-- whole file is safe to re-run. WARNING: that reset WIPES existing NeilCRM data —
-- fine for first-time setup; destructive once you have rows you care about.

-- ---- reset (CASCADE drops dependent FKs/indexes; order doesn't matter) ----
DROP TABLE IF EXISTS
  "activities","agent_drafts","reply_classifications","sequence_enrollments",
  "sequences","email_events","email_messages","email_threads","contacts",
  "companies","users","orgs" CASCADE;
DROP TYPE IF EXISTS
  "actor_type","contact_source","contact_status","message_direction","draft_kind",
  "draft_status","email_event_type","enrollment_status","reply_intent","thread_status" CASCADE;

CREATE TYPE "public"."actor_type" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."contact_source" AS ENUM('apollo', 'pdl', 'manual', 'imported');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('new', 'enriched', 'contacted', 'opened', 'clicked', 'replied', 'meeting', 'won', 'lost', 'unsubscribed', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."draft_kind" AS ENUM('first_touch', 'follow_up', 'reply');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('awaiting_approval', 'approved', 'edited', 'rejected', 'sent');--> statement-breakpoint
CREATE TYPE "public"."email_event_type" AS ENUM('queued', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'complained', 'unsubscribed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'completed', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."reply_intent" AS ENUM('interested', 'question', 'meeting_request', 'objection', 'not_interested', 'auto_reply', 'unsubscribe', 'other');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('open', 'replied', 'closed');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"verb" text NOT NULL,
	"subject_type" text,
	"subject_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"thread_id" uuid,
	"kind" "draft_kind" NOT NULL,
	"model" text,
	"prompt" text,
	"subject" text,
	"body_text" text,
	"status" "draft_status" DEFAULT 'awaiting_approval' NOT NULL,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"industry" text,
	"employee_count" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"company_id" uuid,
	"email" text NOT NULL,
	"full_name" text,
	"first_name" text,
	"last_name" text,
	"title" text,
	"linkedin_url" text,
	"location" text,
	"source" "contact_source" DEFAULT 'apollo' NOT NULL,
	"source_payload" jsonb,
	"status" "contact_status" DEFAULT 'new' NOT NULL,
	"tags" text[],
	"notes" text,
	"unsubscribed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"message_id" uuid,
	"contact_id" uuid,
	"type" "email_event_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"provider" text DEFAULT 'gmail' NOT NULL,
	"provider_message_id" text,
	"tracking_id" uuid DEFAULT gen_random_uuid(),
	"from_address" text,
	"to_address" text,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"agent_draft_id" uuid,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"subject" text,
	"provider" text DEFAULT 'gmail' NOT NULL,
	"provider_thread_id" text,
	"status" "thread_status" DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reply_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"intent" "reply_intent" NOT NULL,
	"confidence" integer,
	"summary" text,
	"proposed_action" jsonb,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"sequence_id" uuid NOT NULL,
	"thread_id" uuid,
	"current_step" integer DEFAULT 0 NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"next_action_at" timestamp with time zone,
	"paused_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"steps" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD CONSTRAINT "agent_drafts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD CONSTRAINT "agent_drafts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD CONSTRAINT "agent_drafts_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD CONSTRAINT "agent_drafts_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_classifications" ADD CONSTRAINT "reply_classifications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reply_classifications" ADD CONSTRAINT "reply_classifications_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_org_time_idx" ON "activities" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "drafts_org_status_idx" ON "agent_drafts" USING btree ("org_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_org_domain_uq" ON "companies" USING btree ("org_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_org_email_uq" ON "contacts" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "contacts_org_status_activity_idx" ON "contacts" USING btree ("org_id","status","last_activity_at");--> statement-breakpoint
CREATE INDEX "events_org_contact_time_idx" ON "email_events" USING btree ("org_id","contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "events_message_type_idx" ON "email_events" USING btree ("message_id","type");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "email_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_tracking_uq" ON "email_messages" USING btree ("tracking_id");--> statement-breakpoint
CREATE INDEX "threads_org_contact_last_idx" ON "email_threads" USING btree ("org_id","contact_id","last_message_at");--> statement-breakpoint
CREATE INDEX "enrollments_due_idx" ON "sequence_enrollments" USING btree ("org_id","status","next_action_at");

-- Lock down every table: RLS on, no policies => only the server-side
-- secret key (which bypasses RLS) can access data. Add per-org policies in the auth phase.
ALTER TABLE public."orgs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."email_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."email_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."email_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sequence_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reply_classifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."activities" ENABLE ROW LEVEL SECURITY;
