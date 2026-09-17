// CORS for the edge functions (SPEC §7.5). Pure — no Deno APIs — so Vitest runs
// it (cors.test.ts); each function reads ALLOWED_ORIGINS and passes it in.
//
// Known origins only: never `*`, never the request's Origin echoed back
// unchecked. Hosted Supabase adds no CORS headers to functions, so without an
// allowlist the browser's preflight fails and the call never happens.

/** `ALLOWED_ORIGINS`, comma-separated, e.g. "https://app.example.com". */
export function parseOrigins(raw: string | undefined): Set<string> {
  return new Set((raw ?? '').split(',').map((o) => o.trim()).filter(Boolean));
}

export function corsHeaders(origin: string | null, allowed: Set<string>): Record<string, string> {
  if (!origin || !allowed.has(origin)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

/** Every function's JSON answer: its CORS headers, and never sniffed as anything else. */
export function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json', 'x-content-type-options': 'nosniff' },
  });
}
