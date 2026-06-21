import { NextResponse } from "next/server";
import { z } from "zod";
import { enrichEmails } from "@/lib/people";

export const runtime = "nodejs";

const Body = z.object({
  emails: z.array(z.string()).min(1).max(50),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Expected { emails: string[] } (1-50)." }, { status: 400 });
  }

  try {
    const contacts = await enrichEmails(parsed.emails);
    return NextResponse.json({ contacts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Enrichment failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
