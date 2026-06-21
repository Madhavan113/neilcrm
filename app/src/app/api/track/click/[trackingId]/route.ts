import { NextResponse } from "next/server";
import { recordEmailEvent } from "@/lib/email/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await ctx.params;
  const target = new URL(req.url).searchParams.get("u");

  // Only redirect to absolute http(s) targets — never an open redirect to junk.
  let dest: string | null = null;
  if (target) {
    try {
      const u = new URL(target);
      if (u.protocol === "http:" || u.protocol === "https:") dest = u.toString();
    } catch {
      /* invalid target */
    }
  }
  if (!dest) return new Response("Bad tracking link", { status: 400 });

  try {
    await recordEmailEvent(trackingId, "clicked", {
      url: dest,
      userAgent: req.headers.get("user-agent") ?? null,
    });
  } catch {
    /* swallow — still redirect below */
  }

  return NextResponse.redirect(dest, 302);
}
