import { describe, expect, it } from 'vitest';
import { clearRecent, listRecent, MAX_COPY_CHARS, MAX_RECENT, noteRecent, openRecent } from './recent';

/** A small in-memory Storage. */
function memory(limit = Infinity): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => {
      const used = [...m.entries()].reduce((s, [a, b]) => s + (a === k ? 0 : b.length), 0);
      if (used + v.length > limit) throw new DOMException('full', 'QuotaExceededError');
      m.set(k, v);
    },
  };
}

describe('recent plans in the browser', () => {
  it('keeps the latest copy of each plan, newest first, and opens it again', async () => {
    const s = memory();
    noteRecent({ name: 'House.mimar' }, 'one', s, 1);
    noteRecent({ name: 'Shop.mimar' }, 'two', s, 2);
    noteRecent({ name: 'house.mimar' }, 'three', s, 3);
    const list = await listRecent(s);
    expect(list.map((r) => r.name)).toEqual(['house.mimar', 'Shop.mimar']);
    expect((await openRecent(list[0], s))?.contents).toBe('three');
  });

  it(`keeps at most ${MAX_RECENT}, and skips plans too big to keep`, async () => {
    const s = memory();
    for (let i = 0; i < MAX_RECENT + 3; i++) noteRecent({ name: `P${i}.mimar` }, `c${i}`, s, i);
    const list = await listRecent(s);
    expect(list).toHaveLength(MAX_RECENT);
    expect(s.getItem('mimar-recent:p0.mimar')).toBeNull();
    noteRecent({ name: 'Big.mimar' }, 'x'.repeat(MAX_COPY_CHARS + 1), s, 99);
    expect((await listRecent(s))[0].name).not.toBe('Big.mimar');
  });

  it('never throws when storage is full, and can be cleared', async () => {
    const s = memory(10);
    expect(() => noteRecent({ name: 'A.mimar' }, 'a much longer plan', s)).not.toThrow();
    expect(await listRecent(s)).toEqual([]);
    const t = memory();
    noteRecent({ name: 'A.mimar' }, 'a', t);
    await clearRecent(t);
    expect(await listRecent(t)).toEqual([]);
    expect(t.length).toBe(0);
  });
});
