/**
 * Walking geometry for map constraints: wall-crossing tests and the shortest walkable path
 * between two points through the venue's walk graph (room centres, doors, corridor points).
 * Pure; venue metres, x right, y up.
 */
export type GraphPoint = { x: number; y: number };
export type Wall = { from: GraphPoint; to: GraphPoint };
export type WalkGraph = {
  nodes: GraphPoint[];
  /** adjacency: neighbour index and edge length (metres). */
  adj: { to: number; d: number }[][];
};

function orient(a: GraphPoint, b: GraphPoint, c: GraphPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
/** Proper intersection of segments ab and cd (touching at an end point does not count). */
export function segmentsIntersect(
  a: GraphPoint,
  b: GraphPoint,
  c: GraphPoint,
  d: GraphPoint,
) {
  const d1 = orient(a, b, c),
    d2 = orient(a, b, d),
    d3 = orient(c, d, a),
    d4 = orient(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
export function crossesWalls(a: GraphPoint, b: GraphPoint, walls: Wall[]) {
  for (const w of walls) if (segmentsIntersect(a, b, w.from, w.to)) return true;
  return false;
}

export function buildWalkGraph(
  nodes: (GraphPoint & { id: string })[],
  edges: { from: string; to: string }[],
): WalkGraph {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const adj: WalkGraph['adj'] = nodes.map(() => []);
  for (const e of edges) {
    const a = index.get(e.from),
      b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    const d = Math.hypot(nodes[a]!.x - nodes[b]!.x, nodes[a]!.y - nodes[b]!.y);
    adj[a]!.push({ to: b, d });
    adj[b]!.push({ to: a, d });
  }
  return { nodes: nodes.map(({ x, y }) => ({ x, y })), adj };
}

function visibleNodes(
  graph: WalkGraph,
  walls: Wall[],
  p: GraphPoint,
  max: number,
) {
  const byDistance = graph.nodes
    .map((n, i) => ({ i, d: Math.hypot(n.x - p.x, n.y - p.y) }))
    .sort((a, b) => a.d - b.d);
  // Nearest first, stopping early: wall tests dominate the cost on large floors.
  const out: { i: number; d: number }[] = [];
  for (const v of byDistance) {
    if (!crossesWalls(p, graph.nodes[v.i]!, walls)) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Shortest way to walk from `a` to `b` without crossing a wall: the straight segment when it is
 * clear, otherwise a polyline through the walk graph. Null when no walkable connection exists.
 */
export function walkingPath(
  graph: WalkGraph,
  walls: Wall[],
  a: GraphPoint,
  b: GraphPoint,
): GraphPoint[] | null {
  if (!crossesWalls(a, b, walls)) return [a, b];
  const from = visibleNodes(graph, walls, a, 4);
  const to = new Map(visibleNodes(graph, walls, b, 4).map((v) => [v.i, v.d]));
  if (!from.length || !to.size) return null;
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  for (const f of from) dist[f.i] = f.d;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++)
      if (!done[i] && dist[i]! < (u < 0 ? Infinity : dist[u]!)) u = i;
    if (u < 0) break;
    done[u] = 1;
    for (const { to: v, d } of graph.adj[u]!)
      if (dist[u]! + d < dist[v]!) {
        dist[v] = dist[u]! + d;
        prev[v] = u;
      }
  }
  let best = -1,
    bestCost = Infinity;
  for (const [i, d] of to)
    if (dist[i]! + d < bestCost) {
      bestCost = dist[i]! + d;
      best = i;
    }
  if (best < 0) return null;
  const chain: GraphPoint[] = [];
  for (let v = best; v >= 0; v = prev[v]!) chain.unshift(graph.nodes[v]!);
  return [a, ...chain, b];
}

export function pathLength(path: GraphPoint[]) {
  let n = 0;
  for (let i = 1; i < path.length; i++)
    n += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  return n;
}
