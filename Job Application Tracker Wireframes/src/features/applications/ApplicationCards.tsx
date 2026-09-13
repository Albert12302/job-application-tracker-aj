import type { Application } from '@/domain/schemas';
import { ApplicationCard } from './ApplicationCard';
import type { Selection } from './use-selection';

/** Below 760px the table becomes a list of cards (§11): nothing dropped, re-ordered by importance. */
export function ApplicationCards({ applications, selection }: { applications: Application[]; selection: Selection }) {
  return (
    <ul aria-label="Your applications, newest first" className="divide-y">
      {applications.map((application) => (
        <ApplicationCard
          key={application.id}
          application={application}
          selected={selection.has(application.id)}
          onSelectedChange={(selected) => selection.set(application.id, selected)}
        />
      ))}
    </ul>
  );
}
