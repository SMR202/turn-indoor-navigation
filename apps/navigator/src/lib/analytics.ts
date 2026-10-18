import { postJson } from './api';
import { load } from './storage';

/**
 * Anonymous usage events for venue owners (searches, routes, arrivals). No location traces, no
 * account, a random session id per app launch; visitors can switch it off in Settings.
 */
export type UsageEvent = {
  venueId: string;
  type:
    | 'venue_opened'
    | 'search'
    | 'place_viewed'
    | 'route_started'
    | 'arrived'
    | 'route_cancelled';
  placeId?: string;
  query?: string;
};

const session = `s${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
const queue: (UsageEvent & { session: string; at: string })[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function track(event: UsageEvent) {
  if (!load('prefs', { shareUsage: true }).shareUsage) return;
  queue.push({ ...event, session, at: new Date().toISOString() });
  if (queue.length >= 20) void flush();
  else if (!timer) timer = setTimeout(() => void flush(), 8000);
}

async function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  const batch = queue.splice(0, 100);
  if (!batch.length) return;
  try {
    await postJson('/public/events', batch);
  } catch {
    // Offline: usage events are optional and are dropped rather than stored.
  }
}
