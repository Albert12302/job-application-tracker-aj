import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Empty because there is nothing yet (SPEC §8.1): a headline, one line of
 * copy, and the action that fills it. "Empty because a filter excluded
 * everything" is a different state with different copy — not this one.
 */
export function EmptyState({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{children}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
