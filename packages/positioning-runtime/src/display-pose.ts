import {
  buildWalkGraph,
  crossesWalls,
  pathLength,
  walkingPath,
  type Wall,
  type WalkGraph,
} from '@turn/positioning-core';
import type { P } from './assist-helpers';

export type DisplayOptions = {
  /** Snap to the route when within this distance (metres) and nothing solid is in between. */
  snapMetres: number;
  /** Largest animated speed (m/s); bigger jumps are teleports only after an explicit fix. */
  maxSpeed: number;
  /** Smoothing time constant (seconds). */
  tau: number;
  /** Treat the user as standing after this many seconds without walking. */
  standStillSeconds: number;
  /** While standing, ignore estimate moves smaller than this (metres). */
  standDeadband: number;
  /** On the route, ignore backward moves shorter than this (metres): people rarely walk back. */
  routeBacktrack: number;
  /** A walking path longer than this is a relocalisation: show it as a jump, not a walk. */
  teleportMetres: number;
};
export const DEFAULT_DISPLAY: DisplayOptions = {
  snapMetres: 2,
  maxSpeed: 2.5,
  tau: 0.2,
  standStillSeconds: 3,
  standDeadband: 0.6,
  routeBacktrack: 1.2,
  teleportMetres: 25,
};

/** Walls and walk graph of the floor being shown (the same shape as the fusion map). */
export type DisplayMap = {
  walls: Wall[];
  graph?: {
    nodes: (P & { id: string })[];
    edges: { from: string; to: string }[];
  };
};

type RoutePoint = { point: P; s: number; dist: number };

/** Closest point on a polyline and its arc length from the start. */
function projectOnRoute(route: P[], p: P): RoutePoint {
  let best: RoutePoint = { point: route[0]!, s: 0, dist: Infinity };
  let s = 0;
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i]!,
      b = route[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const t =
      len === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) /
                (len * len),
            ),
          );
    const point = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const dist = Math.hypot(p.x - point.x, p.y - point.y);
    if (dist < best.dist) best = { point, s: s + t * len, dist };
    s += len;
  }
  return best;
}
/** The part of a polyline between arc lengths s0 and s1 (either direction). */
function routeSlice(route: P[], s0: number, s1: number): P[] {
  const at = (target: number) => {
    let s = 0;
    for (let i = 0; i + 1 < route.length; i++) {
      const a = route[i]!,
        b = route[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (s + len >= target || i + 2 === route.length) {
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, (target - s) / len));
        return { i, p: { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) } };
      }
      s += len;
    }
    return { i: 0, p: route[0]! };
  };
  const lo = at(Math.min(s0, s1)),
    hi = at(Math.max(s0, s1));
  const forward = [lo.p, ...route.slice(lo.i + 1, hi.i + 1), hi.p];
  return s0 <= s1 ? forward : forward.reverse();
}

/**
 * What the blue dot shows, separate from what the filter believes (Plan 002 A3, ADR-0011). Like
 * maps apps: snap to the route when close, glide along it, and never draw a walk through a wall -
 * moves between rooms follow the walk graph through doors. Standing users do not wander.
 */
export class DisplayPose {
  private shown: P | null = null;
  /** Polyline still to animate, starting at the shown point. */
  private path: P[] = [];
  private lastWalkAt = -Infinity;
  private route: P[] | null = null;
  /** Arc length along the route of the shown point while it is snapped, else null. */
  private routeS: number | null = null;
  private walls: Wall[] = [];
  private graph: WalkGraph | null = null;
  constructor(private readonly opts: DisplayOptions = DEFAULT_DISPLAY) {}

  setRoute(route: P[] | null) {
    this.route = route && route.length > 1 ? route : null;
    this.routeS = null;
  }
  /** Walls and walk graph of the floor shown; null removes map awareness. */
  setMap(map: DisplayMap | null) {
    this.walls = map?.walls ?? [];
    this.graph = map?.graph
      ? buildWalkGraph(map.graph.nodes, map.graph.edges)
      : null;
  }
  /** Feed a new filter estimate. `walked` is true when this update came from a step. */
  update(est: P, now: number, walked: boolean, fix = false) {
    if (walked) this.lastWalkAt = now;
    let target = est;
    let targetS: number | null = null;
    if (this.route) {
      const on = projectOnRoute(this.route, est);
      if (
        on.dist <= this.opts.snapMetres &&
        !crossesWalls(est, on.point, this.walls)
      ) {
        target = on.point;
        targetS = on.s;
      }
    }
    const standing = now - this.lastWalkAt > this.opts.standStillSeconds;
    if (this.shown && !fix) {
      // Standing: only a larger, evidence-backed move is allowed through.
      if (
        standing &&
        Math.hypot(target.x - this.shown.x, target.y - this.shown.y) <
          this.opts.standDeadband
      )
        return;
      // Following the route: small backward wobbles are filter noise, not the walker turning back.
      if (
        targetS !== null &&
        this.routeS !== null &&
        targetS < this.routeS &&
        this.routeS - targetS < this.opts.routeBacktrack
      )
        return;
    }
    this.pendingS = targetS;
    if (!this.shown || fix) {
      this.shown = { ...target };
      this.routeS = targetS;
      this.path = [];
      return;
    }
    const path = this.pathTo(target, targetS);
    if (!path || pathLength(path) > this.opts.teleportMetres) {
      // No walkable connection (or a relocalisation across the building): jump, do not draw a walk.
      this.shown = { ...target };
      this.routeS = targetS;
      this.path = [];
      return;
    }
    this.path = path;
  }
  /** Arc length of the target on the route (applied once the animation arrives). */
  private pendingS: number | null = null;
  private pathTo(target: P, targetS: number | null): P[] | null {
    const from = this.shown!;
    if (this.route && this.routeS !== null && targetS !== null)
      return routeSlice(this.route, this.routeS, targetS);
    if (!this.walls.length || !crossesWalls(from, target, this.walls))
      return [from, target];
    return this.graph
      ? walkingPath(this.graph, this.walls, from, target)
      : [from, target];
  }
  /** Advance the animation by dt seconds; returns the point to draw. */
  step(dt: number): P | null {
    if (!this.shown || this.path.length < 2) return this.shown;
    const remaining = pathLength(this.path);
    if (remaining < 0.005) {
      this.finish();
      return this.shown;
    }
    const alpha = 1 - Math.exp(-dt / this.opts.tau);
    let move = Math.min(remaining * alpha, this.opts.maxSpeed * dt, remaining);
    // Walk the polyline: corners and doors are followed, never cut.
    let p = this.path[0]!;
    let i = 1;
    while (i < this.path.length && move > 0) {
      const q = this.path[i]!;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= move) {
        move -= d;
        p = q;
        i++;
      } else {
        p = {
          x: p.x + ((q.x - p.x) / d) * move,
          y: p.y + ((q.y - p.y) / d) * move,
        };
        move = 0;
      }
    }
    this.path = [p, ...this.path.slice(i)];
    this.shown = p;
    if (this.path.length < 2) this.finish();
    else if (this.route && this.pendingS !== null && this.routeS !== null)
      this.routeS = projectOnRoute(this.route, p).s;
    else this.routeS = null;
    return this.shown;
  }
  private finish() {
    this.path = [];
    this.routeS = this.pendingS;
  }
  current() {
    return this.shown;
  }
  reset() {
    this.shown = null;
    this.path = [];
    this.routeS = null;
    this.pendingS = null;
    this.lastWalkAt = -Infinity;
  }
}
