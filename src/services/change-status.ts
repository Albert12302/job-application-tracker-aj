import { changeApplicationStatus } from '@/data/applications';
import type { Application } from '@/domain/schemas';
import type { Status } from '@/domain/status';

/**
 * The ONE status-change path (SPEC §2, §9.1). The detail-screen selector and
 * the edit form both come through here; nothing else changes a status.
 *
 * The work is one Postgres transaction (change_application_status): it reads
 * the status the row has now, updates it, and appends the status_history row
 * — or, when nothing changed, does neither (§2). So a status never exists
 * without its history row, and from_status is the database's truth rather
 * than whatever this tab last saw.
 */
export function changeStatus(applicationId: string, status: Status): Promise<Application> {
  return changeApplicationStatus(applicationId, status);
}
