import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * A checkbox that picks rows for a bulk delete (SPEC §4.2, §9.2). Named for
 * what it selects, because a list holds many (§10.1). The click stops here, so
 * ticking a row never opens it. The box stays 16px; its tap area is 44×44
 * below 760px (§11), drawn by the primitive's ::after.
 */
export function SelectCheckbox({
  label,
  checked,
  indeterminate = false,
  onCheckedChange,
  className,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={(next) => onCheckedChange(next)}
      onClick={(event) => event.stopPropagation()}
      className={cn('bg-card max-[760px]:after:-inset-3.5', className)}
    />
  );
}
