import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { pointInPolygon, type Scene } from '@turn/map-scene';
import type { Beacon } from '../api';
import { MapCanvas } from '../map/MapCanvas';
import { Icon } from '../ui';
import type { Floor } from './Venue';

/** The room a point is in (smallest room containing it), for "where to mount". */
function roomAt(scene: Scene, p: { x: number; y: number }) {
  return (
    scene.rooms
      .filter((r) => r.name && pointInPolygon(p, r.polygon))
      .sort((a, b) => a.area - b.area)[0]?.name ?? null
  );
}

/**
 * A printable plan for the people mounting beacons: each floor's numbered sites on the map, a
 * table to fill in (beacon ID, mounted, calibrated) and the steps in the TURN app.
 */
export function InstallSheet({
  venueName,
  beacons,
  scenes,
  floors,
  onClose,
}: {
  venueName: string;
  beacons: Beacon[];
  scenes: Record<string, Scene>;
  floors: Floor[];
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.classList.add('print-sheet');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('print-sheet');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const used = floors.filter((f) =>
    beacons.some((b) => b.floorId === f.id && scenes[f.id]),
  );
  const today = new Date().toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return createPortal(
    <div
      className="install-sheet"
      role="dialog"
      aria-modal="true"
      aria-label="Beacon install sheet"
    >
      <div className="install-bar no-print">
        <b>Beacon install sheet</b>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={() => window.print()}>
            <Icon name="check" size={15} /> Print
          </button>
        </div>
      </div>
      {used.map((f) => {
        const scene = scenes[f.id]!;
        const here = beacons.filter((b) => b.floorId === f.id);
        return (
          <section className="install-page" key={f.id}>
            <header className="spread">
              <div>
                <div className="eyebrow">Beacon install sheet</div>
                <h1 style={{ margin: '2px 0 0' }}>
                  {venueName}
                  {floors.length > 1 ? ` · ${f.label}` : ''}
                </h1>
              </div>
              <div className="subtle" style={{ textAlign: 'right' }}>
                {today}
                <br />
                {here.length} sites
              </div>
            </header>
            <MapCanvas
              scene={scene}
              height={430}
              placeMarkers={false}
              beacons={here.map((b) => ({
                tag: b.tag,
                x: b.x,
                y: b.y,
                tone: b.planned ? 'planned' : undefined,
              }))}
            />
            <table className="table install-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Where</th>
                  <th>Position (m)</th>
                  <th>Beacon ID</th>
                  <th>Mounted</th>
                  <th>Added in app</th>
                  <th>Calibrated</th>
                </tr>
              </thead>
              <tbody>
                {here.map((b) => (
                  <tr key={b.tag}>
                    <td>
                      <b>{b.tag}</b>
                    </td>
                    <td>{roomAt(scene, b) ?? 'Corridor'}</td>
                    <td className="muted">
                      {b.x.toFixed(1)}, {b.y.toFixed(1)}
                    </td>
                    <td className="fill-in">{b.planned ? '' : b.tag}</td>
                    <td className="box">☐</td>
                    <td className="box">☐</td>
                    <td className="box">{b.calibratedAt ? '☑' : '☐'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="grid g2 install-notes">
              <div>
                <b>Mounting</b>
                <ul>
                  <li>
                    About 2 m high, on the wall or ceiling, in clear view of the
                    room; not inside cupboards or behind metal.
                  </li>
                  <li>
                    Beacon settings: Eddystone-UID on, +4 dBm, 100 ms
                    advertising. Note the 12-digit instance ID.
                  </li>
                  <li>
                    Within 1 m of the marked site is fine. Further: move the pin
                    in the app.
                  </li>
                </ul>
              </div>
              <div>
                <b>In the TURN app (Beacons)</b>
                <ol>
                  <li>
                    Stand next to the mounted beacon: it rises to the top of
                    Nearby. Tap it, Add to venue.
                  </li>
                  <li>
                    Move the map so the pin sits on its numbered flag (it snaps
                    to the site), then Set here.
                  </li>
                  <li>
                    Calibrate: hold the phone 1 m away for 12 s. When all are
                    in, run Test beacons.
                  </li>
                </ol>
              </div>
            </div>
          </section>
        );
      })}
    </div>,
    document.body,
  );
}
