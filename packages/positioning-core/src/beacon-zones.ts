export type ZonePoint = { x: number; y: number };
export type ZoneRoom = { name: string; polygon: ZonePoint[] };
export type ZoneReading = { tag: string; rssi: number };
export type ZoneResult = {
  room: string | null;
  /** 'high' when the leading room's strongest beacon beats every other room's by the lead margin. */
  confidence: 'high' | 'low';
  leadDb: number | null;
};

function inPolygon(p: ZonePoint, polygon: ZonePoint[]) {
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
 * Which room are we in, judged only by which room's beacon is strongest (Plan 002 B4). Far more
 * robust than distance estimation with weak or few beacons because it only compares signals. A
 * switch needs a margin and a short hold, so the answer does not flicker at room boundaries.
 */
export class RoomZoneClassifier {
  private readonly roomOfTag = new Map<string, string>();
  private current: string | null = null;
  private challenger: { room: string; since: number } | null = null;
  constructor(
    beacons: { tag: string; x: number; y: number }[],
    rooms: ZoneRoom[],
    private readonly options = {
      minRssi: -88,
      switchMarginDb: 3,
      holdSeconds: 2,
      highLeadDb: 6,
    },
  ) {
    for (const b of beacons) {
      const room = rooms.find((r) => inPolygon(b, r.polygon));
      if (room) this.roomOfTag.set(b.tag, room.name);
    }
  }
  /** Room that contains a beacon, if known. */
  roomOf(tag: string) {
    return this.roomOfTag.get(tag) ?? null;
  }
  update(at: number, readings: ZoneReading[]): ZoneResult {
    const best = new Map<string, number>();
    for (const r of readings) {
      const room = this.roomOfTag.get(r.tag);
      if (!room || r.rssi < this.options.minRssi) continue;
      best.set(room, Math.max(best.get(room) ?? -Infinity, r.rssi));
    }
    const ranked = [...best].sort((a, b) => b[1] - a[1]);
    if (!ranked.length)
      return { room: this.current, confidence: 'low', leadDb: null };
    const [topRoom, topRssi] = ranked[0]!;
    const secondRssi = ranked[1]?.[1];
    const lead = secondRssi === undefined ? null : topRssi - secondRssi;
    if (this.current === null) {
      this.current = topRoom;
    } else if (topRoom !== this.current) {
      const currentRssi = best.get(this.current) ?? -Infinity;
      if (topRssi - currentRssi >= this.options.switchMarginDb) {
        if (this.challenger?.room !== topRoom)
          this.challenger = { room: topRoom, since: at };
        else if (at - this.challenger.since >= this.options.holdSeconds) {
          this.current = topRoom;
          this.challenger = null;
        }
      } else this.challenger = null;
    } else this.challenger = null;
    const confident =
      this.current === topRoom &&
      (lead === null || lead >= this.options.highLeadDb);
    return {
      room: this.current,
      confidence: confident ? 'high' : 'low',
      leadDb: lead,
    };
  }
  reset() {
    this.current = null;
    this.challenger = null;
  }
}
