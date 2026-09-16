import { useState } from 'react';
import type { Application } from '@/domain/schemas';

/**
 * Which rows are ticked for a bulk delete (SPEC §4.2). Screen state, not URL
 * state: a selection is not something to link to or come back to.
 *
 * Only rows on screen count. An id whose row has gone — deleted, or later
 * filtered out — is simply not selected, so nothing unseen is ever deleted.
 */
export type Selection = {
  /** The selected applications, in list order. */
  selected: Application[];
  count: number;
  has: (id: string) => boolean;
  set: (id: string, selected: boolean) => void;
  selectAll: () => void;
  clear: () => void;
  /** Drop these ids — the ones a delete has taken. */
  remove: (ids: readonly string[]) => void;
};

export function useSelection(applications: readonly Application[]): Selection {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const selected = applications.filter((application) => ids.has(application.id));

  return {
    selected,
    count: selected.length,
    has: (id) => ids.has(id),
    set: (id, on) =>
      setIds((current) => {
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    selectAll: () => setIds(new Set(applications.map((application) => application.id))),
    clear: () => setIds(new Set()),
    remove: (gone) =>
      setIds((current) => {
        const next = new Set(current);
        for (const id of gone) next.delete(id);
        return next;
      }),
  };
}
