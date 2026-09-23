import { expect } from '@playwright/test';

/**
 * The local mail catcher (`supabase/config.toml` `[inbucket]`, served by
 * Mailpit at 54324), for the one flow that only exists in an email: the
 * password reset link (SPEC §4.1c–d).
 *
 * **Sends are budgeted, like uploads and writes.** `config.toml`'s
 * `email_sent` allows 10 an hour and `max_frequency` one per address per
 * minute, and locally every request arrives from one address, so the whole
 * suite shares those. A test that needs a link therefore uses an address of its
 * own (`throwawayEmail`) and asks for exactly one — the failure states are
 * cheaper to reach by visiting a fragment directly than by spending a send on
 * them. A second request for the same address inside a minute is answered 200
 * and sends nothing, which looks in the browser exactly like success.
 */

const MAILPIT = 'http://127.0.0.1:54324';

type Message = { ID: string; To: { Address: string }[]; Subject: string };

/** A fresh address, so no test waits on another test's minute. */
export function throwawayEmail(label: string): string {
  return `reset-${label}-${crypto.randomUUID()}@example.test`;
}

/**
 * The reset link sent to `email`, waited for. Returns the `/auth/v1/verify`
 * URL, which is what the person in the email clicks — following it is the
 * browser's job, and the redirect it lands on is the thing under test.
 */
export async function resetLinkFor(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastSeen = 0;

  while (Date.now() < deadline) {
    const listing = await fetch(`${MAILPIT}/api/v1/messages?limit=50`);
    const { messages } = (await listing.json()) as { messages: Message[] };
    lastSeen = messages.length;
    const match = messages.find((message) => message.To.some((to) => to.Address === email));

    if (match) {
      const body = await fetch(`${MAILPIT}/api/v1/message/${match.ID}`);
      const { Text, HTML } = (await body.json()) as { Text: string; HTML: string };
      // The text part is what GoTrue's default template sends and what this
      // reads today. The HTML fallback is decoded first: a link taken out of
      // markup carries `&amp;`, which drops `type` and `redirect_to` from the
      // query and turns a working link into one the app reads as "no link".
      const source = Text || HTML.replaceAll('&amp;', '&');
      const link = source.match(/https?:\/\/[^\s"'<>]+/g)?.find((url) => url.includes('/auth/v1/verify'));
      expect(link, `the reset email to ${email} carried no verify link`).toBeTruthy();
      return link!;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `no reset email for ${email} within ${timeoutMs}ms (${lastSeen} messages in the box). ` +
      'Over §7.1’s send limit? `curl -X DELETE http://127.0.0.1:54324/api/v1/messages` empties it; ' +
      'the limit itself resets on the hour.',
  );
}

/** The fragment Auth sends back for a link it refuses — spent, or past its hour. */
export const SPENT_LINK_FRAGMENT =
  '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
