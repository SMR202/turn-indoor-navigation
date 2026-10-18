import { expect, it } from 'vitest';
import { demoCentre } from './demo-centre';
import { wallCrossings } from './geometry';

it('is a valid venue whose walk graph never crosses a wall and reaches every place', () => {
  expect(demoCentre.pois.length).toBeGreaterThanOrEqual(12);
  expect(wallCrossings(demoCentre)).toEqual([]);
  const adj = new Map<string, string[]>();
  for (const e of demoCentre.edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  const seen = new Set(['entrance']);
  const queue = ['entrance'];
  while (queue.length)
    for (const n of adj.get(queue.shift()!) ?? [])
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  for (const poi of demoCentre.pois) expect(seen.has(poi.nodeId)).toBe(true);
});
