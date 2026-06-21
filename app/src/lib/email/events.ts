import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type EmailEventType =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "replied"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | "failed";

// Engagement statuses an open/click may advance a contact INTO, and the earlier
// statuses they're allowed to advance FROM (never downgrade replied/converted).
const ADVANCEABLE_FROM = ["new", "enriched", "contacted", "opened"];

/**
 * Record an engagement event for the message identified by its tracking id.
 * Best-effort: callers wrap this so a tracking failure NEVER breaks the
 * user-facing pixel/redirect. Returns false if the message isn't found.
 */
export async function recordEmailEvent(
  trackingId: string,
  type: EmailEventType,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const sb = getSupabaseAdmin();

  const { data: msg, error } = await sb
    .from("email_messages")
    .select("id, org_id, contact_id")
    .eq("tracking_id", trackingId)
    .maybeSingle();
  if (error) throw error;
  if (!msg) return false;

  const { error: insertErr } = await sb.from("email_events").insert({
    org_id: msg.org_id,
    message_id: msg.id,
    contact_id: msg.contact_id,
    type,
    metadata: metadata ?? null,
  });
  if (insertErr) throw insertErr;

  if (!msg.contact_id) return true;

  // Always bump recency.
  await sb
    .from("contacts")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", msg.contact_id);

  // Advance engagement status, but only from earlier stages — an open/click
  // must never downgrade a contact who already replied / booked / converted.
  const nextStatus = type === "clicked" ? "clicked" : type === "opened" ? "opened" : null;
  if (nextStatus) {
    await sb
      .from("contacts")
      .update({ status: nextStatus })
      .eq("id", msg.contact_id)
      .in("status", ADVANCEABLE_FROM);
  }
  return true;
}
