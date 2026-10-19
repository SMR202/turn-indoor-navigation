import { useEffect, useMemo, useState } from 'react';
import { lightMap } from '@turn/design';
import { buildScene, type Scene } from '@turn/map-scene';
import {
  useApi,
  type Analytics,
  type PackageResponse,
  type VenueDetail,
} from '../api';
import { MapCanvas } from '../map/MapCanvas';
import { href, type VenueTab } from '../router';
import { FloorPicker, fmt, Icon, StatusBadge } from '../ui';
import { AnalyticsTab } from './AnalyticsTab';
import { BeaconsTab } from './BeaconsTab';
import { MapTab } from './MapTab';
import { PlacesTab } from './PlacesTab';
import { PublishTab, QR, visitorLink } from './PublishTab';

export type Floor = { id: string; label: string; level: number };
export type VenueCtx = {
  venue: VenueDetail;
  pkg: PackageResponse | null;
  /** Scene of the floor being shown. */
  scene: Scene | null;
  scenes: Record<string, Scene>;
  floors: Floor[];
  floorId: string | null;
  setFloorId: (id: string) => void;
  /** The floor picker, for tabs that show a map. */
  floorPicker: React.ReactNode;
  reload: () => void;
};

export function VenuePage({
  id,
  tab,
  tabs,
  onChanged,
}: {
  id: string;
  tab: VenueTab;
  tabs: { tab: VenueTab; label: string; icon: string }[];
  onChanged: () => void;
}) {
  const venue = useApi<VenueDetail>(`/venues/${id}`);
  const pkg = useApi<PackageResponse>(`/venues/${id}/package`);
  const scenes = useMemo<Record<string, Scene>>(
    () =>
      pkg.data
        ? Object.fromEntries(
            pkg.data.package.floors.map((f) => [
              f.id,
              buildScene(pkg.data!.package, f.id, lightMap),
            ]),
          )
        : {},
    [pkg.data],
  );
  const floors = useMemo<Floor[]>(
    () =>
      [...(pkg.data?.package.floors ?? [])]
        .sort((a, b) => a.level - b.level)
        .map((f) => ({ id: f.id, label: f.label, level: f.level })),
    [pkg.data],
  );
  const [chosenFloor, setFloorId] = useState<string | null>(null);
  const floorId =
    chosenFloor && scenes[chosenFloor] ? chosenFloor : (floors[0]?.id ?? null);
  const scene = floorId ? (scenes[floorId] ?? null) : null;
  const reload = () => {
    venue.reload();
    pkg.reload();
    onChanged();
  };
  if (venue.error)
    return <div className="page empty">{venue.error.message}</div>;
  if (!venue.data)
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 60, marginTop: 12 }} />
        <div className="skeleton" style={{ height: 420, marginTop: 16 }} />
      </div>
    );
  const v = venue.data;
  const ctx: VenueCtx = {
    venue: v,
    pkg: pkg.data,
    scene,
    scenes,
    floors,
    floorId,
    setFloorId,
    floorPicker: (
      <FloorPicker floors={floors} value={floorId} onChange={setFloorId} />
    ),
    reload,
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 12 }}>
            <h1>{v.name}</h1>
            <StatusBadge venue={v} />
            {v.visibility === 'private-lan' && (
              <span className="badge ink">
                <Icon name="lock" size={11} /> Local network only
              </span>
            )}
          </div>
          <p className="muted">
            {v.orgName} · {v.address || 'No address yet'} · updated{' '}
            {fmt.ago(v.updatedAt)}
          </p>
        </div>
        <div className="row">
          {v.status === 'live' && (
            <a
              className="btn"
              href={visitorLink(v.id)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="navigate" size={15} /> Open visitor view
            </a>
          )}
          <a className="btn primary" href={href.venue(v.id, 'publish')}>
            <Icon name="share" size={15} /> Publish
          </a>
        </div>
      </div>
      <div className="tabs">
        {tabs.map((t) => (
          <a
            key={t.tab}
            href={href.venue(v.id, t.tab)}
            className={tab === t.tab ? 'active' : ''}
          >
            {t.label}
          </a>
        ))}
      </div>
      {tab === 'overview' && <OverviewTab {...ctx} />}
      {tab === 'map' && <MapTab {...ctx} />}
      {tab === 'places' && <PlacesTab {...ctx} />}
      {tab === 'beacons' && <BeaconsTab {...ctx} />}
      {tab === 'publish' && <PublishTab {...ctx} />}
      {tab === 'analytics' && <AnalyticsTab {...ctx} />}
    </div>
  );
}

