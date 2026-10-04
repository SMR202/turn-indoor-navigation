import type { Point, Pose, Route } from '@turn/contracts';

export type Guidance = {
  status:
    | 'ready'
    | 'following'
    | 'near-destination'
    | 'off-route'
    | 'recover'
    | 'unsupported';
  remainingMetres: number;
  distanceToActionMetres: number;
  action: 'continue' | 'left' | 'right' | 'turn-around' | 'arrive';
  crossTrackMetres: number;
  message: string;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function projection(p: Point, a: Point, b: Point) {
  const length = distance(a, b);
  const t =
    ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (length * length);
  const along = Math.max(0, Math.min(1, t)) * length;
  return {
    along,
    distance: distance(p, {
      x: a.x + (along * (b.x - a.x)) / length,
      y: a.y + (along * (b.y - a.y)) / length,
    }),
  };
}
export function initialRouteHeading(route: Route): number | null {
  const start = route.geometry[0];
  const next = route.geometry.find((p) => start && distance(start, p) > 0.01);
  return start && next && start.floorId === next.floorId
    ? Math.atan2(next.y - start.y, next.x - start.x)
    : null;
}

/** Sequential route progress, NOT pose correction or wall-based map matching.
 * A new instance after an anchor/re-route resets the progress and recovery latch.
 */
export class RouteGuidance {
  private points: Route['geometry'];
  private lengths: number[];
  private prefix: number[] = [0];
  private segment = 0;
  private cornerVisited = false;
  private offRouteSince: number | null = null;
  private recovery = false;
  private lastTime = -Infinity;
  private result: Guidance;
  constructor(readonly route: Route) {
    this.points = route.geometry.filter(
      (p, i, a) =>
        i === 0 ||
        p.floorId !== a[i - 1]!.floorId ||
        distance(p, a[i - 1]!) > 0.01,
    );
    this.lengths = this.points
      .slice(1)
      .map((p, i) => distance(this.points[i]!, p));
    for (const length of this.lengths)
      this.prefix.push(this.prefix.at(-1)! + length);
    this.result = {
      status: 'ready',
      remainingMetres: this.prefix.at(-1)!,
      distanceToActionMetres: this.prefix.at(-1)!,
      action: 'continue',
      crossTrackMetres: 0,
      message: 'Face the first highlighted route segment, then start.',
    };
    if (
      !this.points.length ||
      this.points.some((p) => p.floorId !== this.points[0]!.floorId)
    )
      this.result = {
        ...this.result,
        status: 'unsupported',
        message:
          'This screen supports routes on one floor. Choose a destination on this floor.',
      };
  }
  snapshot(): Guidance {
    return { ...this.result };
  }
  consume(pose: Pose): Guidance {
    if (this.result.status === 'unsupported') return this.snapshot();
    if (this.recovery) return this.snapshot();
    if (
      pose.status === 'lost' ||
      pose.venueId !== this.route.venueId ||
      pose.venueRevision !== this.route.venueRevision ||
      pose.floorId !== this.points[0]!.floorId ||
      pose.timestampSeconds < this.lastTime
    ) {
      return this.recover(
        'Position needs checking. Scan a known location marker to recalculate.',
      );
    }
    this.lastTime = pose.timestampSeconds;
    const end = this.points.at(-1)!;
    if (this.points.length === 1) {
      if (distance(pose.position, end) > 1)
        return this.recover('Check your location before confirming arrival.');
      this.result = {
        ...this.result,
        status: 'near-destination',
        remainingMetres: 0,
        distanceToActionMetres: 0,
        action: 'arrive',
        message: 'You may be at your destination. Confirm it in person.',
      };
      return this.snapshot();
    }
    let a = this.points[this.segment]!,
      b = this.points[this.segment + 1]!;
    let projected = projection(pose.position, a, b);
    if (distance(pose.position, b) <= 0.8) this.cornerVisited = true;
    if (this.cornerVisited && this.segment + 2 < this.points.length) {
      const next = projection(pose.position, b, this.points[this.segment + 2]!);
      if (
        next.along >= Math.min(0.4, this.lengths[this.segment + 1]! / 2) &&
        next.distance + 0.05 < projected.distance
      ) {
        this.segment++;
        this.cornerVisited = false;
        a = this.points[this.segment]!;
        b = this.points[this.segment + 1]!;
        projected = projection(pose.position, a, b);
      }
    }
    if (projected.distance > 2) {
      this.offRouteSince ??= pose.timestampSeconds;
      this.result = {
        ...this.result,
        status:
          pose.timestampSeconds - this.offRouteSince >= 1
            ? 'off-route'
            : 'following',
        crossTrackMetres: projected.distance,
        message:
          'Estimate away from the route. Recording continues; turn instructions may be unreliable. You can reset at a known location.',
      };
      return this.snapshot();
    }
    this.offRouteSince = null;
    const progress = this.prefix[this.segment]! + projected.along;
    const remaining = this.prefix.at(-1)! - progress;
    let action: Guidance['action'] = 'arrive';
    let actionAt = this.prefix.at(-1)!;
    for (let i = this.segment + 1; i + 1 < this.points.length; i++) {
      const prev = this.points[i - 1]!,
        p = this.points[i]!,
        next = this.points[i + 1]!;
      const incoming = Math.atan2(p.y - prev.y, p.x - prev.x);
      const outgoing = Math.atan2(next.y - p.y, next.x - p.x);
      const angle = Math.atan2(
        Math.sin(outgoing - incoming),
        Math.cos(outgoing - incoming),
      );
      if (Math.abs(angle) < Math.PI / 6) continue;
      action =
        Math.abs(angle) > (5 * Math.PI) / 6
          ? 'turn-around'
          : angle > 0
            ? 'left'
            : 'right';
      actionAt = this.prefix[i]!;
      break;
    }
    const near =
      this.segment === this.lengths.length - 1 &&
      remaining <= 1 &&
      distance(pose.position, end) <= 1;
    this.result = {
      status: near ? 'near-destination' : 'following',
      remainingMetres: remaining,
      distanceToActionMetres: Math.max(0, actionAt - progress),
      action,
      crossTrackMetres: projected.distance,
      message: near
        ? 'You may be near your destination. Check the room before confirming.'
        : 'Estimated progress. Follow the route only where the physical path is clear.',
    };
    return this.snapshot();
  }
  private recover(message: string) {
    this.recovery = true;
    this.result = { ...this.result, status: 'recover', message };
    return this.snapshot();
  }
}
