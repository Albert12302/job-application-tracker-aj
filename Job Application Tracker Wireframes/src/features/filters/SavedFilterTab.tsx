import { OiXIcon } from '@/components/OiXIcon';
import type { SavedFilter } from '@/domain/schemas';
import { cn } from '@/lib/utils';
import { tabButton } from './tab-styles';

/**
 * A saved filter's tab (SPEC §4.2): choosing it, and an × that deletes it at
 * once (§9.5). Two sibling buttons rather than one inside the other — a button
 * cannot hold a button — so each has its own name and its own tab stop. Below
 * 760px the × is a 44×44 target (§11).
 */
export function SavedFilterTab({
  filter,
  count,
  active,
  disabled,
  onSelect,
  onDelete,
}: {
  filter: SavedFilter;
  count: number | null;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <span className={cn('inline-flex items-center rounded-md', active && 'bg-card shadow-sm ring-1 ring-input')}>
      <button
        type="button"
        aria-pressed={active}
        disabled={disabled}
        onClick={onSelect}
        className={cn(tabButton(false), 'pr-1', active && 'text-foreground hover:bg-transparent')}
      >
        {count === null ? filter.name : `${filter.name} (${count})`}
      </button>
      <button
        type="button"
        aria-label={`Delete saved filter ${filter.name}`}
        disabled={disabled}
        onClick={onDelete}
        className="mr-1 inline-flex size-6 cursor-pointer items-center justify-center rounded text-secondary-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 max-[760px]:mr-0 max-[760px]:size-11"
      >
        <OiXIcon className="size-2.5" />
      </button>
    </span>
  );
}
