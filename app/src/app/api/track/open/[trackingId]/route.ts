import { trackingPixel } from "@/lib/email/tracking";
import { recordEmailEvent } from "@/lib/email/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache an open beacon

const PIXEL_HEADERS = {
  "Content-Type": "image/gif",
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
} as const;

export async function GET(req: Request, ctx: { params: Promise<{ trackingId: string }> }) {
  const { trackingId } = await ctx.params;

  // Best-effort: a tracking/DB failure must never break the image response.
  try {
    await recordEmailEvent(trackingId, "opened", {
      userAgent: req.headers.get("user-agent") ?? null,
    });
  } catch {
    /* swallow — still serve the pixel below */
  }

  return new Response(trackingPixel(), { headers: PIXEL_HEADERS });
}
