import { updateApplicationFields } from '@/data/applications';
import type { ApplicationInput } from '@/domain/application-input';
import type { Application } from '@/domain/schemas';
import { changeStatus } from './change-status';

/**
 * Save the edit form (SPEC §9.1): the fields, then the status through the one
 * status-change path — never as a column in the same update, or it would
 * change without a history row.
 *
 * Two steps, so a failure between them leaves the fields saved and the status
 * not. The form keeps its values and says the save failed (§8.2), and saving
 * again is safe: both steps are idempotent.
 */
export async function updateApplication(id: string, input: ApplicationInput): Promise<Application> {
  const { status, ...fields } = input;
  const saved = await updateApplicationFields(id, fields);
  return saved.status === status ? saved : changeStatus(id, status);
}
