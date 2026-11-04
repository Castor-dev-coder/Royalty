import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapWithConcurrency } from './concurrency.js';

test('never runs more handlers in flight than the limit', async () => {
  let active = 0;
  let peak = 0;
  const items = Array.from({ length: 12 }, (_, i) => i);
  await mapWithConcurrency(items, 3, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
  });
  assert.equal(peak, 3);
});

test('keeps result order regardless of completion order', async () => {
  const items = [40, 10, 30, 20];
  const results = await mapWithConcurrency(items, 2, async (value) => {
    await new Promise((resolve) => setTimeout(resolve, value / 10));
    return value * 2;
  });
  assert.deepEqual(results, [80, 20, 60, 40]);
});

test('propagates the first handler error', async () => {
  await assert.rejects(
    mapWithConcurrency([1, 2, 3], 2, async (value) => {
      if (value === 2) throw new Error('row failed');
      return value;
    }),
    /row failed/,
  );
});

test('handles empty input and oversized limits', async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
  assert.deepEqual(await mapWithConcurrency([1, 2], 10, async (v) => v + 1), [2, 3]);
});
