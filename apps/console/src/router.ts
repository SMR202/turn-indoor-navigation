import { useEffect, useState } from 'react';

export type VenueTab =
  'overview' | 'map' | 'places' | 'beacons' | 'publish' | 'analytics';
export type Route =
  | { name: 'home' }
  | { name: 'venue'; id: string; tab: VenueTab }
  | { name: 'ops' }
  | { name: 'orgs' };

const tabs: VenueTab[] = [
  'overview',
  'map',
  'places',
  'beacons',
  'publish',
  'analytics',
];

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'venues' && parts[1]) {
    const tab = (tabs as string[]).includes(parts[2] ?? '')
      ? (parts[2] as VenueTab)
      : 'overview';
    return { name: 'venue', id: decodeURIComponent(parts[1]), tab };
  }
  if (parts[0] === 'ops')
    return parts[1] === 'orgs' ? { name: 'orgs' } : { name: 'ops' };
  return { name: 'home' };
}

export const href = {
  home: '#/',
  venue: (id: string, tab: VenueTab = 'overview') =>
    `#/venues/${encodeURIComponent(id)}/${tab}`,
  ops: '#/ops',
  orgs: '#/ops/orgs',
};
export const go = (h: string) => {
  location.hash = h;
};

export function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
