// Data-source abstraction. Apollo is the only adapter today; PDL slots in later
// behind this same interface (see docs/SEARCH_API_RESEARCH.md).

export type ContactSource = "apollo" | "pdl" | "manual";

/** A person resolved + enriched from an email address. */
export interface EnrichedContact {
  email: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
  companyDomain: string | null;
  linkedinUrl: string | null;
  location: string | null;
  /** Free-form signals we can feed the drafting model (seniority, industry, headline). */
  highlights: string[];
  source: ContactSource;
  /** Raw provider payload, kept for auditing / later persistence. */
  raw: unknown;
  /** False when the provider had no match for this email (we still echo the address). */
  matched: boolean;
}

export interface PeopleProvider {
  readonly name: ContactSource;
  /** Resolve many emails at once. Order of results is not guaranteed; key by email. */
  enrichByEmails(emails: string[]): Promise<EnrichedContact[]>;
}
