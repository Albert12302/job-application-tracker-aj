import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sortLabel, type ListSort } from '@/domain/order';

/**
 * Below 760px, where cards have no date column to click, the sort is a control
 * of its own above the list (SPEC §11). Its words are the order in effect —
 * "Newest first" or "Oldest first" — and pressing it flips them. Screen readers
 * hear "Sort by date:" first, so the words read as the current order rather
 * than as the action.
 */
export function SortToggle({ sort, onToggle, disabled }: { sort: ListSort; onToggle: () => void; disabled?: boolean }) {
  const Chevron = sort === 'date-asc' ? ChevronUpIcon : ChevronDownIcon;
  return (
    <Button
      variant="outline"
      className="h-11 self-end px-3 text-[13px]"
      aria-label={`Sort by date: ${sortLabel(sort)}`}
      onClick={onToggle}
      disabled={disabled}
    >
      {sortLabel(sort)}
      <Chevron aria-hidden="true" data-icon="inline-end" className="size-3.5" />
    </Button>
  );
}
