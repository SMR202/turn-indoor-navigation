import { useState } from 'react';
import type { Georeference } from '@turn/map-scene';
import { api, ApiError } from '../api';
import { GeoreferenceEditor } from '../map/GeoreferenceEditor';
import { useToast } from '../ui';
import type { VenueCtx } from './Venue';

/**
 * Where the venue is and which way is north (ADR-0014). Phones use it to know which way the map
 * faces from the first step, instead of guessing from the route.
 */
export function OrientationCard({ venue, scene, reload }: VenueCtx) {
  const toast = useToast();
  const saved = venue.content.georeference ?? null;
  const [draft, setDraft] = useState<Georeference | null>(saved);
  const [declination, setDeclination] = useState(
    String(saved?.declinationDeg ?? ''),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!scene)
    return (
      <div className="card">
        <h2>Location and north</h2>
        <p className="subtle">Import a floor plan first.</p>
      </div>
    );
  const save = async (value: Georeference | null) => {
    setBusy(true);
    setError(null);
    try {
      const decl = Number(declination);
      await api(`/venues/${venue.id}/georeference`, {
        method: 'PUT',
        body: value
          ? {
              lat: Number(value.lat.toFixed(7)),
              lon: Number(value.lon.toFixed(7)),
              bearingDeg: Number(((value.bearingDeg + 360) % 360).toFixed(2)),
              ...(declination.trim() && Number.isFinite(decl)
                ? { declinationDeg: decl }
                : {}),
              source: 'studio',
            }
          : null,
      });
      toast(
        value
          ? 'Location and north saved: phones now start facing the right way'
          : 'Location removed',
      );
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card col" style={{ gap: 14, marginTop: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2>Location and north</h2>
          <p className="subtle" style={{ marginTop: 4, maxWidth: 680 }}>
            Move the background until the real building sits under the plan,
            then turn the plan until the walls line up. Phones use this to know
            which way the map faces from the very first step.
          </p>
        </div>
        <span className={`badge ${saved ? 'accent' : ''}`}>
          {saved
            ? `Saved · ${Math.round(saved.bearingDeg)}° · ${saved.source}`
            : 'Not set'}
        </span>
      </div>
      <GeoreferenceEditor scene={scene} initial={saved} onChange={setDraft} />
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div className="field" style={{ width: 220 }}>
          <label>Magnetic declination (°, east +)</label>
          <input
            className="input mono"
            inputMode="decimal"
            placeholder="e.g. 3.6 for Islamabad"
            value={declination}
            onChange={(e) => setDeclination(e.target.value)}
          />
        </div>
        <span className="subtle mono" style={{ fontSize: 12.5 }}>
          {draft
            ? `${draft.lat.toFixed(6)}, ${draft.lon.toFixed(6)} · ${draft.bearingDeg.toFixed(1)}°`
            : ''}
        </span>
        <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          {saved && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => void save(null)}
            >
              Remove
            </button>
          )}
          <button
            className="btn primary"
            disabled={busy || !draft}
            onClick={() => void save(draft)}
          >
            Save location and north
          </button>
        </div>
      </div>
      {error && <p style={{ color: 'var(--c-danger)' }}>{error}</p>}
    </div>
  );
}
