import type { EnrichedContact, PeopleProvider } from "./types";

const APOLLO_BASE = "https://api.apollo.io/api/v1";
// Apollo's bulk_match accepts up to 10 records per call.
const BULK_LIMIT = 10;

interface ApolloOrg {
  name?: string | null;
  website_url?: string | null;
  primary_domain?: string | null;
  linkedin_url?: string | null;
  industry?: string | null;
  estimated_num_employees?: number | null;
  short_description?: string | null;
  keywords?: string[] | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
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

function domainOf(email: string): string | null {
  return email.split("@")[1]?.toLowerCase() ?? null;
}

function orgLocation(o: ApolloOrg): string | null {
  return [o.city, o.state, o.country].filter(Boolean).join(", ") || null;
}

function emptyContact(email: string): EnrichedContact {
  return {
    email,
    fullName: null,
    firstName: null,
    lastName: null,
    title: null,
    company: null,
    companyDomain: domainOf(email),
    linkedinUrl: null,
    location: null,
    industry: null,
    employeeCount: null,
    companyDescription: null,
    highlights: [],
    source: "apollo",
    raw: null,
    matched: false,
    companyMatched: false,
  };
}

function personToContact(person: ApolloPerson, requestedEmail: string): EnrichedContact {
  const org = person.organization;
  const domain =
    org?.primary_domain ||
    (org?.website_url ? safeHost(org.website_url) : null) ||
    domainOf(requestedEmail);

  const highlights = [
    person.headline,
    person.seniority ? `Seniority: ${person.seniority}` : null,
    org?.name ? `Company: ${org.name}` : null,
    org?.industry ? `Industry: ${org.industry}` : null,
  ].filter((x): x is string => Boolean(x));

  return {
    email: person.email || requestedEmail,
    fullName: person.name ?? null,
    firstName: person.first_name ?? null,
    lastName: person.last_name ?? null,
    title: person.title ?? null,
    company: org?.name ?? null,
    companyDomain: domain,
    linkedinUrl: person.linkedin_url ?? null,
    location: [person.city, person.state, person.country].filter(Boolean).join(", ") || null,
    industry: org?.industry ?? null,
    employeeCount: org?.estimated_num_employees ?? null,
    companyDescription: clip(org?.short_description),
    highlights,
    source: "apollo",
    raw: person,
    matched: true,
    companyMatched: Boolean(org?.name),
  };
}

function orgToContact(org: ApolloOrg | null, requestedEmail: string): EnrichedContact {
  const base = emptyContact(requestedEmail);
  if (!org?.name) return base;

  const highlights = [
    org.industry ? `Industry: ${org.industry}` : null,
    org.estimated_num_employees ? `~${org.estimated_num_employees} employees` : null,
    org.keywords?.length ? `Keywords: ${org.keywords.slice(0, 6).join(", ")}` : null,
    clip(org.short_description, 280),
  ].filter((x): x is string => Boolean(x));

  return {
    ...base,
    company: org.name,
    companyDomain: org.primary_domain || domainOf(requestedEmail),
    location: orgLocation(org),
    industry: org.industry ?? null,
    employeeCount: org.estimated_num_employees ?? null,
    companyDescription: clip(org.short_description),
    highlights,
    raw: org,
    matched: false, // we have the company, not the person
    companyMatched: true,
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function clip(s: string | null | undefined, n = 400): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isPlanGated(err: unknown): boolean {
  return err instanceof Error && err.message.includes("API_INACCESSIBLE");
}

export class ApolloProvider implements PeopleProvider {
  readonly name = "apollo" as const;
  // Free Apollo plans block person endpoints. Once we learn that, skip the
  // doomed person call and go straight to company enrichment.
  private personApiBlocked = false;

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("ApolloProvider: missing API key");
  }

  async enrichByEmails(emails: string[]): Promise<EnrichedContact[]> {
    const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (unique.length === 0) return [];

    if (!this.personApiBlocked) {
      try {
        const batches = chunk(unique, BULK_LIMIT);
        const results = await Promise.all(batches.map((b) => this.personBulkMatch(b)));
        return results.flat();
      } catch (err) {
        if (!isPlanGated(err)) throw err;
        // Free plan: fall back to company-level enrichment (still useful).
        this.personApiBlocked = true;
      }
    }

    return this.companyEnrich(unique);
  }

  private async personBulkMatch(emails: string[]): Promise<EnrichedContact[]> {
    const data = await this.post<{ matches?: (ApolloPerson | null)[] }>("people/bulk_match", {
      details: emails.map((email) => ({ email })),
    });
    const matches = data.matches ?? [];
    return emails.map((email, i) => {
      const m = matches[i];
      return m ? personToContact(m, email) : emptyContact(email);
    });
  }

  /** Company-by-domain enrichment — the free-plan path. One call per unique domain. */
  private async companyEnrich(emails: string[]): Promise<EnrichedContact[]> {
    const domains = [...new Set(emails.map(domainOf).filter((d): d is string => Boolean(d)))];
    const orgByDomain = new Map<string, ApolloOrg | null>();
    await Promise.all(
      domains.map(async (domain) => {
        try {
          const data = await this.post<{ organization?: ApolloOrg | null }>(
            "organizations/enrich",
            { domain },
          );
          orgByDomain.set(domain, data.organization ?? null);
        } catch {
          orgByDomain.set(domain, null); // one bad domain shouldn't sink the batch
        }
      }),
    );
    return emails.map((email) => orgToContact(orgByDomain.get(domainOf(email) ?? "") ?? null, email));
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${APOLLO_BASE}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Apollo ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }
}
