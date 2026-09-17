// Reading a request body to the end, for every function (CLAUDE.md, §7.5).
//
// The edge runtime streams a request body in from its main worker, and a
// response sent before that body is drained never completes — cancel() does not
// help. The request hangs, and the stuck worker stops the function from starting
// again until the container is recreated (measured locally,
// supabase-edge-runtime 1.74). A small body arrives whole and hides it, so the
// bug only shows with a large one; see e2e/upload-function.spec.ts and
// e2e/sign-in-function.spec.ts.
//
// So the rule every function keeps: nothing is answered over an unread body,
// not even a refusal — not a 405, not a 401, not a preflight. The functions that
// use the body read it themselves (upload's readCapped, sign-in's req.json());
// everything else drains first.

/**
 * Reads the body to the end and keeps none of it, so an answer sent afterwards
 * can complete. Nothing is buffered, whatever the body's size. A body already
 * read — or a request that never had one — costs nothing.
 */
export async function drainBody(req: Request): Promise<void> {
  if (!req.body || req.bodyUsed) return;
  const reader = req.body.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) return;
  }
}
