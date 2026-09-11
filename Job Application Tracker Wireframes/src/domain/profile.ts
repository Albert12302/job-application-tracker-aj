/**
 * What the app calls the user (SPEC §2 User, §4.6). `profiles.name` starts
 * null for every new account, so the name falls back to one derived from the
 * email, as the prototype does.
 */
export function displayName(name: string | null | undefined, email: string | null | undefined): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;

  const local = email?.split('@')[0]?.split(/[._+-]/)[0] ?? '';
  if (!local) return 'Account';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** The avatar fallback. Array.from so an emoji or accented name is not split mid-character. */
export function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}
