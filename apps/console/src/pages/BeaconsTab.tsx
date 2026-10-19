import { useEffect, useMemo, useState } from 'react';
import {
  coverageMap,
  planBeacons,
  type PlannerInput,
} from '@turn/positioning-core';
import { api, useApi, type Beacon, type BeaconHealth } from '../api';
import { heardColor, MapCanvas } from '../map/MapCanvas';
import { href } from '../router';
import { Empty, fmt, Icon, useToast } from '../ui';
import type { VenueCtx } from './Venue';

/** Path-loss presets: what the hardware is expected to transmit, measured at 1 m. */
const hardware = {
  commercial: { label: 'Beacon · +4 dBm', refRssi: -59 },
  phone: { label: 'Phone as beacon', refRssi: -75 },
} as const;

export function BeaconsTab({
  venue,
  pkg,
  scene,
  floorId,
  floorPicker,
  reload,
}: VenueCtx) {
  const toast = useToast();
  const [beacons, setBeacons] = useState<Beacon[]>(venue.content.beacons);
  const [count, setCount] = useState(
    Math.max(4, venue.content.beacons.length || 6),
  );
  const [kind, setKind] = useState<keyof typeof hardware>(
    venue.content.beacons[0]?.referenceRssi === hardware.phone.refRssi
      ? 'phone'
      : 'commercial',
  );
  const [adding, setAdding] = useState(false);
  const [showCoverage, setShowCoverage] = useState(true);
  const health = useApi<BeaconHealth[]>(`/venues/${venue.id}/beacons/health`);
  useEffect(() => setBeacons(venue.content.beacons), [venue.content.beacons]);
  const floor = pkg?.package.floors.find((f) => f.id === floorId);
  const input = useMemo<PlannerInput | null>(
    () =>
      pkg && floor
        ? {
            rooms: floor.rooms.map((r) => ({
              name: r.name,
              polygon: r.polygon,
              kind: r.kind,
            })),
            walls: floor.walls,
            candidates: pkg.package.nodes
              .filter((n) => n.floorId === floor.id)
              .map((n) => ({ x: n.x, y: n.y, id: n.id })),
            doors: floor.doors.map((d) => d.position),
          }
        : null,
    [pkg, floor],
  );
  const options = { refRssi: hardware[kind].refRssi, gridMetres: 1 };
  const here = beacons.filter((b) => b.floorId === floor?.id);
  const coverage = useMemo(
    () => (input && here.length ? coverageMap(input, here, options) : null),
    [input, beacons, kind, floor?.id],
  );
  const dirty =
    JSON.stringify(beacons) !== JSON.stringify(venue.content.beacons) ||
    beacons.some(
      (b) => !b.calibratedAt && b.referenceRssi !== hardware[kind].refRssi,
    );
  if (!scene || !input || !floor)
    return (
      <div className="card">
        <Empty icon="beacon" title="Import a floor plan first">
          Beacon planning needs walls and rooms.{' '}
          <a href={href.venue(venue.id, 'map')}>Go to Map</a>.
        </Empty>
      </div>
    );
  const suggest = () => {
    // Tags stay unique across floors.
    const taken = new Set(
      beacons.filter((b) => b.floorId !== floor.id).map((b) => b.tag),
    );
    const tags = Array.from({ length: 64 }, (_, i) => `B${i + 1}`).filter(
      (t) => !taken.has(t),
    );
    const plan = planBeacons(input, { ...options, count, tags });
    setBeacons((bs) => [
      ...bs.filter((b) => b.floorId !== floor.id),
      ...plan.sites.map((s) => ({
        tag: s.tag,
        floorId: floor.id,
        x: Number(s.x.toFixed(2)),
        y: Number(s.y.toFixed(2)),
      })),
    ]);
    toast(`Suggested ${plan.sites.length} sites — drag to adjust`);
  };
  const save = async () => {
    // Uncalibrated beacons carry the hardware model's 1 m RSSI so phones can use them at once;
    // an on-site calibration (calibratedAt) replaces it.
    const body = beacons.map((b) =>
      b.calibratedAt ? b : { ...b, referenceRssi: hardware[kind].refRssi },
    );
    await api(`/venues/${venue.id}/beacons`, { method: 'PUT', body });
    toast('Beacon layout saved');
    reload();
    health.reload();
  };
  const q = coverage?.quality;
  const healthByTag = new Map((health.data ?? []).map((h) => [h.tag, h]));
  return (
    <div className="split">
      <div className="col" style={{ gap: 16 }}>
        <MapCanvas
          scene={scene}
          height={620}
          placeMarkers={false}
          toolbar={floorPicker}
          coverage={showCoverage ? coverage?.points : undefined}
          beacons={here.map((b) => ({
            ...b,
            tone: healthByTag.get(b.tag)?.lastSeen ? 'ok' : 'planned',
          }))}
          onBeaconMove={(tag, p) =>
            setBeacons((bs) =>
              bs.map((b) =>
                b.tag === tag
                  ? {
                      ...b,
                      x: Number(p.x.toFixed(2)),
                      y: Number(p.y.toFixed(2)),
                    }
                  : b,
              ),
            )
          }
          onMapClick={
            adding
              ? (p) => {
                  const used = new Set(beacons.map((b) => b.tag));
                  let n = 1;
                  while (used.has(`B${n}`)) n++;
                  setBeacons((bs) => [
                    ...bs,
                    {
                      tag: `B${n}`,
                      floorId: floor.id,
                      x: Number(p.x.toFixed(2)),
                      y: Number(p.y.toFixed(2)),
                    },
                  ]);
                  setAdding(false);
                }
              : undefined
          }
          cursor={adding ? 'crosshair' : undefined}
          legend={
            <>
              <span className="eyebrow" style={{ marginRight: 2 }}>
                Beacons heard
              </span>
              {[0, 1, 2, 3, 4].map((n) => (
                <span key={n}>
                  <span
                    className="swatch"
                    style={{ background: heardColor(n), opacity: 0.7 }}
                  />
                  {n === 4 ? '4+' : n}
                </span>
              ))}
            </>
          }
        />
        <div className="card">
          <h2>Before you buy and mount</h2>
          <div className="grid g2" style={{ marginTop: 12, gap: 14 }}>
            {[
              [
                'beacon',
                'Choose beacons with Eddystone-UID',
                'iPhones only see iBeacon through slow location ranging; Eddystone frames are visible to both iPhone and Android scanners.',
              ],
              [
                'layers',
                'Mount about 2 m high, in a zigzag',
                'Never in a straight line: collinear beacons cannot tell left from right. Aim for 4 heard everywhere.',
              ],
              [
                'sliders',
                '+4 dBm, 100 ms advertising',
                'Stronger, faster advertising gives steadier readings. Mains or USB power avoids battery drift.',
              ],
              [
                'check',
                'Verify on site',
                'The model knows walls, not materials. Walk the venue with the TURN test app and record real readings.',
              ],
            ].map(([icon, title, text]) => (
              <div
                key={title}
                className="row"
                style={{ alignItems: 'flex-start', gap: 12 }}
              >
                <span
                  className="cat"
                  style={{ background: 'var(--c-accent-soft)' }}
                >
                  <Icon name={icon!} size={15} color="var(--c-accent)" />
                </span>
                <div>
                  <div style={{ fontWeight: 600 }}>{title}</div>
                  <div className="subtle" style={{ fontSize: 12.5 }}>
                    {text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <h2>Plan the layout</h2>
          <p className="subtle" style={{ marginTop: 4 }}>
            Simulated coverage: log-distance path loss with 4 dB per wall. A
            planning aid, not a measurement.
          </p>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Hardware</label>
            <div className="segmented">
              {(Object.keys(hardware) as (keyof typeof hardware)[]).map((k) => (
                <button
                  key={k}
                  className={kind === k ? 'on' : ''}
                  onClick={() => setKind(k)}
                >
                  {hardware[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>
              Beacons: <b>{count}</b>
            </label>
            <input
              type="range"
              min={2}
              max={12}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={suggest}>
              <Icon name="beacon" size={15} /> Suggest sites
            </button>
            <button
              className={`btn ${adding ? 'dark' : ''}`}
              onClick={() => setAdding((v) => !v)}
            >
              <Icon name="plus" size={15} /> {adding ? 'Click map…' : 'Add'}
            </button>
          </div>
          <hr className="hairline" />
          <div className="grid g2" style={{ gap: 10 }}>
            <Metric
              label="Hear 3 or more"
              value={fmt.pct(q?.coverage3)}
              good={(q?.coverage3 ?? 0) >= 0.8}
            />
            <Metric
              label="Hear 4 or more"
              value={fmt.pct(q?.coverageTarget)}
              good={(q?.coverageTarget ?? 0) >= 0.7}
            />
            <Metric
              label="Weakest spot hears"
              value={q ? `${q.minHeard}` : '—'}
              good={(q?.minHeard ?? 0) >= 2}
            />
            <Metric
              label="Layout spread"
              value={q ? q.collinearity.toFixed(2) : '—'}
              good={(q?.collinearity ?? 0) >= 0.3}
              hint="0 = a line, 1 = round"
            />
          </div>
          <label className="check" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={showCoverage}
              onChange={(e) => setShowCoverage(e.target.checked)}
            />{' '}
            Show coverage on the map
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="btn primary grow"
              disabled={!dirty}
              onClick={() => void save()}
            >
              Save layout
            </button>
            {dirty && (
              <button
                className="btn ghost"
                onClick={() => setBeacons(venue.content.beacons)}
              >
                Reset
              </button>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Beacons</h2>
            <span className="subtle">
              {here.length} on this floor · {beacons.length} total
            </span>
          </div>
          {here.length === 0 && (
            <p className="subtle">
              No beacons yet. Suggest sites or add them on the map.
            </p>
          )}
          {here.map((b) => {
            const h = healthByTag.get(b.tag);
            return (
              <div className="list-row" key={b.tag}>
                <span
                  className="cat"
                  style={{ background: 'var(--map-beacon)' }}
                >
                  <Icon name="beacon" size={15} color="#fff" />
                </span>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{b.tag}</div>
                  <div className="subtle" style={{ fontSize: 12.5 }}>
                    {h?.lastSeen
                      ? `Seen ${fmt.ago(h.lastSeen)}${h.battery != null ? ` · battery ${h.battery}%` : ''}`
                      : 'Not reported yet'}{' '}
                    · ({b.x.toFixed(1)}, {b.y.toFixed(1)})
                  </div>
                </div>
                <button
                  className="btn ghost sm danger"
                  onClick={() =>
                    setBeacons((bs) => bs.filter((x) => x.tag !== b.tag))
                  }
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  good,
  hint,
}: {
  label: string;
  value: string;
  good: boolean;
  hint?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--c-background)',
        borderRadius: 12,
        padding: '10px 12px',
      }}
      title={hint}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 18,
          color:
            value === '—'
              ? undefined
              : good
                ? 'var(--c-success)'
                : 'var(--c-warning)',
        }}
      >
        {value}
      </div>
      <div className="subtle" style={{ fontSize: 12 }}>
        {label}
      </div>
    </div>
  );
}
