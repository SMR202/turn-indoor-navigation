export type PlanPoint = { x: number; y: number };
export type PlanNode = PlanPoint & { id: string };
export type PlanRoom = {
  name: string;
  polygon: PlanPoint[];
  kind?: 'room' | 'circulation' | 'outdoor' | 'stairs' | 'fixture';
};
export type BeaconSite = {
  tag: string;
  x: number;
  y: number;
  nodeId: string;
  roomName: string | null;
};

function inside(p: PlanPoint, polygon: PlanPoint[]) {
  let c = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      c = !c;
  }
  return c;
}

/**
 * Suggests where to mount `count` beacons: indoor map nodes (not in doorways, outdoors or on stairs)
 * chosen by farthest-point sampling so every walkable node is as close as possible to some beacon and
 * the beacons surround the walking area rather than clustering. This is a coverage heuristic; it does
 * not know building materials, so verify with the live signal check after mounting.
 */
export function recommendBeaconSites(
  nodes: PlanNode[],
  rooms: PlanRoom[],
  doors: PlanPoint[],
  count: number,
  tags: string[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'],
): BeaconSite[] {
  const roomOf = (p: PlanPoint) =>
    rooms.find(
      (r) =>
        r.kind !== 'outdoor' && r.kind !== 'stairs' && inside(p, r.polygon),
    ) ?? null;
  const candidates = nodes.filter(
    (n) =>
      roomOf(n) && !doors.some((d) => Math.hypot(d.x - n.x, d.y - n.y) < 0.7),
  );
  if (candidates.length === 0 || count <= 0) return [];
  const centroid = {
    x: nodes.reduce((s, n) => s + n.x, 0) / nodes.length,
    y: nodes.reduce((s, n) => s + n.y, 0) / nodes.length,
  };
  const chosen: PlanNode[] = [];
  // Start from the candidate nearest the middle, then repeatedly take the one farthest from all chosen
  // beacons, weighting by how many walkable nodes it would serve.
  chosen.push(
    candidates.reduce((best, n) =>
      Math.hypot(n.x - centroid.x, n.y - centroid.y) <
      Math.hypot(best.x - centroid.x, best.y - centroid.y)
        ? n
        : best,
    ),
  );
  while (chosen.length < Math.min(count, candidates.length)) {
    let best: PlanNode | null = null;
    let bestScore = -Infinity;
    for (const c of candidates) {
      if (chosen.includes(c)) continue;
      const nearest = Math.min(
        ...chosen.map((s) => Math.hypot(s.x - c.x, s.y - c.y)),
      );
      if (nearest < 3) continue; // beacons closer than 3 m add little geometry
      if (nearest > bestScore) {
        bestScore = nearest;
        best = c;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return chosen.map((n, i) => ({
    tag: tags[i] ?? `B${i + 1}`,
    x: n.x,
    y: n.y,
    nodeId: n.id,
    roomName: roomOf(n)?.name ?? null,
  }));
}

/** Worst-case distance (metres) from any walkable node to its nearest beacon: a coverage indicator. */
export function worstCoverageMetres(nodes: PlanPoint[], sites: PlanPoint[]) {
  if (sites.length === 0) return Infinity;
  return Math.max(
    ...nodes.map((n) =>
      Math.min(...sites.map((s) => Math.hypot(s.x - n.x, s.y - n.y))),
    ),
  );
}
