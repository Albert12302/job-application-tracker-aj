import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { emptyFormValues, toApplicationInput } from '@/domain/application-input';
import { todayDateInputValue } from '@/domain/date';
import { uniqueLocations } from '@/domain/location';
import { useCreateApplication } from '@/queries/use-application-mutations';
import { useApplications } from '@/queries/use-applications';
import { coverLetterFileProblem, useAttachCoverLetter } from '@/queries/use-cover-letter';
import { ApplicationForm } from './ApplicationForm';
import { CoverLetterField } from './CoverLetterField';
import { PANEL } from './panel';

/**
 * Add (SPEC §4.3). Saving returns to the dashboard with the new application
 * already in place, and the filter back to All.
 *
 * The locations this user already has come from the list query: they are the
 * suggestions under the location field, and what §5.2 matches a typed
 * location against so one place keeps one spelling.
 *
 * A chosen cover letter is uploaded once the application exists, and attached
 * to it. If that fails the application stays saved without it (§8.2), and the
 * user lands on its detail screen, where the failure and Retry are shown.
 */
export function AddApplicationScreen() {
  const navigate = useNavigate();
  const applications = useApplications();
  const create = useCreateApplication();
  const attach = useAttachCoverLetter();
  const locations = useMemo(() => uniqueLocations(applications.data), [applications.data]);
  const defaultValues = useMemo(() => emptyFormValues(todayDateInputValue()), []);
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);

  const choose = async (picked: File) => {
    // Checked on choosing, so a refusal shows before anything is saved; checked again on upload.
    const problem = await coverLetterFileProblem(picked);
    setFileProblem(problem);
    setFile(problem ? null : picked);
  };

  const done = async () => {
    await navigate({ to: '/applications' });
    toast.success('Application added.');
  };

  return (
    <section aria-labelledby="add-application-heading" className={PANEL}>
      <h1 id="add-application-heading" className="font-heading text-lg font-semibold">
        Add application
      </h1>
      <ApplicationForm
        defaultValues={defaultValues}
        locations={locations}
        showFirstNote
        coverLetter={
          <CoverLetterField
            file={file}
            problem={fileProblem}
            uploading={attach.isPending}
            onPick={(picked) => void choose(picked)}
            onClear={() => {
              setFile(null);
              setFileProblem(null);
            }}
          />
        }
        coverLetterChosen={file !== null}
        submitLabel="Save"
        pending={create.isPending || attach.isPending}
        error={create.error}
        onCancel={() => void navigate({ to: '/applications' })}
        onSubmit={(values) =>
          create.mutate(
            { input: toApplicationInput(values, locations), firstNote: values.note || null },
            {
              onSuccess: (row) => {
                if (!file) return void done();
                attach.mutate(
                  { applicationId: row.id, file, currentPath: null },
                  {
                    onSuccess: () => void done(),
                    onError: async () => {
                      await navigate({ to: '/applications/$id', params: { id: row.id } });
                      toast.error("Application added, but the cover letter didn't upload.");
                    },
                  },
                );
              },
            },
          )
        }
      />
    </section>
  );
}
