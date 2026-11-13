import { describe, expect, it } from 'vitest';
import {
  editDistance,
  normalise,
  searchPlaces,
  suggestions,
  type SearchItem,
} from './search';

const place = (
  id: string,
  name: string,
  category = 'room',
  extra: Partial<SearchItem> = {},
): SearchItem => ({
  id,
  name,
  category,
  categoryLabel:
    {
      restroom: 'Restrooms',
      food: 'Food & drink',
      health: 'Health',
      stairs: 'Stairs & lifts',
      room: 'Rooms',
      service: 'Services',
    }[category] ?? 'Other',
  ...extra,
});
const items = [
  place('cafe', 'Harbour Café', 'food'),
  place('market', 'Fresh Market', 'food', { tags: ['bakery', 'deli'] }),
  place('wc-g', 'Restrooms', 'restroom'),
  place('wc-1', 'Restrooms Level 1', 'restroom'),
  place('pharm', 'Pharmacy', 'health'),
  place('r12', 'R-012 Lecture Room'),
  place('r112', 'Room 112'),
  place('physics', 'Physics Laboratory'),
  place('lib', 'Central Library', 'service', {
    description: 'Quiet study, printing and photocopying.',
  }),
  place('lift', 'Stairs & Lift', 'stairs'),
  place('prayer', 'Prayer Room'),
];
const ids = (q: string, options?: Parameters<typeof searchPlaces>[2]) =>
  searchPlaces(items, q, options).map((h) => h.item.id);

describe('search', () => {
  it('finds names by the start of any word, in any order, ignoring accents', () => {
    expect(ids('pharm')[0]).toBe('pharm');
    expect(ids('cafe')[0]).toBe('cafe');
    expect(ids('café harbour')[0]).toBe('cafe');
    expect(ids('market fresh')[0]).toBe('market');
    expect(normalise('  Café—Bar ')).toBe('cafe bar');
  });

  it('forgives small typing mistakes', () => {
    expect(ids('pharmcy')[0]).toBe('pharm');
    expect(ids('libary')[0]).toBe('lib');
    expect(ids('farmacy')).toEqual([]); // two letters wrong in a short word is too far
    expect(editDistance('harbuor', 'harbour')).toBe(1); // swapped neighbours count once
  });

  it('understands everyday words for categories', () => {
    for (const q of ['toilet', 'washroom', 'WC', 'loo', 'toliet'])
      expect(ids(q).slice(0, 2).sort()).toEqual(['wc-1', 'wc-g']);
    expect(ids('coffee')).toEqual(expect.arrayContaining(['cafe', 'market']));
    expect(ids('elevator')[0]).toBe('lift');
    expect(ids('lab')[0]).toBe('physics');
    expect(ids('masjid')[0]).toBe('prayer');
  });

  it('matches room numbers however they are written', () => {
    for (const q of ['12', 'r12', 'R-12', 'room 12', '012'])
      expect(ids(q)[0]).toBe('r12');
    expect(ids('112')[0]).toBe('r112');
    // "12" must not find room 112.
    expect(ids('12')).not.toContain('r112');
  });

  it('searches tags and descriptions after names', () => {
    expect(ids('bakery')).toEqual(['market']);
    expect(ids('printing')).toEqual(['lib']);
  });

  it('orders equal matches by walking distance, and lists everything nearest first without a query', () => {
    const far = new Map([
      ['wc-g', 80],
      ['wc-1', 12],
    ]);
    expect(
      ids('toilet', { distance: (id) => far.get(id) }).slice(0, 2),
    ).toEqual(['wc-1', 'wc-g']);
    expect(ids('', { distance: (id) => far.get(id) })[0]).toBe('wc-1');
    expect(ids('', { category: 'food' }).sort()).toEqual(['cafe', 'market']);
  });

  it('prefers a name match over a category match', () => {
    const hits = searchPlaces(
      [...items, place('rest', 'Restroom Supplies Store')],
      'restroom',
    );
    expect(hits[0]!.via).toBe('name');
  });

  it('offers the closest names when nothing matches', () => {
    expect(ids('xyzzy')).toEqual([]);
    expect(suggestions(items, 'farmacy').map((i) => i.id)).toContain('pharm');
    expect(suggestions(items, 'xy')).toEqual([]);
  });
});
