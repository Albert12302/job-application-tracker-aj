import { useNavigate } from '@tanstack/react-router';
import type { MouseEvent } from 'react';

/**
 * A row or card opens its application on click (SPEC §4.2) — for the mouse.
 * The keyboard path is the company link inside it, so the row is not a second
 * tab stop (§10.2). Clicks on the star, the select checkbox, or the link are
 * theirs, and a click that ends a text selection is not a request to navigate.
 */
export function useOpenApplication(id: string) {
  const navigate = useNavigate();
  return (event: MouseEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest('a, button, [role="checkbox"], input')) return;
    if (window.getSelection()?.toString()) return;
    void navigate({ to: '/applications/$id', params: { id } });
  };
}
