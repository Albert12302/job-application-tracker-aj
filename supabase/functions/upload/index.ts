// The only way a file reaches Storage (SPEC §7.3).
//
// Why this exists as an edge function: the type check has to read the file's
// bytes, and nothing on the database side can. A storage.objects policy or
// trigger sees the object's name and metadata, never its contents, and a
// bucket's allowed_mime_types trusts the Content-Type the sender declares. So
// the buckets accept no writes from signed-in users at all (migration
// 20260911160000); this function checks the bytes and stores the file itself.
//
// The client never chooses the path. It is built here from the verified user
// and a fresh UUID, so no original filename is ever stored (§7.3).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse, parseOrigins } from '../_shared/cors.ts';
import { checkUpload, type FileProblem, isUploadKind, UPLOAD_RULES } from './files.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = parseOrigins(Deno.env.get('ALLOWED_ORIGINS'));

// §7.1. The limit's one home: the function stores with the service role, whose
// auth.uid() is null, so a storage.objects trigger could not attribute it.
const UPLOADS_PER_HOUR = 20;

// The client maps statuses to its own copy (src/data/storage.ts); these strings are for curl.
const STATUS_BY_PROBLEM: Record<FileProblem, number> = { size: 413, type: 415, dimensions: 422 };
const PROBLEM_COPY: Record<FileProblem, string> = {
  size: 'The file is too large.',
  type: 'That file type is not accepted.',
  dimensions: 'The image is too large.',
};
const SIGN_IN = 'Sign in to upload.';
const UNAVAILABLE = 'Upload is unavailable right now. Try again shortly.';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/**
 * The body, or null once it passes `max` bytes. Nothing past `max` is kept, so
 * an oversized upload costs at most `max` bytes of memory, whatever it declared.
 *
 * An oversized body is still read to the end — discarded, not cancelled. The
 * edge runtime streams the body in from its main worker, and a response sent
 * before the body is drained never completes, cancel or no cancel: the request
 * hangs, and the stuck worker stops the function from starting another
 * (measured locally, supabase-edge-runtime 1.74). The platform's wall-clock
 * limit bounds how long a huge body can take.
 */
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array();

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total <= max) chunks.push(value);
  }
  if (total > max) return null;

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'), ALLOWED_ORIGINS);
  const reply = (body: unknown, status: number) => jsonResponse(body, status, cors);
  // A refusal sent before the body is read never completes (see readCapped), and
  // the stuck worker blocks every later upload — a signed-out user's token, whose
  // session the hourly expiry job ended, was enough. Drain it, keeping nothing.
  const refuse = async (body: unknown, status: number) => {
    if (!req.bodyUsed) await readCapped(req, 0);
    return reply(body, status);
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return refuse({ error: 'Method not allowed.' }, 405);

  // POST /functions/v1/upload/<kind>. The kind picks the bucket and the rules;
  // nothing else in the request has a say in where the file goes.
  const kind = new URL(req.url).pathname.split('/').pop() ?? '';
  if (!isUploadKind(kind)) return refuse({ error: 'Unknown upload kind.' }, 404);

  // Who is uploading comes from a token Auth itself vouches for — not the
  // body, not the path. The gateway's verify_jwt checks the signature; this
  // also refuses a signed-out or deleted user's still-unexpired token.
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return refuse({ error: SIGN_IN }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return refuse({ error: SIGN_IN }, 401);
  const userId = auth.user.id;

  const { bucket, maxBytes } = UPLOAD_RULES[kind];
  const bytes = await readCapped(req, maxBytes);
  if (!bytes) return reply({ error: PROBLEM_COPY.size }, STATUS_BY_PROBLEM.size);

  const verdict = checkUpload(kind, bytes);
  if (!verdict.ok) return reply({ error: PROBLEM_COPY[verdict.problem] }, STATUS_BY_PROBLEM[verdict.problem]);

  // Counted as the user, through the same consume_rate_limit every other §7.1
  // limit uses — only once the file is acceptable, so a refused file costs
  // nothing, as it did when the count lived on storage.objects.
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { error: limitError } = await asUser.rpc('consume_rate_limit', {
    p_bucket: 'upload',
    p_limit: UPLOADS_PER_HOUR,
    p_window: '1 hour',
  });
  if (limitError) {
    if (limitError.message.includes('rate_limited')) {
      await admin.from('security_events').insert({ user_id: userId, event_type: 'rate_limit_trip', outcome: 'denied' });
      return reply({ error: 'Upload limit reached. Try again in an hour.' }, 429);
    }
    // Fail closed: a limit that cannot be counted cannot be enforced.
    return reply({ error: UNAVAILABLE }, 503);
  }

  const path = `${userId}/${crypto.randomUUID()}.${verdict.extension}`;
  const { error: storeError } = await admin.storage
    .from(bucket)
    // The sniffed type, never the sender's; the bucket's allowlist re-checks it.
    .upload(path, bytes, { contentType: verdict.contentType, upsert: false, cacheControl: '3600' });
  if (storeError) return reply({ error: UNAVAILABLE }, 503);

  await admin.from('security_events').insert({ user_id: userId, event_type: 'file_upload', outcome: 'success' });
  return reply({ path }, 201);
});
