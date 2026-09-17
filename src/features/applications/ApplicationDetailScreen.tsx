import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUtcDate } from '@/domain/date';
import { applicationIdSchema } from '@/domain/schemas';
import {
  useDeleteApplication,
  useForgetApplication,
  useToggleStar,
} from '@/queries/use-application-mutations';
import { useApplication } from '@/queries/use-application';
import { useNotes } from '@/queries/use-notes';
import { ApplicationLoadError } from './ApplicationLoadError';
import { ApplicationNotFound } from './ApplicationNotFound';
import { CoverLetterSection } from './CoverLetterSection';
import { DeleteApplicationDialog } from './DeleteApplicationDialog';
import { FunnelIndicator } from './FunnelIndicator';
import { useListReturn } from './list-return';
import { NotesSection } from './NotesSection';
import { DETAIL_PANEL, DETAIL_WIDTH, SECTION_HEADING } from './panel';
import { StarToggle } from './StarToggle';
import { StatusSelect } from './StatusSelect';

const BACK = 'inline-flex w-fit items-center gap-1.5 rounded-sm text-[13px] text-muted-foreground';

function BackLink() {
  // Back to the list as it was left — the same filter, search, order, and page (§4.2).
  const listSearch = useListReturn();
  return (
    <Link to="/applications" search={listSearch} className={BACK}>
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
  const navigate = useNavigate();
  const parsed = applicationIdSchema.safeParse(id);
  const applicationId = parsed.success ? parsed.data : null;

  const application = useApplication(applicationId);
  // The same query the notes list uses, so the dialog can say how many go with
  // the record (§9.2) without asking again.
  const notes = useNotes(applicationId);
  const star = useToggleStar();
  const remove = useDeleteApplication(applicationId ?? '');
  const forget = useForgetApplication();
  const listSearch = useListReturn();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (parsed.success && application.isPending) {
    return (
      <div className={DETAIL_PANEL} aria-busy="true">
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
      <ApplicationLoadError
        className={DETAIL_PANEL}
        error={application.error}
        onRetry={() => void application.refetch()}
      />
    );
  }

  const found = applicationId ? application.data : null;
  if (!found) return <ApplicationNotFound className={DETAIL_PANEL} />;

  return (
    <div className={`mx-auto flex w-full ${DETAIL_WIDTH} flex-col gap-3`}>
      <BackLink />
      <section aria-labelledby="application-company" className={DETAIL_PANEL}>
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

        <CoverLetterSection application={found} />

        <NotesSection applicationId={found.id} />

        {/* The record's own actions, kept off the notes form above: three actions in a
            stack read as one group otherwise (§8). Filled for the edit, light red for
            the delete — colour says which is which before the words do. */}
        <div className="flex flex-wrap gap-2.5 border-t border-border pt-5">
          <Link
            to="/applications/$id/edit"
            params={{ id: found.id }}
            className={buttonVariants({ size: 'lg' })}
          >
            Edit application
          </Link>
          <Button variant="destructive" size="lg" onClick={() => setConfirmDelete(true)}>
            Delete application
          </Button>
        </div>
      </section>

      <DeleteApplicationDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        company={found.company}
        noteCount={notes.data?.length ?? 0}
        hasFile={found.cover_letter_path !== null}
        pending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: async () => {
              setConfirmDelete(false);
              // A deleted last row of the last page lands on the page before (§4.2).
              await navigate({ to: '/applications', search: listSearch });
              // Only once the screen showing it has gone, so it never flashes
              // "not found" on the way out.
              forget(found.id);
              toast.success('Application deleted.');
            },
          })
        }
      />
    </div>
  );
}
