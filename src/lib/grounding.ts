/** Deterministic grounding helpers: entity resolution and quote verification run in code, never in the model. */
export type EqLite = { id: string; name: string; identifier: string; line_id: string | null; status?: string };

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function resolveEquipment(ref: string | null | undefined, eq: EqLite[]): EqLite | null {
  if (!ref) return null;
  const r = norm(ref);
  if (r.length < 2) return null;
  return (
    eq.find((e) => norm(e.identifier) === r || norm(e.name) === r) ??
    (r.length >= 3 ? eq.find((e) => norm(e.name).includes(r) || r.includes(norm(e.name)) || r.includes(norm(e.identifier))) : null) ??
    null
  );
}

export function mentionedEquipment(text: string, eq: EqLite[]): EqLite[] {
  const t = ` ${norm(text)} `;
  return eq.filter((e) => (norm(e.name).length >= 3 && t.includes(` ${norm(e.name)} `)) || (norm(e.identifier).length >= 2 && t.includes(` ${norm(e.identifier)} `)));
}

/** True when the quote (normalised) appears in the source text. Empty quotes are unverified. */
export function verifyQuote(quote: string, source: string): boolean {
  const q = norm(quote);
  return q.length > 0 && norm(source).includes(q);
}

export type ContextRecord = { id: string; kind: string; date: string; text: string };
export const recId = (kind: string, id: string) => `${kind}:${id}`;

export function formatContext(records: ContextRecord[]): string {
  return records.map((r) => `[${r.id}] (${r.kind}, ${r.date.slice(0, 10)}) ${r.text.replace(/\s+/g, " ").slice(0, 600)}`).join("\n") || "(no records)";
}

export function validIds<T extends { record_id?: string | null }>(items: T[], known: Set<string>): T[] {
  return items.filter((i) => !i.record_id || known.has(i.record_id));
}
export const keepKnown = (ids: string[], known: Set<string>) => ids.filter((i) => known.has(i));
