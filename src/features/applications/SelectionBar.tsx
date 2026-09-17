import { Button } from '@/components/ui/button';
import { applicationCount } from './delete-summary';

/**
 * Shown above the list once a row is ticked (SPEC §4.2): how many, a way to
 * clear them, and the bulk delete. Below 760px, where cards have no header row
 * to hold a select-all box, it also offers Select all.
 */
export function SelectionBar({
  count,
  total,
  narrow,
  onSelectAll,
  onClear,
  onDelete,
}: {
  count: number;
  total: number;
  narrow: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2">
      <p className="text-sm font-medium">{count} selected</p>
      {narrow && count < total ? (
        <Button variant="ghost" size="lg" onClick={onSelectAll}>
          Select all {total}
        </Button>
      ) : null}
      <Button variant="ghost" size="lg" onClick={onClear}>
        Clear
      </Button>
      <Button variant="destructive" size="lg" className="ml-auto max-[760px]:w-full" onClick={onDelete}>
        Delete {applicationCount(count)}
      </Button>
    </div>
  );
}
