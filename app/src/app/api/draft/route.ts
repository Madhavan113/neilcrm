import { z } from "zod";
import { streamDraft } from "@/lib/ai/draft";
import type { EnrichedContact } from "@/lib/people/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ContactSchema = z.object({
  email: z.string(),
  fullName: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  companyDomain: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  location: z.string().nullable(),
  industry: z.string().nullable(),
  employeeCount: z.number().nullable(),
  companyDescription: z.string().nullable(),
  highlights: z.array(z.string()),
  source: z.enum(["apollo", "pdl", "manual"]),
  raw: z.unknown(),
  matched: z.boolean(),
  companyMatched: z.boolean(),
});

const Body = z.object({
  contact: ContactSchema,
  senderContext: z.string().default(""),
  steering: z.string().optional(),
  previousDraft: z.string().optional(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      "ANTHROPIC_API_KEY is not set. Add it to app/.env.local to enable drafting.",
      { status: 502 },
    );
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = streamDraft({
      contact: parsed.contact as EnrichedContact,
      senderContext: parsed.senderContext,
      steering: parsed.steering,
      previousDraft: parsed.previousDraft,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Drafting failed";
    return new Response(message, { status: 502 });
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
