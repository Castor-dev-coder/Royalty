/**
 * Maps items with at most `limit` handlers in flight. Row enrichment fans one
 * query chain per row; an unbounded Promise.all exhausts the shared database
 * pool (the Supabase session pooler hard-caps concurrent sessions per user).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  handler: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await handler(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
