import { ApolloProvider } from "./apollo";
import { TtlCache } from "./cache";
import type { EnrichedContact, PeopleProvider } from "./types";

export type { EnrichedContact, PeopleProvider, ContactSource } from "./types";

// 24h: enrichment data is stable enough day-to-day, and this is what makes
// repeat lookups instant. See cache.ts for the multi-instance caveat.
const ENRICH_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new TtlCache<EnrichedContact>(ENRICH_TTL_MS);

let provider: PeopleProvider | null = null;

/** Returns the configured people provider (Apollo today). */
export function getPeopleProvider(): PeopleProvider {
  if (provider) return provider;
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    throw new Error(
      "APOLLO_API_KEY is not set. Add it to app/.env.local to enable enrichment.",
    );
  }
  provider = new ApolloProvider(key);
  return provider;
}

/**
 * Enrich emails with a read-through cache: cached addresses return instantly,
 * only the misses hit the provider, and fresh results are written back.
 */
export async function enrichEmails(emails: string[]): Promise<EnrichedContact[]> {
  const normalized = [
    ...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  ];

  const hits: EnrichedContact[] = [];
  const misses: string[] = [];
  for (const email of normalized) {
    const cached = cache.get(email);
    if (cached) hits.push(cached);
    else misses.push(email);
  }

  let fetched: EnrichedContact[] = [];
  if (misses.length > 0) {
    fetched = await getPeopleProvider().enrichByEmails(misses);
    for (const c of fetched) cache.set(c.email.toLowerCase(), c);
  }

  // Preserve the caller's input order.
  const byEmail = new Map<string, EnrichedContact>();
  for (const c of [...hits, ...fetched]) byEmail.set(c.email.toLowerCase(), c);
  return normalized.map(
    (email) =>
      byEmail.get(email) ?? {
        email,
        fullName: null,
        firstName: null,
        lastName: null,
        title: null,
        company: null,
        companyDomain: email.split("@")[1] ?? null,
        linkedinUrl: null,
        location: null,
        highlights: [],
        source: "apollo" as const,
        raw: null,
        matched: false,
      },
  );
}
