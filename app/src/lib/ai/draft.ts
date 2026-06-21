import Anthropic from "@anthropic-ai/sdk";
import type { EnrichedContact } from "@/lib/people/types";

// The CRM is for an infrastructure exchange (data center, power, fiber, colo).
// Drafts are first-touch outreach the human will review/edit before sending —
// Monaco-style human-in-the-loop. Never auto-send.
const SYSTEM_PROMPT = `You are the outreach copywriter inside NeilCRM, an AI sales CRM for an infrastructure exchange that connects operators across data centers, power, fiber, and colocation.

You write concise, high-signal first-touch cold emails that a real operator would actually reply to. Rules:
- Lead with relevance to THIS person and their company, not with us. One sharp, specific opener.
- Plain, direct language. No corporate filler, no "I hope this email finds you well", no emoji, no exclamation marks.
- 90-130 words for the body. Short paragraphs. One clear ask (usually a brief call).
- Personalize from the contact's role, company, and any signals provided. If a fact isn't given, do NOT invent it.
- Respect the sender's context and offer exactly as given.

ALWAYS respond in this exact format and nothing else:
Subject: <a specific, lowercase-ish, non-spammy subject line under 60 chars>

<email body, no signature block — the sending account adds that>

Then obey any extra steering instructions from the user. Steering overrides the defaults above (tone, length, angle) when they conflict.`;

export interface DraftParams {
  contact: EnrichedContact;
  /** Who is sending and what they're offering — the "semi-curated" base context. */
  senderContext: string;
  /** Free-form instruction from the operator to steer the draft (the prompt box). */
  steering?: string;
  /** When regenerating/refining, the prior draft the user is iterating on. */
  previousDraft?: string;
}

function contactBlock(c: EnrichedContact): string {
  const lines = [
    `Email: ${c.email}`,
    c.fullName && `Name: ${c.fullName}`,
    c.title && `Title: ${c.title}`,
    c.company && `Company: ${c.company}`,
    c.location && `Location: ${c.location}`,
    c.linkedinUrl && `LinkedIn: ${c.linkedinUrl}`,
    c.highlights.length > 0 && `Signals: ${c.highlights.join("; ")}`,
  ].filter(Boolean);
  if (!c.matched) {
    lines.push(
      "(No enrichment match — only the email/domain is known. Keep it light and don't fabricate personal details.)",
    );
  }
  return lines.join("\n");
}

function buildUserMessage(params: DraftParams): string {
  const parts = [
    "## Recipient",
    contactBlock(params.contact),
    "",
    "## Sender context (who we are / what we offer)",
    params.senderContext.trim() || "(none provided — keep the offer generic but credible)",
  ];

  if (params.previousDraft?.trim()) {
    parts.push(
      "",
      "## Previous draft (revise this rather than starting over)",
      params.previousDraft.trim(),
    );
  }

  parts.push(
    "",
    "## Steering instructions",
    params.steering?.trim() || "(none — use your defaults)",
    "",
    "Write the email now.",
  );

  return parts.join("\n");
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}

/**
 * Streams a draft email as plain UTF-8 text chunks (Subject line + body).
 * Returns a web ReadableStream suitable for a streaming Response.
 */
export function streamDraft(params: DraftParams): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const stream = getClient().messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" }, // drafting is light; medium keeps it snappy
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(params) }],
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
    cancel() {
      stream.abort();
    },
  });
}
