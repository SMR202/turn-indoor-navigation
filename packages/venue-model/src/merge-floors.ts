import { parseVenuePackage, type VenuePackage } from './schema';

type P = { x: number; y: number };
type Connector = VenuePackage['connectors'][number];
type Edge = VenuePackage['edges'][number];

/** Vertical travel cost (metres-equivalent) per level, so routes prefer the same floor. */
export const VERTICAL_COST = {
  stairs: 9,
  escalator: 10,
  lift: 14,
  ramp: 12,
} as const;

function centroid(poly: P[]): P {
  return {
    x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
    y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
  };
}
function inside(p: P, poly: P[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!,
      b = poly[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      c = !c;
  }
  return c;
}
function connectorKinds(name: string): Connector['kind'][] {
  const n = name.toLowerCase();
  const kinds: Connector['kind'][] = [];
  if (/stair|step/.test(n)) kinds.push('stairs');
  if (/lift|elevator/.test(n)) kinds.push('lift');
  if (/escalator/.test(n)) kinds.push('escalator');
  if (/ramp/.test(n)) kinds.push('ramp');
  return kinds.length ? kinds : ['stairs'];
}

/** Prefixes every id of a single-floor package so it can sit beside other floors. */
function prefixIds(v: VenuePackage, prefix: string): VenuePackage {
  const id = (s: string) => (s.startsWith(prefix) ? s : `${prefix}${s}`);
  return {
    ...v,
    floors: v.floors.map((f) => ({
      ...f,
      rooms: f.rooms.map((r) => ({ ...r, id: id(r.id) })),
      doors: f.doors.map((d) => ({ ...d, id: id(d.id) })),
    })),
    nodes: v.nodes.map((n) => ({ ...n, id: id(n.id) })),
    edges: v.edges.map((e) => ({
      ...e,
      id: id(e.id),
      from: id(e.from),
      to: id(e.to),
    })),
    pois: v.pois.map((p) => ({ ...p, id: id(p.id), nodeId: id(p.nodeId) })),
    anchors: v.anchors.map((a) => ({
      ...a,
      id: id(a.id),
      nodeId: id(a.nodeId),
    })),
    connectors: [],
  };
}

/**
 * Joins stairs/lift rooms on adjacent levels: rooms of kind `stairs` that share a name or sit within
 * 4 m of each other. Each pair gets one connector per kind named in the room ("Stairs & Lift" gives
 * both), with step-free edges only for lifts and ramps. Existing connectors are kept.
 */
export function linkVerticalCores(venue: VenuePackage): {
  venue: VenuePackage;
  links: number;
  warnings: string[];
} {
  const floors = [...venue.floors].sort((a, b) => a.level - b.level);
  const connectors = [...venue.connectors];
  const edges = [...venue.edges];
  const warnings: string[] = [];
  let links = 0;
  const cores = (f: (typeof floors)[number]) =>
    f.rooms
      .filter((r) => r.kind === 'stairs')
      .map((r) => {
        const c = centroid(r.polygon);
        const nodes = venue.nodes.filter(
          (n) => n.floorId === f.id && inside(n, r.polygon),
        );
        const node = nodes.sort(
          (a, b) =>
            Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y),
        )[0];
        return { room: r, c, node };
      });
  for (let i = 1; i < floors.length; i++) {
    const lower = floors[i - 1]!,
      upper = floors[i]!;
    if (upper.level - lower.level !== 1) continue;
    const below = cores(lower);
    const used = new Set<string>();
    for (const up of cores(upper)) {
      const match =
        below.find(
          (b) =>
            !used.has(b.room.id) &&
            b.room.name.trim().toLowerCase() ===
              up.room.name.trim().toLowerCase(),
        ) ??
        below
          .filter((b) => !used.has(b.room.id))
          .sort(
            (a, b) =>
              Math.hypot(a.c.x - up.c.x, a.c.y - up.c.y) -
              Math.hypot(b.c.x - up.c.x, b.c.y - up.c.y),
          )
          .find((b) => Math.hypot(b.c.x - up.c.x, b.c.y - up.c.y) < 4);
      if (!match) {
        warnings.push(
          `${upper.label}: "${up.room.name}" has no stairs or lift below it on ${lower.label}.`,
        );
        continue;
      }
      used.add(match.room.id);
      if (!match.node || !up.node) {
        warnings.push(
          `${up.room.name}: no walking node inside the stairs room, so it cannot be linked.`,
        );
        continue;
      }
      for (const kind of connectorKinds(`${match.room.name} ${up.room.name}`)) {
        const pair = [match.node.id, up.node.id];
        if (
          connectors.some(
            (c) => c.kind === kind && pair.every((n) => c.nodeIds.includes(n)),
          )
        )
          continue;
        const id = `core-${kind}-${match.room.id}-${up.room.id}`;
        connectors.push({ id, kind, nodeIds: pair });
        const edge: Edge = {
          id: `${id}-edge`,
          from: pair[0]!,
          to: pair[1]!,
          distanceMetres: VERTICAL_COST[kind],
          bidirectional: kind !== 'escalator',
          stepFree: kind === 'lift' || kind === 'ramp',
          connectorId: id,
        };
        edges.push(edge);
        if (kind === 'escalator')
          // Escalators usually come in pairs; model the reverse direction too so routes work both ways.
          edges.push({
            ...edge,
            id: `${id}-down`,
            from: pair[1]!,
            to: pair[0]!,
          });
        links++;
      }
    }
  }
  return {
    venue: parseVenuePackage({ ...venue, connectors, edges }),
    links,
    warnings,
  };
}

