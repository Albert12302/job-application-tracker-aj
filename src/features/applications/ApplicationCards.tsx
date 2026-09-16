import type { Ref } from 'react';
import type { Application } from '@/domain/schemas';
import { ApplicationCard } from './ApplicationCard';
import type { Selection } from './use-selection';

/**
 * Below 760px the table becomes a list of cards (§11): nothing dropped, re-ordered by importance.
 * Like the table, focusable from script so a change of page can land at its start.
 */
export function ApplicationCards({
  applications,
  selection,
  label,
  ref,
}: {
  applications: Application[];
  selection: Selection;
  label: string;
  ref?: Ref<HTMLUListElement>;
}) {
  return (
    <ul ref={ref} tabIndex={-1} aria-label={label} className="divide-y outline-none">
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
