import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { emptyFormValues, toApplicationInput } from '@/domain/application-input';
import { todayDateInputValue } from '@/domain/date';
import { uniqueLocations } from '@/domain/location';
import { useCreateApplication } from '@/queries/use-application-mutations';
import { useApplications } from '@/queries/use-applications';
import { ApplicationForm } from './ApplicationForm';
import { PANEL } from './panel';

/**
 * Add (SPEC §4.3). Saving returns to the dashboard with the new application
 * already in place, and the filter back to All.
 *
 * The locations this user already has come from the list query: they are the
 * suggestions under the location field, and what §5.2 matches a typed
 * location against so one place keeps one spelling.
 */
export function AddApplicationScreen() {
  const navigate = useNavigate();
  const applications = useApplications();
  const create = useCreateApplication();
  const locations = useMemo(() => uniqueLocations(applications.data), [applications.data]);
  const defaultValues = useMemo(() => emptyFormValues(todayDateInputValue()), []);

  return (
    <section aria-labelledby="add-application-heading" className={PANEL}>
      <h1 id="add-application-heading" className="font-heading text-lg font-semibold">
        Add application
      </h1>
      <ApplicationForm
        defaultValues={defaultValues}
        locations={locations}
        showFirstNote
        submitLabel="Save"
        pending={create.isPending}
        error={create.error}
        onCancel={() => void navigate({ to: '/applications' })}
        onSubmit={(values) =>
          create.mutate(
            { input: toApplicationInput(values, locations), firstNote: values.note || null },
            {
              onSuccess: async () => {
                await navigate({ to: '/applications' });
                toast.success('Application added.');
              },
            },
          )
        }
      />
    </section>
  );
}
