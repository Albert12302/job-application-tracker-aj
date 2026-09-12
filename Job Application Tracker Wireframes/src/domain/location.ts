/**
 * Location normalization (SPEC §5.2), applied on every save. It keeps the
 * location filter's option list clean without a fixed table of places:
 *
 * 1. whitespace trimmed and collapsed, and commas spaced as ", ";
 * 2. a case-insensitive match against a location this user already has wins,
 *    in its existing spelling ("san francisco, ca" → "San Francisco, CA");
 * 3. otherwise each comma-separated part is title-cased, and two-letter parts
 *    are uppercased ("austin, tx" → "Austin, TX").
 *
 * Title-casing only raises first letters. It never lowers the rest, so a
 * spelling the user typed on purpose ("McAllen") survives.
 */
export function normalizeLocation(
  input: string | null | undefined,
  existing: readonly (string | null)[],
): string | null {
  const cleaned = tidy(input ?? '');
  if (!cleaned) return null;

  const key = cleaned.toLowerCase();
  const hit = existing.find((location) => location !== null && tidy(location).toLowerCase() === key);
  if (hit) return hit;

  return cleaned.split(', ').map(titleCasePart).join(', ');
}

/**
 * The locations this user has already used, in order, each once: the
 * suggestions under the location field (§4.3) and what a typed location is
 * matched against (§5.2).
 */
export function uniqueLocations(applications: readonly { location: string | null }[] | undefined): string[] {
  const used = (applications ?? []).map((application) => application.location).filter((location) => location !== null);
  return [...new Set(used)].sort((a, b) => a.localeCompare(b));
}

function tidy(value: string): string {
  return value
    .split(',')
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(', ');
}

function titleCasePart(part: string): string {
  if (part.length === 2) return part.toUpperCase();
  // First letter of each word, including after a hyphen ("Winston-Salem").
  return part.replace(/(^|[\s-])(\p{Ll})/gu, (_match, before: string, letter: string) => before + letter.toUpperCase());
}
