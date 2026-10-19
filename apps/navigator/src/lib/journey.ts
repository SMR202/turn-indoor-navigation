import {
  pointAlong,
  polylineLength,
  type P,
  type Scene,
} from '@turn/map-scene';
import { calculateRoute } from '@turn/routing';
import type { VenuePackage } from '@turn/venue-model';
import { buildSteps, cleanPolyline, type Step } from './directions';

/** The part of a route on one floor. `offset` is the walked distance where it starts (metres). */
export type Leg = {
  floorId: string;
  points: P[];
  offset: number;
  length: number;
};
export type Journey = {
  legs: Leg[];
  /** Walking length on the floors (metres). */
  length: number;
  /** Routing cost including stairs/lift travel (metres-equivalent), for time estimates. */
  distanceMetres: number;
  steps: Step[];
};

type Connector = VenuePackage['connectors'][number];
const connectorName: Record<Connector['kind'], string> = {
  stairs: 'stairs',
  lift: 'lift',
  escalator: 'escalator',
  ramp: 'ramp',
};

/** Which connector a route used between two nodes on different floors. */
function connectorBetween(
  pkg: VenuePackage,
  a: string,
  b: string,
  stepFree: boolean,
) {
  const edges = pkg.edges.filter(
    (e) =>
      e.connectorId &&
      ((e.from === a && e.to === b) ||
        (e.bidirectional && e.from === b && e.to === a)) &&
      (!stepFree || e.stepFree),
  );
  const best = edges.sort((x, y) => x.distanceMetres - y.distanceMetres)[0];
  return pkg.connectors.find((c) => c.id === best?.connectorId) ?? null;
}

/**
 * A route as legs per floor with turn-by-turn steps; floor changes become "Take the stairs up to
 * Level 1" steps. Returns null when no route exists.
 */
export function planJourney(
  pkg: VenuePackage,
  fromNode: string,
  toNode: string,
  options: { stepFree: boolean },
  scenes: Record<string, Scene>,
  destination: string,
): Journey | null {
  const r = calculateRoute(pkg, fromNode, toNode, {
    stepFree: options.stepFree,
  });
  if (r.status !== 'ok') return null;
  const g = r.route.geometry;
  const ids = r.route.nodeIds;
  const floorOf = new Map(pkg.floors.map((f) => [f.id, f]));
  const legs: Leg[] = [];
  const boundaries: {
    connector: Connector | null;
    to: string;
    from: string;
  }[] = [];
  let start = 0;
  let offset = 0;
  for (let i = 1; i <= g.length; i++) {
    if (i < g.length && g[i]!.floorId === g[start]!.floorId) continue;
    const points = cleanPolyline(
      g.slice(start, i).map(({ x, y }) => ({ x, y })),
    );
    const length = points.length > 1 ? polylineLength(points) : 0;
    legs.push({
      floorId: g[start]!.floorId,
      points: points.length > 1 ? points : [points[0]!, points[0]!],
      offset,
      length,
    });
    offset += length;
    if (i < g.length)
      boundaries.push({
        connector: connectorBetween(
          pkg,
          ids[i - 1]!,
          ids[i]!,
          options.stepFree,
        ),
        from: g[i - 1]!.floorId,
        to: g[i]!.floorId,
      });
    start = i;
  }
  const steps: Step[] = [];
  legs.forEach((leg, i) => {
    const last = i === legs.length - 1;
    const b = boundaries[i];
    const next = b ? floorOf.get(b.to) : undefined;
    const up =
      b && next ? next.level > (floorOf.get(b.from)?.level ?? 0) : true;
    const legSteps = buildSteps(leg.points, scenes[leg.floorId]!, destination);
    for (const s of legSteps) {
      if (s.kind === 'arrive' && !last) {
        const via = b?.connector ? connectorName[b.connector.kind] : 'stairs';
        steps.push({
          kind: up ? 'level-up' : 'level-down',
          text: `Take the ${via} ${up ? 'up' : 'down'} to ${next?.label ?? 'the next floor'}`,
          at: s.at,
          along: s.along + leg.offset,
          distance: 0,
          floorId: leg.floorId,
        });
        continue;
      }
      if (s.kind === 'depart' && i > 0) continue; // the floor change already says where to go
      steps.push({ ...s, along: s.along + leg.offset, floorId: leg.floorId });
    }
  });
  for (let i = 0; i < steps.length - 1; i++)
    steps[i]!.distance = Math.max(0, steps[i + 1]!.along - steps[i]!.along);
  return {
    legs,
    length: offset,
    distanceMetres: r.route.distanceMetres,
    steps,
  };
}

/** Where a walker is after `walked` metres: floor, point and heading. */
export function positionOnJourney(
  j: Journey,
  walked: number,
): P & { floorId: string; headingRad: number; leg: number } {
  const w = Math.max(0, Math.min(j.length, walked));
  let leg = j.legs.findIndex((l) => w < l.offset + l.length - 1e-6);
  if (leg < 0) leg = j.legs.length - 1;
  const l = j.legs[leg]!;
  const p = pointAlong(l.points, w - l.offset);
  return { x: p.x, y: p.y, headingRad: p.headingRad, floorId: l.floorId, leg };
}
