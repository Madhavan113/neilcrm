"use client";

import { useEffect, useRef, useState } from "react";
import type { EnrichedContact } from "@/lib/people/types";

const SENDER_KEY = "neilcrm.senderContext";

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

export default function ComposePage() {
  const [emailsRaw, setEmailsRaw] = useState("");
  const [senderContext, setSenderContext] = useState("");
  const [contacts, setContacts] = useState<EnrichedContact[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const [steering, setSteering] = useState("");
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Persist the sender context — it rarely changes between sessions.
  useEffect(() => {
    const saved = localStorage.getItem(SENDER_KEY);
    if (saved) setSenderContext(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem(SENDER_KEY, senderContext);
  }, [senderContext]);

  const selected = contacts.find((c) => c.email === selectedEmail) ?? null;

  async function handleEnrich() {
    const emails = parseEmails(emailsRaw);
    if (emails.length === 0) {
      setEnrichError("No valid email addresses found.");
      return;
    }
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      // Guard against an HTML error page (wrong port / server down) so we don't
      // throw a cryptic "Unexpected token '<'" from res.json().
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error(
          `Expected JSON from /api/enrich but got ${res.status} (${ct || "no content-type"}). Is the dev server running on this port?`,
        );
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Enrichment failed");
      setContacts(data.contacts as EnrichedContact[]);
      setSelectedEmail(data.contacts[0]?.email ?? null);
    } catch (err) {
      setEnrichError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  }

  async function handleDraft() {
    if (!selected) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setDrafting(true);
    const previousDraft = draft;
    setDraft("");
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: selected,
          senderContext,
          steering,
          previousDraft: previousDraft || undefined,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text());

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setDraft((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setDraft((prev) => prev + `\n\n[draft error: ${err instanceof Error ? err.message : err}]`);
      }
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Compose</h1>
        <p className="text-sm text-neutral-500">
          Paste emails, let AI draft the outreach, and steer it until it&apos;s right.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: inputs + contacts */}
        <section className="space-y-5">
          <Field label="Your context — who you are & what you offer">
            <textarea
              value={senderContext}
              onChange={(e) => setSenderContext(e.target.value)}
              rows={4}
              placeholder="e.g. I run partnerships at an infrastructure exchange. We help colo & data-center operators fill capacity by matching them with vetted demand. Asking for a 15-min intro call."
              className="textarea"
            />
          </Field>

          <Field label="Recipient emails">
            <textarea
              value={emailsRaw}
              onChange={(e) => setEmailsRaw(e.target.value)}
              rows={3}
              placeholder="paste emails, separated by commas, spaces, or newlines"
              className="textarea font-mono text-sm"
            />
            <div className="mt-2 flex items-center gap-3">
              <button onClick={handleEnrich} disabled={enriching} className="btn-primary">
                {enriching ? "Enriching…" : "Enrich"}
              </button>
              {enrichError && <span className="text-sm text-red-600">{enrichError}</span>}
            </div>
          </Field>

          {contacts.length > 0 && (
            <div className="space-y-2">
              {contacts.some((c) => !c.matched && c.companyMatched) && (
                <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  Apollo&apos;s free plan locks person-level lookups, so we enriched the{" "}
                  <strong>company</strong> instead and the AI personalizes on that. Upgrade Apollo
                  (or wire People Data Labs) to resolve names &amp; titles.
                </p>
              )}
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                {contacts.length} contact{contacts.length > 1 ? "s" : ""}
              </p>
              <ul className="space-y-2">
                {contacts.map((c) => (
                  <li key={c.email}>
                    <button
                      onClick={() => setSelectedEmail(c.email)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        c.email === selectedEmail
                          ? "border-neutral-900 bg-neutral-50"
                          : "border-neutral-200 hover:border-neutral-400"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{c.fullName ?? c.company ?? c.email}</span>
                        {!c.matched && c.companyMatched && (
                          <span className="text-xs text-blue-600">company only</span>
                        )}
                        {!c.matched && !c.companyMatched && (
                          <span className="text-xs text-amber-600">no match</span>
                        )}
                      </div>
                      <div className="text-sm text-neutral-500">
                        {[c.title, c.company, c.industry].filter(Boolean).join(" · ") || c.email}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Right: steering + draft */}
        <section className="space-y-5">
          <Field label="Steer the AI (optional)">
            <input
              value={steering}
              onChange={(e) => setSteering(e.target.value)}
              placeholder="e.g. warmer tone, mention their recent Texas expansion, keep it to 3 sentences"
              className="input"
              onKeyDown={(e) => {
                if (e.key === "Enter" && selected && !drafting) handleDraft();
              }}
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={handleDraft}
                disabled={!selected || drafting}
                className="btn-primary"
              >
                {drafting ? "Drafting…" : draft ? "Revise" : "Draft email"}
              </button>
              {selected && (
                <span className="text-sm text-neutral-500">
                  for {selected.fullName ?? selected.email}
                </span>
              )}
            </div>
          </Field>

          <Field label="Draft (editable)">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              placeholder="Your AI-drafted email will stream in here. Edit freely before sending."
              className="textarea font-mono text-sm"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => navigator.clipboard.writeText(draft)}
                disabled={!draft}
                className="btn-secondary"
              >
                Copy
              </button>
              <button disabled title="Gmail sending lands in the next slice" className="btn-secondary opacity-50">
                Send via Gmail (soon)
              </button>
            </div>
          </Field>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
