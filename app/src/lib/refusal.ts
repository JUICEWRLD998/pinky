// Reads a finished transaction and returns the contract's own words for why it failed.
// Used by the judge page (browser key) and the cheat route (character key). No imports, so both sides can use it.

interface Outcome { status?: unknown; receipts_outcome?: { outcome: { status: unknown } }[] }

const failureOf = (status: unknown): unknown =>
  status && typeof status === 'object' && 'Failure' in status ? (status as { Failure: unknown }).Failure : undefined;

/** The refusal message, or null when every receipt succeeded. */
export function refusalOf(r: Outcome): string | null {
  const statuses = [r.status, ...(r.receipts_outcome ?? []).map((o) => o.outcome.status)];
  for (const s of statuses) {
    const f = failureOf(s);
    if (f === undefined) continue;
    const text = JSON.stringify(f);
    const at = text.indexOf('Smart contract panicked: ');
    if (at < 0) return text.slice(0, 200);
    // the panic text runs to the closing quote of the JSON string it sits in
    const rest = text.slice(at + 'Smart contract panicked: '.length);
    const end = rest.search(/["\\]/);
    return (end < 0 ? rest : rest.slice(0, end)).trim();
  }
  return null;
}
