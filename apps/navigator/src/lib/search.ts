/**
 * Place search for a venue (Plan 005 §10). Pure and fast enough to run on every keystroke for a
 * few thousand places.
 *
 * - Words match from their start ("pharm" finds Pharmacy), in any order.
 * - Small typing mistakes are forgiven (one wrong letter in four, two in eight).
 * - Everyday words find categories ("toilet", "washroom", "wc" find restrooms).
 * - Room numbers match however they are written ("room 12", "R-12", "r12", "012").
 * - Equal matches are ordered by walking distance from where the walker is.
 */
export type SearchItem = {
  id: string;
  name: string;
  /** Category key (for example `restroom`) and its display label. */
  category: string;
  categoryLabel: string;
  tags?: string[];
  description?: string;
};
export type SearchHit<T extends SearchItem> = {
  item: T;
  score: number;
  /** What matched, for the result row's hint. */
  via: 'name' | 'number' | 'category' | 'tag' | 'description';
};

/** Words people use for the same thing. The first entry may name a category key. */
const SYNONYMS: { category?: string; words: string[] }[] = [
  {
    category: 'restroom',
    words: [
      'restroom',
      'restrooms',
      'toilet',
      'toilets',
      'washroom',
      'washrooms',
      'bathroom',
      'wc',
      'loo',
      'lavatory',
      'ladies',
      'gents',
    ],
  },
  {
    category: 'food',
    words: [
      'food',
      'cafe',
      'coffee',
      'tea',
      'chai',
      'canteen',
      'cafeteria',
      'restaurant',
      'eat',
      'lunch',
      'snack',
      'snacks',
      'drink',
      'drinks',
      'tuck',
    ],
  },
  {
    category: 'exit',
    words: ['exit', 'exits', 'entrance', 'entry', 'gate', 'way out', 'door'],
  },
  {
    category: 'stairs',
    words: ['stairs', 'staircase', 'lift', 'lifts', 'elevator', 'escalator'],
  },
  {
    category: 'health',
    words: [
      'health',
      'first aid',
      'medical',
      'clinic',
      'dispensary',
      'pharmacy',
      'chemist',
      'doctor',
      'nurse',
    ],
  },
  {
    category: 'service',
    words: [
      'service',
      'services',
      'info',
      'information',
      'help',
      'helpdesk',
      'reception',
      'enquiry',
      'inquiry',
    ],
  },
  {
    category: 'shop',
    words: ['shop', 'shops', 'store', 'stores', 'buy', 'shopping'],
  },
  { category: 'parking', words: ['parking', 'car park', 'carpark'] },
  {
    category: 'meeting',
    words: ['meeting', 'meetings', 'conference', 'seminar', 'boardroom'],
  },
  { words: ['lab', 'labs', 'laboratory'] },
  {
    words: ['classroom', 'class', 'lecture', 'lecture hall', 'lecture room'],
  },
  { words: ['prayer', 'mosque', 'masjid', 'namaz', 'musalla'] },
  { words: ['library', 'books', 'reading room'] },
  { words: ['atm', 'cash', 'bank'] },
  { words: ['office', 'admin', 'administration'] },
];

/** Lower case, no accents, punctuation as spaces. */
export function normalise(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
const words = (text: string) => normalise(text).split(' ').filter(Boolean);
/** Numbers in a text, without leading zeros ("R-012" gives ["12"]). */
const numbers = (text: string) =>
  (normalise(text).match(/\d+/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, ''));

/** Edit distance (insert, delete, replace, swap neighbours), stopping once it exceeds `max`. */
export function editDistance(a: string, b: string, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1] &&
        prev2[j - 2] !== undefined
      )
        v = Math.min(v, prev2[j - 2]! + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length]!;
}
/** Typing mistakes forgiven for a word of this length. */
const tolerance = (length: number) => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

/** How well one query word matches one word of a name: 1 exact, less for prefix and near misses. */
function wordMatch(q: string, w: string) {
  if (w === q) return 1;
  if (w.startsWith(q)) return q.length >= 2 ? 0.9 : 0.6;
  const allow = tolerance(q.length);
  if (!allow) return 0;
  // Compare against the same-length start of the word too, so a typo in a prefix still matches.
  const d = Math.min(
    editDistance(q, w, allow),
    w.length > q.length ? editDistance(q, w.slice(0, q.length), allow) : 99,
  );
  return d <= allow ? 0.62 - 0.12 * (d - 1) : 0;
}