/**
 * Adds a floor (from `importFloorGeoJson`) to a venue, replacing any floor with the same id, and
 * re-links vertical cores. All floors must share one coordinate frame (same origin and scale).
 */
export function mergeFloor(
  base: VenuePackage | null,
  floorPackage: VenuePackage,
  options: { floorId: string; label: string; level: number },
): { venue: VenuePackage; links: number; warnings: string[] } {
  const incoming = prefixIds(
    {
      ...floorPackage,
      floors: floorPackage.floors.map((f) => ({
        ...f,
        id: options.floorId,
        label: options.label,
        level: options.level,
      })),
      nodes: floorPackage.nodes.map((n) => ({
        ...n,
        floorId: options.floorId,
      })),
      anchors: floorPackage.anchors.map((a) => ({
        ...a,
        floorId: options.floorId,
      })),
    },
    `${options.floorId}.`,
  );
  if (!base) return linkVerticalCores(parseVenuePackage(incoming));
  const removed = new Set(
    base.nodes.filter((n) => n.floorId === options.floorId).map((n) => n.id),
  );
  const keepEdge = (e: Edge) => !removed.has(e.from) && !removed.has(e.to);
  const connectors = base.connectors
    .map((c) => ({ ...c, nodeIds: c.nodeIds.filter((n) => !removed.has(n)) }))
    .filter((c) => c.nodeIds.length >= 2);
  const merged: VenuePackage = {
    ...base,
    floors: [
      ...base.floors.filter((f) => f.id !== options.floorId),
      ...incoming.floors,
    ].sort((a, b) => a.level - b.level),
    nodes: [...base.nodes.filter((n) => !removed.has(n.id)), ...incoming.nodes],
    edges: [
      ...base.edges
        .filter(keepEdge)
        .filter(
          (e) =>
            !e.connectorId || connectors.some((c) => c.id === e.connectorId),
        ),
      ...incoming.edges,
    ],
    pois: [
      ...base.pois.filter((p) => !removed.has(p.nodeId)),
      ...incoming.pois,
    ],
    anchors: [
      ...base.anchors.filter((a) => !removed.has(a.nodeId)),
      ...incoming.anchors,
    ],
    connectors,
  };
  return linkVerticalCores(parseVenuePackage(merged));
}
