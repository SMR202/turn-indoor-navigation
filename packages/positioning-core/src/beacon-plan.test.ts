import { expect, it } from 'vitest';
import {
  recommendBeaconSites,
  worstCoverageMetres,
  type PlanRoom,
} from './beacon-plan';

const rooms: PlanRoom[] = [
  {
    name: 'West',
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
  },
  {
    name: 'East',
    polygon: [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ],
  },
  {
    name: 'Lawn',
    kind: 'outdoor',
    polygon: [
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 10 },
      { x: 20, y: 10 },
    ],
  },
];
const nodes = [
  { id: 'a', x: 2, y: 5 },
  { id: 'b', x: 5, y: 5 },
  { id: 'door', x: 10, y: 5 },
  { id: 'c', x: 15, y: 5 },
  { id: 'd', x: 19, y: 5 },
  { id: 'lawn', x: 25, y: 5 },
];
it('spreads indoor beacon sites, avoiding doorways and outdoor nodes', () => {
  const sites = recommendBeaconSites(nodes, rooms, [{ x: 10, y: 5 }], 3);
  expect(sites).toHaveLength(3);
  expect(sites.map((s) => s.nodeId)).not.toContain('door');
  expect(sites.map((s) => s.nodeId)).not.toContain('lawn');
  expect(new Set(sites.map((s) => s.tag)).size).toBe(3);
  for (let i = 0; i < sites.length; i++)
    for (let j = i + 1; j < sites.length; j++)
      expect(
        Math.hypot(sites[i]!.x - sites[j]!.x, sites[i]!.y - sites[j]!.y),
      ).toBeGreaterThanOrEqual(3);
  expect(
    sites.every((s) => s.roomName === 'West' || s.roomName === 'East'),
  ).toBe(true);
});
it('reports coverage and handles degenerate input', () => {
  const sites = recommendBeaconSites(nodes, rooms, [], 2);
  expect(worstCoverageMetres(nodes, sites)).toBeLessThan(15);
  expect(worstCoverageMetres(nodes, [])).toBe(Infinity);
  expect(recommendBeaconSites([], rooms, [], 3)).toEqual([]);
  expect(recommendBeaconSites(nodes, rooms, [], 0)).toEqual([]);
});
