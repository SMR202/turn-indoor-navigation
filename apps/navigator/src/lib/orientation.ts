import { useEffect, useState } from 'react';
import type { VenueOrientation } from '@turn/positioning-runtime';
import { getJson, postJson } from './api';
import { load, save } from './storage';

/**
 * Which way the venue's map faces (ADR-0014): its georeference from TURN Studio and the compass
 * offsets other phones learned there. Kept on the phone for offline starts; refreshed on open.
 */
export function useVenueOrientation(venueId: string, online: boolean) {
  const key = `orientation-${venueId}`;
  const [value, setValue] = useState<VenueOrientation | null>(() =>
    load<VenueOrientation | null>(key, null),
  );
  useEffect(() => {
    if (!online) return;
    let live = true;
    getJson<VenueOrientation>(`/public/venues/${venueId}/orientation`)
      .then((r) => {
        if (!live || r.status !== 200 || !r.body) return;
        save(key, r.body);
        setValue(r.body);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [venueId, online, key]);
  return value;
}

/** Shares a confidently learned compass offset with the venue server (no personal data). */
export function shareOrientation(
  venueId: string,
  body: {
    platform: 'ios' | 'android';
    northOffsetRad: number;
    spreadRad: number;
    walkedMetres: number;
  },
) {
  postJson(`/public/venues/${venueId}/orientation`, body).catch(
    () => undefined,
  );
}
