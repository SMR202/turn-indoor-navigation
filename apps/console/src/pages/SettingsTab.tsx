import { useState } from 'react';
import { api, ApiError } from '../api';
import { useToast } from '../ui';
import type { VenueCtx } from './Venue';

const swatches = [
  '#2F5AF2',
  '#1F8A5B',
  '#C0662A',
  '#8256C2',
  '#C2412D',
  '#24857F',
  '#0B1220',
];

/** Venue name, address and brand colour (route, blue dot and pins in the visitor app). */
export function SettingsTab({ venue, reload }: VenueCtx) {
  const toast = useToast();
  const [name, setName] = useState(venue.name);
  const [address, setAddress] = useState(venue.address);
  const [accent, setAccent] = useState(
    venue.content.branding.accent ?? '#2F5AF2',
  );
  const [error, setError] = useState<string | null>(null);
  const dirty =
    name !== venue.name ||
    address !== venue.address ||
    accent !== (venue.content.branding.accent ?? '#2F5AF2');
  const save = async () => {
    setError(null);
    try {
      await api(`/venues/${venue.id}`, {
        method: 'PATCH',
        body: { name, address, accent },
      });
      toast(
        'Settings saved — the colour reaches visitors with the next publish',
      );
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
    }
  };
  return (
    <div className="split">
      <div className="card col" style={{ gap: 16 }}>
        <h2>Venue</h2>
        <div className="field">
          <label>Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Address</label>
          <input
            className="input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Brand colour</label>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {swatches.map((s) => (
              <button
                key={s}
                aria-label={s}
                onClick={() => setAccent(s)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: s,
                  border:
                    accent === s
                      ? '3px solid var(--c-text)'
                      : '3px solid transparent',
                  cursor: 'pointer',
                }}
              />
            ))}
            <input
              className="input mono"
              style={{ width: 120 }}
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Custom colour (hex)"
            />
          </div>
          <p className="subtle" style={{ fontSize: 12.5 }}>
            Used for the route, the visitor's dot and pins on this venue's map.
            Keep it dark enough to read on white.
          </p>
        </div>
        <div className="row">
          <button
            className="btn primary"
            disabled={!dirty || !/^#[0-9a-fA-F]{6}$/.test(accent)}
            onClick={() => void save()}
          >
            Save
          </button>
          {error && <span style={{ color: 'var(--c-danger)' }}>{error}</span>}
        </div>
      </div>
      <div className="card">
        <div className="eyebrow">Preview</div>
        <svg
          viewBox="0 0 300 160"
          width="100%"
          style={{
            marginTop: 12,
            borderRadius: 14,
            background: 'var(--map-land)',
          }}
        >
          <rect
            x="20"
            y="20"
            width="260"
            height="120"
            rx="4"
            fill="#fff"
            stroke="var(--map-wall)"
            strokeWidth="2"
          />
          <rect
            x="20"
            y="70"
            width="260"
            height="22"
            fill="var(--map-circulation)"
          />
          <path
            d="M40 81 H220 V40"
            fill="none"
            stroke="#fff"
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M40 81 H220 V40"
            fill="none"
            stroke={accent}
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="40" cy="81" r="14" fill={accent} opacity="0.18" />
          <circle
            cx="40"
            cy="81"
            r="7"
            fill={accent}
            stroke="#fff"
            strokeWidth="3"
          />
          <path
            d="M220 40c0 0-10-11-10-18a10 10 0 0 1 20 0c0 7-10 18-10 18Z"
            fill={accent}
            stroke="#fff"
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
}
