import { describe, expect, it } from 'vitest';
import { OfferEngine, offerRuns, type Offer } from './offers';

const offer = (over: Partial<Offer> = {}): Offer => ({
  id: 'offer-coffee',
  title: '10% off coffee',
  placeId: 'cafe',
  radiusMetres: 10,
  dwellSeconds: 0,
  cooldownMinutes: 60,
  active: true,
  ...over,
});
const places = new Map([
  ['cafe', { floorId: 'g', x: 10, y: 10 }],
  ['books', { floorId: 'g', x: 40, y: 10 }],
  ['cinema', { floorId: 'l1', x: 10, y: 10 }],
]);
// A Wednesday at 10:00 local time.
const at = (seconds = 0) => new Date(2026, 10, 18, 10, 0, seconds);
const here = (x: number, extra: object = {}) => ({
  floorId: 'g',
  x,
  y: 10,
  sigma: 2,
  busy: false,
  ...extra,
});

describe('offers near a place', () => {
  it('shows once on arrival, then rests for its cooldown', () => {
    const e = new OfferEngine([offer()], places);
    expect(e.update({ now: at(0), ...here(30) })).toBeNull(); // too far
    expect(e.update({ now: at(1), ...here(14) })?.id).toBe('offer-coffee');
    expect(e.update({ now: at(2), ...here(12) })).toBeNull();
    // Back an hour and a bit later: it may show again.
    expect(e.update({ now: at(3700), ...here(12) })?.id).toBe('offer-coffee');
  });

  it('waits for the dwell time, and starts again after leaving', () => {
    const e = new OfferEngine([offer({ dwellSeconds: 20 })], places);
    expect(e.update({ now: at(0), ...here(12) })).toBeNull();
    expect(e.update({ now: at(10), ...here(12) })).toBeNull();
    expect(e.update({ now: at(11), ...here(40) })).toBeNull(); // walked off
    expect(e.update({ now: at(12), ...here(12) })).toBeNull();
    expect(e.update({ now: at(31), ...here(12) })).toBeNull();
    expect(e.update({ now: at(33), ...here(12) })?.id).toBe('offer-coffee');
  });

  it('stays quiet on another floor, when the position is unsure and during a turn', () => {
    const e = new OfferEngine([offer()], places);
    expect(e.update({ now: at(0), ...here(10, { floorId: 'l1' }) })).toBeNull();
    expect(e.update({ now: at(1), ...here(10, { sigma: 14 }) })).toBeNull();
    expect(e.update({ now: at(2), ...here(10, { busy: true }) })).toBeNull();
    // The turn is over and the walker is still there: now it shows.
    expect(e.update({ now: at(3), ...here(10) })?.id).toBe('offer-coffee');
  });

  it('never shows two offers close together, and picks the nearest', () => {
    const e = new OfferEngine(
      [
        offer(),
        offer({ id: 'offer-books', placeId: 'books', radiusMetres: 40 }),
      ],
      places,
    );
    expect(e.update({ now: at(0), ...here(12) })?.id).toBe('offer-coffee');
    expect(e.update({ now: at(30), ...here(12) })).toBeNull(); // books in range, but too soon
    expect(e.update({ now: at(125), ...here(12) })?.id).toBe('offer-books');
  });

  it('stops after the limit for one visit', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      offer({ id: `offer-${i}`, radiusMetres: 50 }),
    );
    const e = new OfferEngine(
      many,
      places,
      {},
      {
        gapSeconds: 1,
        perVisit: 3,
        maxSigmaMetres: 6,
      },
    );
    const shown = [];
    for (let s = 0; s < 20; s += 2) {
      const o = e.update({ now: at(s), ...here(10) });
      if (o) shown.push(o.id);
    }
    expect(shown).toHaveLength(3);
  });

  it('remembers what it showed on an earlier visit', () => {
    const first = new OfferEngine([offer()], places);
    first.update({ now: at(0), ...here(10) });
    const later = new OfferEngine([offer()], places, first.remembered);
    expect(later.update({ now: at(600), ...here(10) })).toBeNull();
    expect(later.update({ now: at(3700), ...here(10) })?.id).toBe(
      'offer-coffee',
    );
  });
});

describe('offer schedule', () => {
  it('respects active, dates, days and hours', () => {
    expect(offerRuns(offer({ active: false }), at())).toBe(false);
    expect(
      offerRuns(
        offer({ startsAt: new Date(2026, 10, 19).toISOString() }),
        at(),
      ),
    ).toBe(false);
    expect(
      offerRuns(offer({ endsAt: new Date(2026, 10, 17).toISOString() }), at()),
    ).toBe(false);
    expect(offerRuns(offer({ days: [3] }), at())).toBe(true); // Wednesday
    expect(offerRuns(offer({ days: [0, 6] }), at())).toBe(false);
    expect(offerRuns(offer({ hours: '09:00-12:00' }), at())).toBe(true);
    expect(offerRuns(offer({ hours: '12:00-14:00' }), at())).toBe(false);
  });
  it('handles hours that run past midnight', () => {
    const late = offer({ hours: '20:00-02:00' });
    expect(offerRuns(late, new Date(2026, 10, 18, 23, 30))).toBe(true);
    expect(offerRuns(late, new Date(2026, 10, 18, 1, 30))).toBe(true);
    expect(offerRuns(late, new Date(2026, 10, 18, 10, 0))).toBe(false);
  });
});
