import { APP_NAME } from '@/lib/app-name';
import { LEGAL_CONTACT } from './contact';
import { LegalPage } from './LegalPage';
import { LegalSection } from './LegalSection';

/**
 * SPEC §4.7. Every sentence here is a claim about what the app does, so it
 * changes in the same commit as the thing it describes — a new field, a new
 * processor, a different retention (§7.6, §7.7, §9.7).
 */
export function PrivacyScreen() {
  return (
    <LegalPage title="Privacy policy" other={{ to: '/terms', label: 'Terms of use' }}>
      <p>
        {APP_NAME} is a personal tracker for job applications. Accounts are by invitation only. This page says what
        it stores about you, who else handles it, how long it is kept, and how to get it back or have it deleted.
      </p>

      <LegalSection heading="What is stored">
        <p>About your account:</p>
        <ul>
          <li>your email address, which is how you sign in;</li>
          <li>your password, stored only as a one-way hash that cannot be turned back into the password;</li>
          <li>a display name and profile photo, if you choose to add them.</li>
        </ul>
        <p>What you enter:</p>
        <ul>
          <li>
            each application: company, position, location, description, date applied, status, and whether it was a
            referral or starred;
          </li>
          <li>the history of each application’s status changes, with their dates;</li>
          <li>your notes, cover letter files, and saved filters.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Technical records">
        <p>A few records exist to keep the service working and secure. None of them hold what you typed.</p>
        <ul>
          <li>
            <strong>Security events</strong> (such as a sign-in, a sign-out, or a file upload) record the kind of
            event, your account’s ID, the time, and the outcome. No email address, network address, or content. Kept
            for 90 days.
          </li>
          <li>
            <strong>Error reports</strong> record what went wrong in the app: the error message and technical trace,
            the page it happened on (without your search terms), the app version, and the identification string your
            browser sends with every request, which names the browser, the operating system, and sometimes the
            device model. Kept for 90 days.
          </li>
          <li>
            <strong>Sign-in protection</strong> keeps a scrambled, one-way form of the email and network address
            behind each sign-in attempt, to stop password guessing. Kept for 24 hours.
          </li>
        </ul>
        <p>
          The hosting providers below also keep their own server logs, which include network addresses, under their
          own policies.
        </p>
      </LegalSection>

      <LegalSection heading="What is not done">
        <ul>
          <li>No advertising, analytics, or tracking of any kind.</li>
          <li>No cookies. Your browser keeps your sign-in in its local storage, and signing out removes it.</li>
          <li>Your data is never sold or shared with anyone beyond the providers below.</li>
          <li>No other account can see your applications, notes, or files.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Who else handles it">
        <ul>
          <li>
            <strong>Supabase</strong> runs the database, sign-in, and file storage, on servers in the United States.
          </li>
          <li>
            <strong>Vercel</strong> serves the website itself.
          </li>
          <li>
            <strong>Brevo</strong> sends password-reset emails, so it receives your email address when you ask for
            one.
          </li>
        </ul>
        <p>
          The person who runs {APP_NAME} has administrator access to the database, as any site’s operator does. It is
          used to keep the service running, restore backups, and investigate errors.
        </p>
      </LegalSection>

      <LegalSection heading="Keeping it safe">
        <p>
          Everything travels over an encrypted connection. The database lets each account reach only its own rows.
          Files sit in private storage that only your account can open, and a cover letter download uses a link that
          expires after 60 seconds.
        </p>
        <p>
          The database is backed up nightly. Each backup is encrypted before it is stored and kept for 90 days. Files
          (cover letters and photos) are not part of the backups.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <ul>
          <li>
            <strong>See and change it:</strong> everything you entered can be edited or deleted in the app.
          </li>
          <li>
            <strong>Take a copy:</strong> Profile → Export my data downloads all of it, files included, as one zip.
          </li>
          <li>
            <strong>Delete it:</strong> Profile → Delete my account removes your account, applications, notes, files,
            and filters straight away. There is no grace period and it cannot be undone. Copies inside existing
            backups are gone within 90 days, as those backups expire, and so are the technical records above, which
            hold no content.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Changes and questions">
        <p>
          If this policy changes, the date at the top changes with it. A change to how your data is used will be
          announced to account holders before it takes effect.
        </p>
        <p>
          Questions, or a request about your data:{' '}
          <a href={`mailto:${LEGAL_CONTACT}`} className="text-link underline underline-offset-4">
            {LEGAL_CONTACT}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
