import { Link } from '@tanstack/react-router';
import { PaperclipIcon } from 'lucide-react';
import { formatUtcDate, NUMERIC_DATE } from '@/domain/date';
import type { Application } from '@/domain/schemas';
import { useToggleStar } from '@/queries/use-application-mutations';
import { cn } from '@/lib/utils';
import { SelectCheckbox } from './SelectCheckbox';
import { StarToggle } from './StarToggle';
import { StatusTag } from './StatusTag';
import { useOpenApplication } from './use-open-application';

/**
 * One application as a card (§11): the select checkbox, company and position
 * stacked, the star at the top right — both in 44×44 tap areas — then status,
 * date, location, and the cover-letter and referral marks.
 */
export function ApplicationCard({
  application,
  selected,
  onSelectedChange,
}: {
  application: Application;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  const open = useOpenApplication(application.id);
  const star = useToggleStar();
  const { id, company, starred } = application;

  return (
    <li
      onClick={open}
      className={cn('flex cursor-pointer flex-col gap-2.5 p-3.5 hover:bg-muted/50', selected && 'bg-muted hover:bg-muted')}
    >
      <div className="flex items-start gap-3.5">
        <SelectCheckbox label={`Select ${company}`} checked={selected} onCheckedChange={onSelectedChange} className="mt-1" />
        <div className="min-w-0 flex-1">
          <Link to="/applications/$id" params={{ id }} className="rounded-sm text-[15px] leading-snug font-semibold break-words">
            {company}
          </Link>
          <p className="mt-0.5 text-[13px] break-words">{application.position}</p>
        </div>
        <StarToggle
          className="-mt-2.5 -mr-2.5"
          starred={starred}
          company={company}
          onToggle={() => star.mutate({ id, starred: !starred, company })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        <StatusTag status={application.status} />
        <span>
          <span className="sr-only">Applied </span>
          {formatUtcDate(application.date_applied, NUMERIC_DATE)}
        </span>
        {application.location ? <span className="break-words">{application.location}</span> : null}
        {application.cover_letter_name ? (
          <span className="inline-flex items-center gap-1">
            <PaperclipIcon aria-hidden="true" className="size-3.5" />
            Cover letter
          </span>
        ) : null}
        {application.referral ? <span>Referral</span> : null}
      </div>
    </li>
  );
}