/** Every query word matched by some word of `text`, in any order: mean quality, or 0. */
function allWords(queryWords: string[], text: string) {
  const target = words(text);
  if (!target.length) return 0;
  let total = 0;
  for (const q of queryWords) {
    let best = 0;
    for (const w of target) best = Math.max(best, wordMatch(q, w));
    if (best === 0) return 0;
    total += best;
  }
  return total / queryWords.length;
}

/** Categories and extra words a query implies through everyday synonyms. */
function expand(query: string) {
  const q = normalise(query);
  const categories = new Set<string>();
  const extra = new Set<string>();
  for (const group of SYNONYMS) {
    const hit = group.words.some((w) => {
      if (w === q) return true;
      // A started word ("toil") or a small typo ("toliet") still means the group.
      if (q.length >= 3 && w.startsWith(q)) return true;
      const allow = tolerance(q.length);
      return (
        allow > 0 && !w.includes(' ') && editDistance(q, w, allow) <= allow
      );
    });
    if (!hit) continue;
    if (group.category) categories.add(group.category);
    for (const w of group.words) extra.add(w);
  }
  return { categories, extra: [...extra] };
}

export function searchPlaces<T extends SearchItem>(
  items: T[],
  query: string,
  options: {
    category?: string | null;
    /** Walking distance in metres from the walker to a place, when known. */
    distance?: (id: string) => number | undefined;
  } = {},
): SearchHit<T>[] {
  const q = normalise(query);
  const pool = options.category
    ? items.filter((i) => i.category === options.category)
    : items;
  const byDistance = (a: SearchHit<T>, b: SearchHit<T>) =>
    b.score - a.score ||
    (options.distance?.(a.item.id) ?? 1e9) -
      (options.distance?.(b.item.id) ?? 1e9) ||
    a.item.name.localeCompare(b.item.name);
  if (!q)
    return pool
      .map((item): SearchHit<T> => ({ item, score: 1, via: 'name' }))
      .sort(byDistance);

  const qWords = q.split(' ');
  const qNumbers = numbers(q);
  const { categories, extra } = expand(q);
  const hits: SearchHit<T>[] = [];
  for (const item of pool) {
    const name = normalise(item.name);
    let score = 0;
    let via: SearchHit<T>['via'] = 'name';
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 92;
    else {
      const m = allWords(qWords, item.name);
      if (m > 0) score = 60 + 28 * m;
      else if (name.includes(q) && q.length >= 3) score = 58;
    }
    // "room 12", "r12", "012" all mean the place numbered 12.
    if (qNumbers.length) {
      const have = numbers(item.name);
      if (qNumbers.every((n) => have.includes(n))) {
        const rest = qWords.filter((w) => !/\d/.test(w));
        const restOk = rest.length === 0 || allWords(rest, item.name) > 0;
        const s = restOk ? 90 : 72;
        if (s > score) {
          score = s;
          via = 'number';
        }
      }
    }
    if (score < 56) {
      const label = normalise(item.categoryLabel);
      if (
        categories.has(item.category) ||
        label.startsWith(q) ||
        item.category.startsWith(q)
      ) {
        score = 55;
        via = 'category';
      } else if (extra.some((w) => allWords(words(w), item.name) > 0)) {
        // A synonym of the query appears in the name ("lab" finds "Physics Laboratory").
        score = 52;
        via = 'name';
      } else if ((item.tags ?? []).some((t) => allWords(qWords, t) > 0)) {
        score = 48;
        via = 'tag';
      } else if (
        q.length >= 3 &&
        item.description &&
        allWords(qWords, item.description) >= 0.9
      ) {
        score = 30;
        via = 'description';
      }
    }
    if (score > 0) hits.push({ item, score, via });
  }
  return hits.sort(byDistance);
}

/** When nothing matched: the names closest to what was typed ("Did you mean"). */
export function suggestions<T extends SearchItem>(
  items: T[],
  query: string,
  limit = 3,
): T[] {
  const q = normalise(query);
  if (q.length < 3) return [];
  return items
    .map((item) => {
      const d = Math.min(
        ...words(item.name).map((w) =>
          editDistance(q, w.slice(0, Math.max(q.length, 3)), 3),
        ),
        editDistance(q, normalise(item.name).slice(0, q.length + 2), 3),
      );
      return { item, d };
    })
    .filter((x) => x.d <= 3)
    .sort((a, b) => a.d - b.d || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((x) => x.item);
}
