import type { SVGProps } from 'react';

/**
 * Open Iconic's `x` (https://www.shadcn.io/icon/oi-x). One path, so it lives
 * here rather than as a dependency.
 *
 * Open Iconic, Copyright (c) 2014 Waybury. MIT licence:
 * https://github.com/iconic/open-iconic/blob/master/ICON-LICENSE
 */
export function OiXIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M1.41 0L0 1.41l.72.72L2.5 3.94L.72 5.72L0 6.41l1.41 1.44l.72-.72l1.81-1.81l1.78 1.81l.69.72l1.44-1.44l-.72-.69l-1.81-1.78l1.81-1.81l.72-.72L6.41 0l-.69.72L3.94 2.5L2.13.72z" />
    </svg>
  );
}
