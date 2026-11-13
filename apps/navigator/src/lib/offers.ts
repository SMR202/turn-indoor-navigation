/**
 * Offers and tips near a place (Plan 005 §11), decided on the phone. The walker's position never
 * leaves the device: the venue publishes its offers with the map, this engine decides when one is
 * worth showing, and only anonymous counts (shown, opened, dismissed) go back.
 *
 * Restraint is the feature. An offer shows only when the position is trustworthy, the walker is
 * not in the middle of a turn, nothing else is on screen, and it has not been shown recently.
 */
export type Offer = {
  id: string;
  title: string;
  text?: string;
  placeId: string;
  radiusMetres: number;
  dwellSeconds: number;
  startsAt?: string;
  endsAt?: string;
  /** Local window "HH:MM-HH:MM"; may run past midnight ("20:00-02:00"). */
  hours?: string;
  /** Days of the week it runs (0 = Sunday); every day when empty. */
  days?: number[];
  cooldownMinutes: number;
  active: boolean;
};
export type OfferPlace = { floorId: string; x: number; y: number };
/** When each offer was last shown to this visitor (ms since 1970), kept on the phone. */
export type OfferMemory = Record<string, number>;

export type OfferLimits = {
  /** Shortest time between any two offers (seconds). */
  gapSeconds: number;
  /** Most offers in one visit to a venue. */
  perVisit: number;
  /** An uncertain position must still be within this many metres of certain (1σ). */
  maxSigmaMetres: number;
};
export const DEFAULT_OFFER_LIMITS: OfferLimits = {
  gapSeconds: 120,
  perVisit: 6,
  maxSigmaMetres: 6,
};

/** Whether an offer runs at this moment (dates, days of the week, hours; local time). */
export function offerRuns(offer: Offer, now: Date) {
  if (!offer.active) return false;
  if (offer.startsAt && now < new Date(offer.startsAt)) return false;
  if (offer.endsAt && now > new Date(offer.endsAt)) return false;
  if (offer.days?.length && !offer.days.includes(now.getDay())) return false;
  if (offer.hours) {
    const [from, to] = offer.hours
      .split('-')
      .map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))) as [
      number,
      number,
    ];
    const minute = now.getHours() * 60 + now.getMinutes();
    const inside =
      from <= to
        ? minute >= from && minute < to
        : minute >= from || minute < to;
    if (!inside) return false;
  }
  return true;
}

export class OfferEngine {
  private readonly inRangeSince = new Map<string, number>();
  private lastShownAt = -Infinity;
  private shownThisVisit = 0;

  constructor(
    private readonly offers: Offer[],
    private readonly places: Map<string, OfferPlace>,
    private readonly memory: OfferMemory = {},
    private readonly limits: OfferLimits = DEFAULT_OFFER_LIMITS,
  ) {}

  /** What this visitor has been shown, to store on the phone. */
  get remembered(): OfferMemory {
    return { ...this.memory };
  }

  /**
   * Call about once a second with the walker's position. Returns the offer to show now, already
   * counted as shown, or null.
   */
  update(input: {
    now: Date;
    floorId: string;
    x: number;
    y: number;
    /** Position uncertainty (metres, one standard deviation). */
    sigma: number;
    /** A turn is coming, or another offer or sheet is on screen: stay quiet. */
    busy: boolean;
  }): Offer | null {
    const t = input.now.getTime();
    const near: { offer: Offer; distance: number }[] = [];
    for (const offer of this.offers) {
      const place = this.places.get(offer.placeId);
      const distance =
        place && place.floorId === input.floorId
          ? Math.hypot(place.x - input.x, place.y - input.y)
          : Infinity;
      // A position that may be a room away must not trigger a small radius.
      const trusted =
        input.sigma <= Math.max(this.limits.maxSigmaMetres, offer.radiusMetres);
      if (
        distance > offer.radiusMetres ||
        !trusted ||
        !offerRuns(offer, input.now)
      ) {
        this.inRangeSince.delete(offer.id);
        continue;
      }
      if (!this.inRangeSince.has(offer.id)) this.inRangeSince.set(offer.id, t);
      const stayed = (t - this.inRangeSince.get(offer.id)!) / 1000;
      const last = this.memory[offer.id];
      const rested =
        last === undefined || t - last >= offer.cooldownMinutes * 60_000;
      if (stayed >= offer.dwellSeconds && rested)
        near.push({ offer, distance });
    }
    if (
      input.busy ||
      !near.length ||
      this.shownThisVisit >= this.limits.perVisit ||
      t - this.lastShownAt < this.limits.gapSeconds * 1000
    )
      return null;
    const pick = near.sort((a, b) => a.distance - b.distance)[0]!.offer;
    this.memory[pick.id] = t;
    this.lastShownAt = t;
    this.shownThisVisit++;
    return pick;
  }
}