function OverviewTab({ venue, pkg, scene, floorId, floorPicker }: VenueCtx) {
  const described = pkg
    ? pkg.package.pois.filter(
        (p) =>
          venue.content.places[p.id]?.description ||
          venue.content.places[p.id]?.hours,
      ).length / Math.max(1, pkg.package.pois.length)
    : 0;
  const steps = [
    {
      done: true,
      title: 'Create the venue',
      detail: 'Name, address and organisation',
      to: null,
    },
    {
      done: Boolean(pkg),
      title: 'Import a floor plan',
      detail: 'Floor GeoJSON from the plan-to-polygon module',
      to: 'map' as const,
    },
    {
      done: Boolean(pkg?.validation.ok),
      title: 'Check every place is reachable',
      detail: pkg
        ? pkg.validation.ok
          ? 'All routes validated'
          : pkg.validation.errors[0]
        : 'Runs after import',
      to: 'map' as const,
    },
    {
      done: described >= 0.5,
      title: 'Describe places',
      detail: `${Math.round(described * 100)}% have hours or a description`,
      to: 'places' as const,
    },
    {
      done: Boolean(pkg?.package.anchors.length),
      title: 'Add entry QR markers',
      detail: `${pkg?.package.anchors.length ?? 0} markers — visitors start exactly where they scan`,
      to: 'map' as const,
    },
    {
      done: venue.beacons > 0,
      title: 'Plan beacons',
      detail: venue.beacons
        ? `${venue.beacons} beacons in the layout`
        : 'Simulate coverage before buying hardware',
      to: 'beacons' as const,
    },
    {
      done: venue.status === 'live' && !venue.draftVersion,
      title: 'Publish to the TURN app',
      detail:
        venue.status === 'live'
          ? `Live since ${fmt.date(venue.publishedAt)}`
          : 'Validation must pass',
      to: 'publish' as const,
    },
  ];
  const progress = steps.filter((s) => s.done).length / steps.length;
  const analytics = useApi<Analytics>(`/venues/${venue.id}/analytics?days=7`);
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(progress), 80);
    return () => clearTimeout(t);
  }, [progress]);
  return (
    <div className="split">
      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Go-live checklist</h2>
              <p className="subtle" style={{ marginTop: 2 }}>
                {steps.filter((s) => s.done).length} of {steps.length} done
              </p>
            </div>
            <span className="mono subtle">{Math.round(progress * 100)}%</span>
          </div>
          <div className="bar" style={{ marginBottom: 12 }}>
            <i
              style={{
                width: `${w * 100}%`,
                transition: 'width 800ms var(--ease)',
                animation: 'none',
              }}
            />
          </div>
          <div className="checklist">
            {steps.map((s) => {
              const inner = (
                <>
                  <span className={`tick ${s.done ? 'done' : ''}`}>
                    {s.done && <Icon name="check" size={13} stroke={3} />}
                  </span>
                  <div className="grow">
                    <div
                      style={{
                        fontWeight: 600,
                        textDecoration: s.done ? 'none' : undefined,
                      }}
                    >
                      {s.title}
                    </div>
                    <div className="subtle" style={{ fontSize: 12.5 }}>
                      {s.detail}
                    </div>
                  </div>
                  {s.to && !s.done && (
                    <Icon
                      name="forward"
                      size={15}
                      color="var(--c-text-subtle)"
                    />
                  )}
                </>
              );
              return s.to ? (
                <a key={s.title} href={href.venue(venue.id, s.to)}>
                  {inner}
                </a>
              ) : (
                <div key={s.title} className="item">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
        {scene && (
          <div className="card flush">
            <MapCanvas
              scene={scene}
              height={380}
              toolbar={floorPicker}
              anchors={pkg?.package.anchors
                .filter((a) => a.floorId === floorId)
                .map((a) => ({
                  id: a.id,
                  label: a.label,
                  ...a.position,
                }))}
            />
          </div>
        )}
      </div>
      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="eyebrow">Last 7 days</div>
          <div className="grid g2" style={{ marginTop: 12, gap: 12 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {analytics.data?.totals.sessions ?? '—'}
              </div>
              <div className="subtle">Visitors</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>
                {fmt.pct(analytics.data?.totals.completion)}
              </div>
              <div className="subtle">Arrived</div>
            </div>
          </div>
          {analytics.data?.sampleData && (
            <div className="banner" style={{ marginTop: 14, marginBottom: 0 }}>
              Includes generated sample data for this demo venue.
            </div>
          )}
          <a
            href={href.venue(venue.id, 'analytics')}
            className="row"
            style={{ marginTop: 14, fontWeight: 600 }}
          >
            Open analytics <Icon name="forward" size={14} />
          </a>
        </div>
        <div className="card">
          <div className="eyebrow">Visitor link</div>
          <p className="muted" style={{ marginTop: 8 }}>
            Opens this venue in TURN on any phone on{' '}
            {venue.visibility === 'private-lan'
              ? 'this local network'
              : 'the network'}{' '}
            — no download needed.
          </p>
          <div
            className="row"
            style={{ marginTop: 14, alignItems: 'flex-start', gap: 14 }}
          >
            <QR text={visitorLink(venue.id)} size={112} />
            <div className="col grow" style={{ gap: 6, minWidth: 0 }}>
              <span className="mono" style={{ wordBreak: 'break-all' }}>
                {visitorLink(venue.id)}
              </span>
              <span className="subtle" style={{ fontSize: 12 }}>
                {venue.status === 'live'
                  ? 'Live version'
                  : 'Publish first — the link shows the live version only.'}
              </span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="eyebrow">Positioning quality</div>
          {venue.quality ? (
            <div className="col" style={{ marginTop: 10, gap: 6 }}>
              <div>
                <b>{venue.quality.medianErrorM ?? '—'} m</b>{' '}
                <span className="subtle">
                  median error from {venue.quality.walks} walks
                </span>
              </div>
              <div className="subtle">
                Recorded {fmt.date(venue.quality.at)}
              </div>
            </div>
          ) : (
            <p className="muted" style={{ marginTop: 8 }}>
              Not measured yet. TURN staff record accuracy from real walks with
              landmark marks after beacons are installed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
