import { useRef, useState } from 'react';
import { placeCategories } from '@turn/design';
import type { P } from '@turn/map-scene';
import { api, ApiError, type ImportReport, type Validation } from '../api';
import { MapCanvas } from '../map/MapCanvas';
import { href } from '../router';
import { CatBadge, Empty, Icon, useToast } from '../ui';
import type { VenueCtx } from './Venue';

export function MapTab({
  venue,
  pkg,
  scene,
  floors,
  floorId,
  setFloorId,
  floorPicker,
  reload,
}: VenueCtx) {
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [report, setReport] = useState<{
    report: ImportReport;
    validation: Validation;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  // Import target: the whole map, a new floor, or an existing floor (replaced).
  const [target, setTarget] = useState<string>(pkg ? 'new' : 'all');
  const nextLevel = floors.length
    ? Math.max(...floors.map((f) => f.level)) + 1
    : 0;
  const [floorLabel, setFloorLabel] = useState(
    pkg ? `Level ${nextLevel}` : 'Ground floor',
  );
  const [level, setLevel] = useState(nextLevel);
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'floor';
  const file = useRef<HTMLInputElement>(null);

  const importFile = async (f: File) => {
    setError(null);
    try {
      const geojson = JSON.parse(await f.text()) as unknown;
      const r = await api<{ report: ImportReport; validation: Validation }>(
        `/venues/${venue.id}/import`,
        {
          body:
            target === 'all'
              ? { geojson, floorLabel }
              : target === 'new'
                ? { geojson, floorLabel, floorId: slug(floorLabel), level }
                : {
                    geojson,
                    floorLabel:
                      floors.find((f) => f.id === target)?.label ?? floorLabel,
                    floorId: target,
                    level: floors.find((f) => f.id === target)?.level ?? 0,
                  },
        },
      );
      if (target === 'new') setFloorId(slug(floorLabel));
      else if (target !== 'all') setFloorId(target);
      setReport(r);
      toast(
        r.validation.ok
          ? 'Floor imported — ready to publish'
          : 'Floor imported as a draft — fix the issues below',
      );
      reload();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : e instanceof SyntaxError
            ? 'That file is not valid JSON.'
            : 'Import failed',
      );
    }
  };
  const addMarker = async (p: P) => {
    if (!pkg) return;
    const nodes = pkg.package.nodes.filter((n) => n.floorId === floorId);
    const near = nodes
      .map((n) => ({ n, d: Math.hypot(n.x - p.x, n.y - p.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!near || near.d > 4)
      return toast(
        'Click closer to a walkable spot (within 4 m of the route network).',
      );
    const label = window.prompt(
      'Marker label (shown to visitors as their start point)',
      'Entrance',
    );
    if (!label) return;
    const id = `qr-${label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
    const next = {
      ...pkg.package,
      anchors: [
        ...pkg.package.anchors,
        {
          id,
          venueId: pkg.package.venueId,
          floorId: near.n.floorId,
          kind: 'qr' as const,
          position: { x: near.n.x, y: near.n.y },
          label,
          nodeId: near.n.id,
        },
      ],
    };
    await api(`/venues/${venue.id}/package`, { method: 'PUT', body: next });
    setPlacing(false);
    toast(`Marker “${label}” added to the draft`);
    reload();
  };
  const removeMarker = async (id: string) => {
    if (!pkg) return;
    await api(`/venues/${venue.id}/package`, {
      method: 'PUT',
      body: {
        ...pkg.package,
        anchors: pkg.package.anchors.filter((a) => a.id !== id),
      },
    });
    reload();
  };
  const room = scene?.rooms.find((r) => r.id === selected);
  const place = room?.placeId
    ? scene?.places.find((p) => p.id === room.placeId)
    : null;
  const validation = report?.validation ?? pkg?.validation;
  return (
    <div className="split">
      <div className="col" style={{ gap: 16 }}>
        {scene ? (
          <MapCanvas
            scene={scene}
            height={620}
            selectedRoomId={selected}
            onRoomClick={(id) => setSelected(id)}
            onMapClick={placing ? (p) => void addMarker(p) : undefined}
            cursor={placing ? 'crosshair' : undefined}
            toolbar={floorPicker}
            anchors={pkg?.package.anchors
              .filter((a) => a.floorId === floorId)
              .map((a) => ({
                id: a.id,
                label: a.label,
                ...a.position,
              }))}
            legend={
              <>
                <span>
                  <span
                    className="swatch"
                    style={{
                      background: 'var(--map-room)',
                      border: '1px solid var(--c-line)',
                    }}
                  />
                  Rooms
                </span>
                <span>
                  <span
                    className="swatch"
                    style={{
                      background: 'var(--map-circulation)',
                      border: '1px solid var(--c-line)',
                    }}
                  />
                  Corridors
                </span>
                <span>
                  <span className="swatch" style={{ background: '#0B1220' }} />
                  QR entry markers
                </span>
              </>
            }
          />
        ) : (
          <div className="card">
            <Empty icon="layers" title="No floor plan yet">
              Import a Floor GeoJSON file from the plan-to-polygon module to
              create the map.
            </Empty>
          </div>
        )}
        {pkg && (
          <div className="card">
            <div className="card-head">
              <div>
                <h2>QR entry markers</h2>
                <p className="subtle" style={{ marginTop: 2 }}>
                  Print and mount at entrances; scanning sets the visitor's
                  exact start point.
                </p>
              </div>
              <button
                className={`btn ${placing ? 'dark' : ''}`}
                onClick={() => setPlacing((v) => !v)}
              >
                <Icon name="qr" size={15} />{' '}
                {placing ? 'Click the map…' : 'Add marker'}
              </button>
            </div>
            {pkg.package.anchors.length === 0 && (
              <p className="subtle">No markers yet.</p>
            )}
            {pkg.package.anchors.map((a) => (
              <div className="list-row" key={a.id}>
                <span
                  className="cat"
                  style={{ background: '#0B1220', borderRadius: 9 }}
                >
                  <Icon name="qr" size={15} color="#fff" />
                </span>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{a.label}</div>
                  <div className="subtle mono">
                    {a.id} · ({a.position.x.toFixed(1)},{' '}
                    {a.position.y.toFixed(1)}) m
                  </div>
                </div>
                <button
                  className="btn ghost sm danger"
                  onClick={() => void removeMarker(a.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="col" style={{ gap: 16 }}>
        {validation && (
          <div className="card">
            <div className="spread">
              <h2>Validation</h2>
              <span className={`badge ${validation.ok ? 'live' : 'danger'}`}>
                <span className="dot" />
                {validation.ok ? 'Ready' : `${validation.errors.length} to fix`}
              </span>
            </div>
            <p className="subtle" style={{ marginTop: 4 }}>
              {pkg?.status === 'draft'
                ? `Draft v${pkg.number}`
                : `Live v${pkg?.number ?? ''}`}
            </p>
            <div className="grid g3" style={{ marginTop: 14, gap: 8 }}>
              {Object.entries(validation.stats).map(([k, n]) => (
                <div
                  key={k}
                  style={{
                    background: 'var(--c-background)',
                    borderRadius: 10,
                    padding: '8px 10px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{n}</div>
                  <div className="subtle" style={{ fontSize: 11.5 }}>
                    {k.replace(/([A-Z])/g, ' $1').toLowerCase()}
                  </div>
                </div>
              ))}
            </div>
            {[
              ...validation.errors.map((e) => ['danger', e] as const),
              ...validation.warnings.map((w) => ['warn', w] as const),
            ].map(([tone, text]) => (
              <div
                key={text}
                className="row"
                style={{
                  marginTop: 10,
                  alignItems: 'flex-start',
                  color:
                    tone === 'danger' ? 'var(--c-danger)' : 'var(--c-warning)',
                }}
              >
                <Icon name={tone === 'danger' ? 'close' : 'info'} size={15} />
                <span>{text}</span>
              </div>
            ))}
          </div>
        )}
        {room && (
          <div className="card" key={room.id}>
            <div className="eyebrow">Selected space</div>
            <div className="row" style={{ marginTop: 10 }}>
              {place && <CatBadge category={place.category} />}
              <div className="grow">
                <h3>{room.name || 'Unnamed space'}</h3>
                <div className="subtle">
                  {room.kind} · {room.area.toFixed(1)} m²
                  {place ? ` · ${placeCategories[place.category].label}` : ''}
                </div>
              </div>
            </div>
            {place && (
              <a
                className="btn sm"
                style={{ marginTop: 12 }}
                href={href.venue(venue.id, 'places')}
              >
                Edit place details
              </a>
            )}
          </div>
        )}
        <div className="card">
          <h2>Import floor plan</h2>
          <p className="subtle" style={{ marginTop: 4 }}>
            Floor GeoJSON v1 (rooms, doors, optional walls and places) — the
            output of the plan-to-polygon module. Walls and the walking graph
            are derived; the result is saved as a draft.
          </p>
          <div className="field" style={{ marginTop: 14 }}>
            <label>Import into</label>
            <select
              className="select"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              {pkg && <option value="new">A new floor</option>}
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  Replace {f.label}
                </option>
              ))}
              <option value="all">Replace the whole map</option>
            </select>
          </div>
          {(target === 'new' || target === 'all') && (
            <div className="grid g2" style={{ marginTop: 10, gap: 10 }}>
              <div className="field">
                <label>Floor label</label>
                <input
                  className="input"
                  value={floorLabel}
                  onChange={(e) => setFloorLabel(e.target.value)}
                />
              </div>
              {target === 'new' && (
                <div className="field">
                  <label>Level</label>
                  <input
                    className="input"
                    type="number"
                    value={level}
                    onChange={(e) => setLevel(Number(e.target.value) || 0)}
                  />
                </div>
              )}
            </div>
          )}
          {target !== 'all' && (
            <p className="subtle" style={{ marginTop: 8, fontSize: 12.5 }}>
              Floors must share one coordinate frame (same image origin and
              scale). Stairs and lift rooms on neighbouring levels are linked
              automatically by name or position.
            </p>
          )}
          <div
            className={`drop ${over ? 'over' : ''}`}
            style={{ marginTop: 12 }}
            onClick={() => file.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files[0];
              if (f) void importFile(f);
            }}
          >
            <Icon name="layers" size={24} color="var(--c-accent)" />
            <div style={{ fontWeight: 600, marginTop: 8 }}>
              Drop a .geojson file or click to browse
            </div>
            <div className="subtle" style={{ fontSize: 12.5, marginTop: 2 }}>
              Pixels or metres · one file per floor
            </div>
            <input
              ref={file}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {error && (
            <div
              className="banner"
              style={{
                marginTop: 12,
                marginBottom: 0,
                background: 'var(--c-danger-soft)',
                color: 'var(--c-danger)',
              }}
            >
              {error}
            </div>
          )}
          {report && (
            <div className="col" style={{ marginTop: 14, gap: 4 }}>
              <div className="eyebrow">Import report</div>
              <div>
                {report.report.rooms} rooms · {report.report.doors} doors ·{' '}
                {report.report.walls} walls
                {report.report.wallsDerived ? ' (derived)' : ''}
              </div>
              <div>
                {report.report.places} places · {report.report.nodes} nodes ·{' '}
                {report.report.edges} paths
              </div>
              {report.report.warnings.map((w) => (
                <div key={w} className="subtle" style={{ fontSize: 12.5 }}>
                  • {w}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
