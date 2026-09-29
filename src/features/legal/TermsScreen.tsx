import { Link } from '@tanstack/react-router';
import { APP_NAME } from '@/lib/app-name';
import { LEGAL_CONTACT } from './contact';
import { LegalPage } from './LegalPage';
import { LegalSection } from './LegalSection';

/** SPEC §4.7. Plain terms for a free, invitation-only personal tool. */
export function TermsScreen() {
  return (
    <LegalPage title="Terms of use" other={{ to: '/privacy', label: 'Privacy policy' }}>
      <p>
        These terms cover your use of {APP_NAME}. By using it you agree to them. How your data is handled is in
        the{' '}
        <Link to="/privacy" className="text-link underline underline-offset-4">
          privacy policy
        </Link>
        .
      </p>

      <LegalSection heading="Your account">
        <ul>
          <li>Accounts are by invitation, for one person each, to track their own job search.</li>
          <li>Keep your password to yourself. What happens under your account is your responsibility.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Your content">
        <p>
          What you enter and upload stays yours. {APP_NAME} only stores it and shows it back to you, and uses it for
          nothing else.
        </p>
        <p>
          Upload only what you have the right to keep, and nothing unlawful or harmful. Uploads are limited in type,
          size, and number.
        </p>
      </LegalSection>

      <LegalSection heading="Fair use">
        <p>Do not:</p>
        <ul>
          <li>try to reach another person’s account or data;</li>
          <li>probe, attack, or overload the service, or work around its limits;</li>
          <li>use it to store or pass on anything unlawful.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="The service">
        <p>
          {APP_NAME} is free and provided as it is, without any guarantee. It may be unavailable at times, and data
          can be lost despite the backups, so keep your own copy with Profile → Export my data.
        </p>
        <p>
          The service may change or come to an end. Before it ends, account holders will be given notice and time to
          export their data.
        </p>
        <p>
          As far as the law allows, {APP_NAME} is not liable for any loss that comes from using it or from being
          unable to use it.
        </p>
      </LegalSection>

      <LegalSection heading="Ending your use">
        <p>
          You can delete your account at any time from Profile. An account that breaks these terms may be suspended or
          removed.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and questions">
        <p>
          If these terms change, the date at the top changes with them, and account holders will be told of a
          significant change before it takes effect.
        </p>
        <p>
          Questions:{' '}
          <a href={`mailto:${LEGAL_CONTACT}`} className="text-link underline underline-offset-4">
            {LEGAL_CONTACT}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
