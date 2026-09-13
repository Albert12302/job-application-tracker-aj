/**
 * PostgREST answers at most `max_rows` rows (supabase/config.toml, 1,000) and
 * says nothing when it stops there. Anything that must see a user's whole set —
 * stats, §5.3 — reads it a page at a time until a page comes back short.
 *
 * PAGE_SIZE must not exceed max_rows, or a full page would look short and the
 * read would end early. The query must have a total order, or rows can move
 * between pages while they are read.
 */
export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export async function allPages<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
