import { expect, it } from 'vitest';
import {
  AssistFusion,
  buildWalkGraph,
  crossesWalls,
  pathLength,
  walkingPath,
} from '@turn/positioning-core';
import { demoCentre } from '@turn/venue-model';
import { buildFusionMap, doorwayConnectors } from './assist-helpers';
import { DisplayPose } from './display-pose';

type P = { x: number; y: number };
const floor = demoCentre.floors[0]!;
const map = buildFusionMap(demoCentre, floor.id);
const graph = buildWalkGraph(map.graph!.nodes, map.graph!.edges);

/** Points every `step` metres along a polyline (arc length, corners included). */
function along(path: P[], step: number) {
  const out: P[] = [path[0]!];
  let carry = step;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!,
      b = path[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let t = carry;
    while (t <= len) {
      out.push({
        x: a.x + ((b.x - a.x) * t) / len,
        y: a.y + ((b.y - a.y) * t) / len,
      });
      t += step;
    }
    carry = t - len;
  }
  return out;
}

/**
 * Walks between rooms of the synthetic demo centre with the phone's heading 30° off, like a
 * phone held at an angle, and counts wall crossings of the drawn dot. Synthetic: this checks the
 * map constraint mechanics, never venue accuracy.
 */
function drawnCrossings(withMap: boolean) {
  const nodes = map.graph!.nodes;
  let crossings = 0,
    walks = 0;
  for (let i = 0; i < nodes.length; i += 3)
    for (let j = nodes.length - 1; j > i; j -= 4) {
      const path = walkingPath(graph, map.walls, nodes[i]!, nodes[j]!);
      if (!path || pathLength(path) < 10) continue;
      walks++;
      const truth = along(path, 0.65);
      const skew = (30 * Math.PI) / 180;
      const start = truth[0]!;
      const assist = new AssistFusion(map, [], {}, walks);
      assist.setPosition(start.x, start.y, 1, 0.5);
      assist.setRoute(withMap ? path : null);
      assist.syncRaw(start.x, start.y);
      const display = new DisplayPose();
      if (withMap) {
        display.setMap(map);
        display.setRoute(path);
      }
      let prev: P | null = null;
      for (let k = 1; k < truth.length; k++) {
        const dx = truth[k]!.x - start.x,
          dy = truth[k]!.y - start.y;
        assist.walk(
          start.x + dx * Math.cos(skew) - dy * Math.sin(skew),
          start.y + dx * Math.sin(skew) + dy * Math.cos(skew),
        );
        display.update(assist.estimate()!, k * 0.5, true);
        for (let s = 0; s < 5; s++) {
          const p = { ...display.step(0.1)! };
          if (prev && crossesWalls(prev, p, map.walls)) crossings++;
          prev = p;
        }
      }
    }
  return { crossings, walks };
}

it('never draws the blue dot through a wall, even with a skewed heading', () => {
  const constrained = drawnCrossings(true);
  expect(constrained.walks).toBeGreaterThan(5);
  expect(constrained.crossings).toBe(0);
  // The same walks drawn without map awareness do cross walls: the check is not vacuous.
  expect(drawnCrossings(false).crossings).toBeGreaterThan(0);
});

it('bridges wall-thick gaps at doorways so walkers are not trapped in rooms', () => {
  const rooms = [
    [
      { x: 0, y: 0 },
      { x: 4.8, y: 0 },
      { x: 4.8, y: 4 },
      { x: 0, y: 4 },
    ],
    [
      { x: 5.2, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 5.2, y: 4 },
    ],
  ];
  const strips = doorwayConnectors(
    [
      [
        { x: 2, y: 2 },
        { x: 8, y: 2 },
      ],
    ],
    rooms,
  );
  expect(strips).toHaveLength(1);
  const [a, b, c] = strips[0]!;
  const xs = [a!.x, b!.x, c!.x],
    ys = [a!.y, b!.y, c!.y];
  expect(Math.min(...xs)).toBeLessThan(4.8);
  expect(Math.max(...xs)).toBeGreaterThan(5.2);
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.8, 5);
  // An edge that stays inside walkable space needs no strip.
  expect(
    doorwayConnectors(
      [
        [
          { x: 1, y: 1 },
          { x: 3, y: 3 },
        ],
      ],
      rooms,
    ),
  ).toHaveLength(0);
});
