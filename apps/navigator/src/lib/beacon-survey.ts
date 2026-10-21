/**
 * Beacon test survey: the phone stands next to each placed beacon for a few seconds and records
 * every beacon it hears. Because every spot is a known position, the readings test the setup
 * (is each beacon the strongest at its own spot?) and fit the radio model on site: each beacon's
 * level one metre away and how fast signals fall off through this building's walls.
 */

/** Median RSSI (dBm) and packet count of every placed beacon heard while standing at one. */
export type SurveySpot = {
  /** The beacon stood next to. */
  tag: string;
  at: string;
  seconds: number;
  readings: Record<string, { median: number; count: number }>;
};
export type SpotResult = {
  tag: string;
  /** This beacon's own median at its spot, null when it was not heard. */
  own: number | null;
  strongest: string | null;
  strongestRssi: number | null;
  /** Own minus the best other beacon (dB); positive means it was the strongest. */
  marginDb: number | null;
  pass: boolean;
};
export type SurveyFit = {
  /** Path-loss exponent for this building (about 2 in open space, 3+ through walls). */
  exponent: number;
  /** Fitted median RSSI one metre from each beacon (dBm). */
  references: Record<string, number>;
  /** Root-mean-square misfit of all readings (dB): a measure of how predictable the radio is. */
  rmsDb: number;
  observations: number;
};

/** The phone stands about this far from the beacon it is next to (chest height under a 2 m mount). */
export const STAND_OFF_METRES = 0.8;
/** Survey recordings this short are not trusted. */
export const SURVEY_SECONDS = 10;

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function spotResult(spot: SurveySpot): SpotResult {
  const own = spot.readings[spot.tag]?.median ?? null;
  let strongest: string | null = null;
  let strongestRssi = -Infinity;
  let bestOther = -Infinity;
  for (const [tag, r] of Object.entries(spot.readings)) {
    if (r.median > strongestRssi) {
      strongestRssi = r.median;
      strongest = tag;
    }
    if (tag !== spot.tag) bestOther = Math.max(bestOther, r.median);
  }
  const marginDb =
    own === null ? null : bestOther === -Infinity ? 99 : own - bestOther;
  return {
    tag: spot.tag,
    own,
    strongest,
    strongestRssi: strongest === null ? null : strongestRssi,
    marginDb,
    pass: marginDb !== null && marginDb > 0,
  };
}

/**
 * Least-squares log-distance model over every reading of the survey: rssi = A_k − 10 n log10 d.
 * One exponent n for the building (walls included, on average), one A_k per beacon (its 1 m level
 * with this phone). Medians make one shadowed reading harmless. Null with fewer than three spots.
 */
export function fitSurvey(
  spots: SurveySpot[],
  beacons: { tag: string; x: number; y: number }[],
  standOff = STAND_OFF_METRES,
): SurveyFit | null {
  const where = new Map(beacons.map((b) => [b.tag, b]));
  const obs: { tag: string; logd: number; rssi: number }[] = [];
  for (const s of spots) {
    const at = where.get(s.tag);
    if (!at) continue;
    for (const [tag, r] of Object.entries(s.readings)) {
      const b = where.get(tag);
      if (!b || r.count < 2) continue;
      const d =
        tag === s.tag
          ? standOff
          : Math.max(standOff, Math.hypot(b.x - at.x, b.y - at.y));
      obs.push({ tag, logd: 10 * Math.log10(d), rssi: r.median });
    }
  }
  const usedSpots = new Set(
    spots.filter((s) => where.has(s.tag)).map((s) => s.tag),
  );
  if (usedSpots.size < 3) return null;
  const byTag = new Map<string, typeof obs>();
  for (const o of obs) byTag.set(o.tag, [...(byTag.get(o.tag) ?? []), o]);
  // A beacon needs two distances to separate its level from the falloff.
  for (const [tag, list] of byTag)
    if (new Set(list.map((o) => o.logd.toFixed(2))).size < 2) byTag.delete(tag);
  if (byTag.size < 2) return null;
  let best: SurveyFit | null = null;
  for (let n = 1.5; n <= 4.0001; n += 0.05) {
    const references: Record<string, number> = {};
    let sse = 0,
      count = 0;
    for (const [tag, list] of byTag) {
      const a = median(list.map((o) => o.rssi + n * o.logd));
      references[tag] = a;
      for (const o of list) {
        sse += (o.rssi - (a - n * o.logd)) ** 2;
        count++;
      }
    }
    const rmsDb = Math.sqrt(sse / count);
    if (!best || rmsDb < best.rmsDb)
      best = {
        exponent: Math.round(n * 100) / 100,
        references,
        rmsDb,
        observations: count,
      };
  }
  return best;
}
