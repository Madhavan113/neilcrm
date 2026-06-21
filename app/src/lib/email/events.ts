import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { emailMessages, emailEvents, contacts } from "@/lib/db/schema";

type EventType = (typeof emailEvents.type.enumValues)[number];

/**
 * Record an engagement event for the message identified by its tracking id.
 * Best-effort: callers wrap this so a tracking failure NEVER breaks the
 * user-facing pixel/redirect. Returns false if the message isn't found or the
 * DB isn't configured yet.
 */
export async function recordEmailEvent(
  trackingId: string,
  type: EventType,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  const db = getDb();
  const [msg] = await db
    .select({ id: emailMessages.id, orgId: emailMessages.orgId, contactId: emailMessages.contactId })
    .from(emailMessages)
    .where(eq(emailMessages.trackingId, trackingId))
    .limit(1);
  if (!msg) return false;

  await db.insert(emailEvents).values({
    orgId: msg.orgId,
    messageId: msg.id,
    contactId: msg.contactId,
    type,
    metadata: metadata ?? null,
  });

  // Always bump recency.
  await db.update(contacts).set({ lastActivityAt: new Date() }).where(eq(contacts.id, msg.contactId));

  // Advance engagement status, but only from earlier stages — an open/click must
  // never downgrade a contact who already replied / booked / converted.
  const nextStatus = type === "clicked" ? "clicked" : type === "opened" ? "opened" : null;
  if (nextStatus) {
    await db
      .update(contacts)
      .set({ status: nextStatus })
      .where(
        and(
          eq(contacts.id, msg.contactId),
          inArray(contacts.status, ["new", "enriched", "contacted", "opened"]),
        ),
      );
  }
  return true;
}
