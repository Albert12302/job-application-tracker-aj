import type { Application } from '@/domain/schemas';
import { ApplicationCard } from './ApplicationCard';

/** Below 760px the table becomes a list of cards (§11): nothing dropped, re-ordered by importance. */
export function ApplicationCards({ applications }: { applications: Application[] }) {
  return (
    <ul aria-label="Your applications, newest first" className="divide-y">
      {applications.map((application) => (
        <ApplicationCard key={application.id} application={application} />
      ))}
    </ul>
  );
}
