import type { EnrichedContact, PeopleProvider } from "./types";

const APOLLO_BASE = "https://api.apollo.io/api/v1";
// Apollo's bulk_match accepts up to 10 records per call.
const BULK_LIMIT = 10;

interface ApolloOrg {
  name?: string | null;
  website_url?: string | null;
  primary_domain?: string | null;
}

interface ApolloPerson {
  email?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  headline?: string | null;
  linkedin_url?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  seniority?: string | null;
  organization?: ApolloOrg | null;
}

function domainFrom(person: ApolloPerson, requestedEmail: string): string | null {
  const org = person.organization;
  if (org?.primary_domain) return org.primary_domain;
  if (org?.website_url) {
    try {
      return new URL(org.website_url).hostname.replace(/^www\./, "");
    } catch {
      /* fall through */
    }
  }
  const at = requestedEmail.split("@")[1];
  return at ?? null;
}

function locationFrom(p: ApolloPerson): string | null {
  return [p.city, p.state, p.country].filter(Boolean).join(", ") || null;
}

function toContact(person: ApolloPerson | null, requestedEmail: string): EnrichedContact {
  if (!person) {
    return {
      email: requestedEmail,
      fullName: null,
      firstName: null,
      lastName: null,
      title: null,
      company: null,
      companyDomain: requestedEmail.split("@")[1] ?? null,
      linkedinUrl: null,
      location: null,
      highlights: [],
      source: "apollo",
      raw: null,
      matched: false,
    };
  }

  const highlights = [
    person.headline,
    person.seniority ? `Seniority: ${person.seniority}` : null,
    person.organization?.name ? `Company: ${person.organization.name}` : null,
  ].filter((x): x is string => Boolean(x));

  return {
    email: person.email || requestedEmail,
    fullName: person.name ?? null,
    firstName: person.first_name ?? null,
    lastName: person.last_name ?? null,
    title: person.title ?? null,
    company: person.organization?.name ?? null,
    companyDomain: domainFrom(person, requestedEmail),
    linkedinUrl: person.linkedin_url ?? null,
    location: locationFrom(person),
    highlights,
    source: "apollo",
    raw: person,
    matched: true,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class ApolloProvider implements PeopleProvider {
  readonly name = "apollo" as const;

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("ApolloProvider: missing API key");
  }

  async enrichByEmails(emails: string[]): Promise<EnrichedContact[]> {
    const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (unique.length === 0) return [];

    // Fire all bulk batches concurrently — keeps a large paste fast.
    const batches = chunk(unique, BULK_LIMIT);
    const results = await Promise.all(batches.map((b) => this.bulkMatch(b)));
    return results.flat();
  }

  private async bulkMatch(emails: string[]): Promise<EnrichedContact[]> {
    const res = await fetch(`${APOLLO_BASE}/people/bulk_match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({ details: emails.map((email) => ({ email })) }),
      // Don't let Next cache this at the fetch layer — we cache deliberately upstream.
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Apollo bulk_match ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as { matches?: (ApolloPerson | null)[] };
    const matches = data.matches ?? [];
    // Apollo returns matches positionally aligned to the request order.
    return emails.map((email, i) => toContact(matches[i] ?? null, email));
  }
}
