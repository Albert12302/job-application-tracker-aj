import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Plain-language failure plus a next step (SPEC §8.1). The reference is the
 * app_errors id — shown so a user can quote it; the detail stays in the table.
 */
export function ErrorState({
  title,
  reference,
  children,
  className,
}: {
  title: string;
  reference?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-3 text-sm', className)}>
      <p className="font-medium text-destructive">{title}</p>
      {reference ? (
        <p className="text-muted-foreground">
          Error reference <span className="font-mono">{reference}</span>
        </p>
      ) : null}
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}
