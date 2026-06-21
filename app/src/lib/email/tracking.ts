// Open + click tracking for outbound email.
//
// Gmail's API can't tell us when a recipient reads a message, so we embed a 1x1
// pixel (open) and rewrite links through a redirector (click). Both carry the
// message's tracking_id so events attribute back to the exact send.
//
// Caveat baked into how we *interpret* this downstream: Apple Mail Privacy
// Protection pre-fetches the pixel, so an `opened` event can be a machine open.
// Treat opens as a soft signal; weight clicks and replies higher.

// 43-byte fully transparent 1x1 GIF.
const PIXEL_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function trackingPixel(): Uint8Array<ArrayBuffer> {
  // new Uint8Array(ArrayLike) copies into a fresh (non-shared) ArrayBuffer,
  // which is what Response/Blob's BodyInit types require.
  return new Uint8Array(Buffer.from(PIXEL_BASE64, "base64"));
}

export interface InjectOptions {
  /** Absolute origin of this app, e.g. https://app.neilcrm.com (NEXT_PUBLIC_APP_URL). */
  baseUrl: string;
  trackingId: string;
}

function openPixelTag({ baseUrl, trackingId }: InjectOptions): string {
  const src = `${baseUrl}/api/track/open/${trackingId}`;
  return `<img src="${src}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px" />`;
}

/** Wrap http(s) links so clicks redirect through our tracker. Leaves mailto:/anchors alone. */
function wrapLinks(html: string, { baseUrl, trackingId }: InjectOptions): string {
  return html.replace(
    /(<a\b[^>]*?\bhref=")(https?:\/\/[^"]+)(")/gi,
    (_m, pre: string, url: string, post: string) => {
      const wrapped = `${baseUrl}/api/track/click/${trackingId}?u=${encodeURIComponent(url)}`;
      return `${pre}${wrapped}${post}`;
    },
  );
}

/** Inject click-tracking + the open pixel into an outbound HTML body. */
export function injectTracking(html: string, opts: InjectOptions): string {
  const withLinks = wrapLinks(html, opts);
  const pixel = openPixelTag(opts);
  // Place the pixel just before </body> if present, else append.
  return /<\/body>/i.test(withLinks)
    ? withLinks.replace(/<\/body>/i, `${pixel}</body>`)
    : `${withLinks}${pixel}`;
}
