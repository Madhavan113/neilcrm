import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Conventions (see docs/DATA_MODEL.md): snake_case, uuid PKs, timestamps on every
// table, org_id on everything for a future multi-tenant seam.

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

// ---- enums ----------------------------------------------------------------

export const contactSourceEnum = pgEnum("contact_source", ["apollo", "pdl", "manual", "imported"]);
export const contactStatusEnum = pgEnum("contact_status", [
  "new",
  "enriched",
  "contacted",
  "opened",
  "clicked",
  "replied",
  "meeting",
  "won",
  "lost",
  "unsubscribed",
  "bounced",
]);
export const threadStatusEnum = pgEnum("thread_status", ["open", "replied", "closed"]);
export const directionEnum = pgEnum("message_direction", ["outbound", "inbound"]);
export const emailEventTypeEnum = pgEnum("email_event_type", [
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "bounced",
  "complained",
  "unsubscribed",
  "failed",
]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "active",
  "paused",
  "completed",
  "stopped",
]);
export const replyIntentEnum = pgEnum("reply_intent", [
  "interested",
  "question",
  "meeting_request",
  "objection",
  "not_interested",
  "auto_reply",
  "unsubscribe",
  "other",
]);
export const draftKindEnum = pgEnum("draft_kind", ["first_touch", "follow_up", "reply"]);
export const draftStatusEnum = pgEnum("draft_status", [
  "awaiting_approval",
  "approved",
  "edited",
  "rejected",
  "sent",
]);
export const actorTypeEnum = pgEnum("actor_type", ["user", "agent", "system"]);

// ---- org / users ----------------------------------------------------------

export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  email: text("email").notNull(),
  fullName: text("full_name"),
  role: text("role").notNull().default("member"), // owner | member
  createdAt: createdAt(),
});

// ---- people ---------------------------------------------------------------

export const companies = pgTable(
  "companies",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    name: text("name").notNull(),
    domain: text("domain"),
    industry: text("industry"),
    employeeCount: integer("employee_count"),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("companies_org_domain_uq").on(t.orgId, t.domain)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    companyId: uuid("company_id").references(() => companies.id),
    email: text("email").notNull(),
    fullName: text("full_name"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    title: text("title"),
    linkedinUrl: text("linkedin_url"),
    location: text("location"),
    source: contactSourceEnum("source").notNull().default("apollo"),
    sourcePayload: jsonb("source_payload"),
    status: contactStatusEnum("status").notNull().default("new"),
    tags: text("tags").array(),
    notes: text("notes"),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("contacts_org_email_uq").on(t.orgId, t.email),
    index("contacts_org_status_activity_idx").on(t.orgId, t.status, t.lastActivityAt),
  ],
);

// ---- messaging ------------------------------------------------------------

export const emailThreads = pgTable(
  "email_threads",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    subject: text("subject"),
    provider: text("provider").notNull().default("gmail"),
    providerThreadId: text("provider_thread_id"),
    status: threadStatusEnum("status").notNull().default("open"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("threads_org_contact_last_idx").on(t.orgId, t.contactId, t.lastMessageAt)],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    threadId: uuid("thread_id").notNull().references(() => emailThreads.id),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    direction: directionEnum("direction").notNull(),
    provider: text("provider").notNull().default("gmail"),
    providerMessageId: text("provider_message_id"),
    // Opaque id embedded in the pixel + wrapped links to attribute opens/clicks.
    trackingId: uuid("tracking_id").defaultRandom(),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    agentDraftId: uuid("agent_draft_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_thread_idx").on(t.threadId),
    uniqueIndex("messages_tracking_uq").on(t.trackingId),
  ],
);

// ---- engagement / conversion tracking -------------------------------------

export const emailEvents = pgTable(
  "email_events",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    messageId: uuid("message_id").references(() => emailMessages.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    type: emailEventTypeEnum("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata"), // clicked url, coarse user-agent, bounce reason
    createdAt: createdAt(),
  },
  (t) => [
    index("events_org_contact_time_idx").on(t.orgId, t.contactId, t.occurredAt),
    index("events_message_type_idx").on(t.messageId, t.type),
  ],
);

// ---- follow-up sequences --------------------------------------------------

export const sequences = pgTable("sequences", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  name: text("name").notNull(),
  steps: jsonb("steps").notNull(), // [{ day_offset, kind, prompt_template }]
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    sequenceId: uuid("sequence_id").notNull().references(() => sequences.id),
    threadId: uuid("thread_id").references(() => emailThreads.id),
    currentStep: integer("current_step").notNull().default(0),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    pausedReason: text("paused_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // The follow-up worker polls this: "active enrollments whose next_action_at is due".
  (t) => [index("enrollments_due_idx").on(t.orgId, t.status, t.nextActionAt)],
);

// ---- HITL drafting + inbound classification -------------------------------

export const agentDrafts = pgTable(
  "agent_drafts",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    contactId: uuid("contact_id").notNull().references(() => contacts.id),
    threadId: uuid("thread_id").references(() => emailThreads.id),
    kind: draftKindEnum("kind").notNull(),
    model: text("model"),
    prompt: text("prompt"),
    subject: text("subject"),
    bodyText: text("body_text"),
    status: draftStatusEnum("status").notNull().default("awaiting_approval"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("drafts_org_status_idx").on(t.orgId, t.status, t.createdAt)],
);

export const replyClassifications = pgTable("reply_classifications", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  messageId: uuid("message_id").notNull().references(() => emailMessages.id),
  intent: replyIntentEnum("intent").notNull(),
  confidence: integer("confidence"), // 0-100
  summary: text("summary"),
  proposedAction: jsonb("proposed_action"), // the structured next step the human approves
  model: text("model"),
  createdAt: createdAt(),
});

// ---- audit feed -----------------------------------------------------------

export const activities = pgTable(
  "activities",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: uuid("actor_id"),
    verb: text("verb").notNull(),
    subjectType: text("subject_type"),
    subjectId: uuid("subject_id"),
    payload: jsonb("payload"),
    createdAt: createdAt(),
  },
  (t) => [index("activities_org_time_idx").on(t.orgId, t.createdAt)],
);
