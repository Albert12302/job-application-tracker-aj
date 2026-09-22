import { useNavigate, useParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { toApplicationInput, toFormValues } from '@/domain/application-input';
import { uniqueLocations } from '@/domain/location';
import { applicationIdSchema } from '@/domain/schemas';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useUpdateApplication } from '@/queries/use-application-mutations';
import { useApplication } from '@/queries/use-application';
import { useApplications } from '@/queries/use-applications';
import { ApplicationForm } from './ApplicationForm';
import { ApplicationLoadError } from './ApplicationLoadError';
import { ApplicationNotFound } from './ApplicationNotFound';
import { useListReturn } from './list-return';
import { PANEL } from './panel';

/**
 * Edit (SPEC §9.1): the same fields and validation as Add, pre-filled, and
 * saving returns to the detail screen with the updated record.
 *
 * A status changed here goes through services/change-status.ts exactly as the
 * detail-screen selector does, so it is written with its history row.
 */
export function EditApplicationScreen() {
  const { id } = useParams({ strict: false });
  const navigate = useNavigate();
  const parsed = applicationIdSchema.safeParse(id);
  const applicationId = parsed.success ? parsed.data : null;

  const application = useApplication(applicationId);
  // Which application is being edited, in the tab (§10.2) — as the detail
  // screen does. Until the row arrives, the route's own "Edit application"
  // stands.
  const company = application.data?.company;
  useDocumentTitle(company ? `Edit ${company} Application` : null);
  const applications = useApplications();
  const update = useUpdateApplication(applicationId ?? '');
  const listSearch = useListReturn();

  // Every other application's location: this one's own old spelling must not
  // stop the user correcting it (§5.2).
  const locations = useMemo(
    () => uniqueLocations((applications.data ?? []).filter((row) => row.id !== applicationId)),
    [applications.data, applicationId],
  );
  const found = applicationId ? application.data : null;

  const backToApplication = () => {
    if (applicationId) void navigate({ to: '/applications/$id', params: { id: applicationId } });
    else void navigate({ to: '/applications', search: listSearch });
  };

  if (applicationId && application.isPending) {
    return (
      <div className={PANEL} aria-busy="true">
        <p role="status" className="sr-only">
          Loading this application
        </p>
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (applicationId && application.isError) {
    return (
      <ApplicationLoadError className={PANEL} error={application.error} onRetry={() => void application.refetch()} />
    );
  }

  if (!found) return <ApplicationNotFound className={PANEL} />;

  return (
    <section aria-labelledby="edit-application-heading" className={PANEL}>
      <h1 id="edit-application-heading" className="font-heading text-lg font-semibold">
        Edit application
      </h1>
      <ApplicationForm
        defaultValues={toFormValues(found)}
        locations={locations}
        submitLabel="Save changes"
        pending={update.isPending}
        error={update.error}
        onCancel={backToApplication}
        onSubmit={(values) =>
          update.mutate(toApplicationInput(values, locations), {
            onSuccess: async () => {
              await navigate({ to: '/applications/$id', params: { id: found.id } });
              toast.success('Changes saved.');
            },
          })
        }
      />
    </section>
  );
}
