import type { Route } from '@turn/contracts';
import type { VenuePackage } from '@turn/venue-model';
import { Graph, alg } from '@dagrejs/graphlib';

export type RouteResult =
  | { status: 'ok'; route: Route }
  | { status: 'unreachable' | 'invalid-endpoint' };

/** Graphlib shortest paths behind TURN contracts. Call with a validated VenuePackage. */
export function calculateRoute(
  venue: VenuePackage,
  sourceNodeId: string,
  destinationNodeId: string,
  options: { stepFree?: boolean } = {},
): RouteResult {
  const nodes = new Map(venue.nodes.map((node) => [node.id, node]));
  if (!nodes.has(sourceNodeId) || !nodes.has(destinationNodeId))
    return { status: 'invalid-endpoint' };
  const graph = new Graph({ directed: true, multigraph: true });
  for (const node of venue.nodes) graph.setNode(node.id);
  for (const edge of venue.edges) {
    if (options.stepFree && !edge.stepFree) continue;
    graph.setEdge(edge.from, edge.to, edge.distanceMetres, edge.id);
    if (edge.bidirectional)
      graph.setEdge(edge.to, edge.from, edge.distanceMetres, edge.id);
  }
  const paths = alg.dijkstra(
    graph,
    sourceNodeId,
    (edge) => graph.edge(edge) as number,
  );
  const distanceMetres = paths[destinationNodeId]!.distance;
  if (!Number.isFinite(distanceMetres)) return { status: 'unreachable' };
  const nodeIds = [destinationNodeId];
  while (nodeIds[0] !== sourceNodeId) {
    const parent = paths[nodeIds[0]!]!.predecessor;
    if (!parent) return { status: 'unreachable' };
    nodeIds.unshift(parent);
  }
  const geometry = nodeIds.map((id) => {
    const node = nodes.get(id)!;
    return { x: node.x, y: node.y, floorId: node.floorId };
  });
  return {
    status: 'ok',
    route: {
      schemaVersion: 1,
      venueId: venue.venueId,
      venueRevision: venue.revision,
      sourceNodeId,
      destinationNodeId,
      stepFree: options.stepFree ?? false,
      distanceMetres,
      nodeIds,
      geometry,
      instructions: nodeIds.flatMap<Route['instructions'][number]>(
        (nodeId, index) => {
          const floorId = nodes.get(nodeId)!.floorId;
          const transition =
            index > 0 && geometry[index - 1]!.floorId !== floorId;
          const instruction: Route['instructions'][number] = {
            nodeId,
            floorId,
            kind: transition
              ? 'floor-transition'
              : index === nodeIds.length - 1
                ? 'arrive'
                : index === 0
                  ? 'depart'
                  : 'continue',
            text: transition
              ? `Continue to ${venue.floors.find((floor) => floor.id === floorId)!.label}`
              : index === nodeIds.length - 1
                ? 'Arrive at your destination'
                : index === 0
                  ? 'Start at the selected location'
                  : 'Continue along the highlighted route',
          };
          return transition && index === nodeIds.length - 1
            ? [
                instruction,
                {
                  nodeId,
                  floorId,
                  kind: 'arrive',
                  text: 'Arrive at your destination',
                },
              ]
            : [instruction];
        },
      ),
    },
  };
}
