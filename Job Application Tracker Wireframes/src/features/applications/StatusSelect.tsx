import { useId } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Application } from '@/domain/schemas';
import { STATUS_TOKENS, STATUSES, type Status } from '@/domain/status';
import { useChangeStatus } from '@/queries/use-application-mutations';
import { cn } from '@/lib/utils';

/**
 * The detail screen's status selector (SPEC §4.4): changing it saves at once,
 * through the one status-change path, which writes the history row with it.
 *
 * The change shows immediately and rolls back with a toast if the save fails
 * (§8.3) — the mutation owns both, so this is only the control.
 */
export function StatusSelect({ application }: { application: Application }) {
  const labelId = useId();
  const change = useChangeStatus(application.id);
  const tone = STATUS_TOKENS[application.status];

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-[13px] font-semibold text-muted-foreground">
        Status
      </span>
      <Select value={application.status} onValueChange={(value) => change.mutate(value as Status)}>
        <SelectTrigger
          aria-labelledby={labelId}
          className={cn('h-8 w-[150px] border-transparent font-semibold max-[760px]:h-11', tone.bg, tone.fg)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p role="status" className="sr-only">
        {change.isPending ? 'Saving status…' : ''}
      </p>
    </div>
  );
}
