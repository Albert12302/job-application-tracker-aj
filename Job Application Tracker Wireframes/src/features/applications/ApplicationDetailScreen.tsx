import { Link, useParams } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ErrorState';
import { formatUtcDate } from '@/domain/date';
import { applicationIdSchema } from '@/domain/schemas';
import { errorReference } from '@/queries/errors';
import { useToggleStar } from '@/queries/use-application-mutations';
import { useApplication } from '@/queries/use-application';
import { FunnelIndicator } from './FunnelIndicator';
import { PANEL } from './panel';
import { StarToggle } from './StarToggle';
import { StatusSelect } from './StatusSelect';

const SECTION_HEADING = 'text-[13px] font-semibold text-muted-foreground';
const BACK = 'inline-flex w-fit items-center gap-1.5 rounded-sm text-[13px] text-muted-foreground';

function BackLink() {
  return (
    <Link to="/applications" className={BACK}>
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      Back to applications
    </Link>
  );
}

/**
 * One application (SPEC §4.4): its header, the funnel, the status selector,
 * description, cover letter, and referral.
 *
 * An id that is not this user's and an id that does not exist give the same
 * answer, deliberately (§8.2) — the query returns null for both, because RLS
 * cannot tell the screen which it was and it must not say.
 */
export function ApplicationDetailScreen() {
  // Not tied to the route's id: the param is validated here anyway, and an
  // unparsable one is simply an application that is not found (§8.2).
  const { id } = useParams({ strict: false });
  const parsed = applicationIdSchema.safeParse(id);
  const application = useApplication(parsed.success ? parsed.data : null);
  const star = useToggleStar();

  if (parsed.success && application.isPending) {
    return (
      <div className={PANEL} aria-busy="true">
        <p role="status" className="sr-only">
          Loading this application
        </p>
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-[150px]" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (parsed.success && application.isError) {
    return (
      <div className={PANEL}>
        <ErrorState title="Couldn't load this application." reference={errorReference(application.error)}>
          <Button className="h-9 max-[760px]:h-11" onClick={() => void application.refetch()}>
            Retry
          </Button>
          <Link to="/applications" className={buttonVariants({ variant: 'outline', className: 'h-9 max-[760px]:h-11' })}>
            Back to list
          </Link>
        </ErrorState>
      </div>
    );
  }

  const found = parsed.success ? application.data : null;
  if (!found) {
    return (
      <div className={PANEL}>
        <h1 className="font-heading text-lg font-semibold">Application not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been deleted, or the link may be wrong.
        </p>
        <Link to="/applications" className={buttonVariants({ variant: 'outline', className: 'h-9 w-fit max-[760px]:h-11' })}>
          Back to applications
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col gap-3">
      <BackLink />
      <section aria-labelledby="application-company" className={PANEL}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 id="application-company" className="font-heading text-xl font-semibold break-words">
              {found.company}
            </h1>
            <p className="text-sm text-muted-foreground break-words">{found.position}</p>
          </div>
          <StarToggle
            className="-mt-1 -mr-1"
            starred={found.starred}
            company={found.company}
            onToggle={() => star.mutate({ id: found.id, starred: !found.starred, company: found.company })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-muted-foreground">
          <span>Applied {formatUtcDate(found.date_applied)}</span>
          {found.location ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="break-words">{found.location}</span>
            </>
          ) : null}
          {found.referral ? (
            <>
              <span aria-hidden="true">·</span>
              <span>Referral</span>
            </>
          ) : null}
        </div>

        <StatusSelect application={found} />
        <FunnelIndicator status={found.status} />

        <div className="flex flex-col gap-1.5">
          <h2 className={SECTION_HEADING}>Job description</h2>
          {/* Free text, rendered as text — never as HTML (§7.3). */}
          <p className="text-sm break-words whitespace-pre-wrap">
            {found.description ?? <span className="text-muted-foreground">No description.</span>}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <h2 className={SECTION_HEADING}>Cover letter</h2>
          <p className="text-sm break-words">
            {found.cover_letter_name ?? <span className="text-muted-foreground">No cover letter attached.</span>}
          </p>
        </div>
      </section>
    </div>
  );
}
