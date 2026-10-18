import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  exponentFromReading,
  planBeacons,
  type PlanQuality,
  worstCoverageMetres,
  type BeaconPlacement,
  type BeaconPlacementSet,
} from '@turn/positioning-core';
import { activeVenue as venue } from '../config/active-venue';
import { Action, Notice, theme, ui } from './ui';
import { NavMap, type MapBeacon } from './nav-map';
import { roomNameAt } from '../navigation/assist-helpers';
import { scanBeacons, bleBuildAvailable } from '../fingerprinting/ble';
import {
  fingerprintProfile,
  loadBleTraces,
  loadPlacements,
  savePlacements,
  deleteBleTrace,
} from '../fingerprinting/storage';
import { sendRun } from '../navigation/send-runs';

const floorId = venue.floors[0]!.id;
function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** Map-based beacon layout: recommended sites, drag-by-tap placement, 1 m + 4 m calibration. */
export function BeaconLayoutEditor() {
  const [beacons, setBeacons] = useState<BeaconPlacement[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [traces, setTraces] = useState(0);
  const [sending, setSending] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useFocusEffect(
    useCallback(() => {
      try {
        const saved = loadPlacements(venue.venueId, venue.revision);
        setBeacons(saved?.beacons ?? []);
        setStale(
          Boolean(saved && saved.deviceProfile !== fingerprintProfile()),
        );
      } catch {
        setBeacons([]);
      }
      try {
        setTraces(loadBleTraces().length);
      } catch {
        setTraces(0);
      }
      return () => abort.current?.abort();
    }, []),
  );

  const floor = venue.floors[0]!;
  const [quality, setQuality] = useState<PlanQuality | null>(null);
  function persist(next: BeaconPlacement[]) {
    const set: BeaconPlacementSet = {
      schemaVersion: 1,
      venueId: venue.venueId,
      venueRevision: venue.revision,
      deviceProfile: fingerprintProfile(),
      beacons: next,
    };
    savePlacements(set);
    setBeacons(next);
    setStale(false);
  }
  function useRecommended(count: number) {
    // Candidate mounting points: routing nodes plus room label positions (never doorways).
    const candidates = [
      ...venue.nodes
        .filter((n) => n.floorId === floorId)
        .map((n) => ({ x: n.x, y: n.y, id: n.id })),
      ...floor.rooms
        .filter((r) => r.kind === 'room' || r.kind === 'circulation')
        .map((r) => ({ x: r.labelPosition.x, y: r.labelPosition.y })),
    ];
    const plan = planBeacons(
      {
        rooms: floor.rooms,
        walls: floor.walls,
        candidates,
        doors: floor.doors.map((d) => d.position),
      },
      { count },
    );
    persist(
      plan.sites.map((s) => ({
        tag: s.tag,
        floorId,
        x: s.x,
        y: s.y,
        ...(s.id ? { nodeId: s.id } : {}),
      })),
    );
    setQuality(plan.quality);
    setSelected(plan.sites[0]?.tag ?? null);
    setNote(
      `${plan.sites.length} sites planned. Predicted: ${Math.round(plan.quality.coverage3 * 100)}% of the floor hears 3+ beacons, ${Math.round(plan.quality.coverageTarget * 100)}% hears 4+. Prediction only; check with Listen after mounting.`,
    );
  }
  const current = beacons.find((b) => b.tag === selected) ?? null;

  async function measure(): Promise<number> {
    if (!current) throw new Error('Select a beacon first.');
    const controller = new AbortController();
    abort.current = controller;
    const r = await scanBeacons(6000, controller.signal);
    if (!r.completed) throw new Error(r.status);
    const b = r.readings.find((x) => x.id === current.tag);
    if (!b || b.samples.length < 8)
      throw new Error(
        `Beacon ${current.tag} was barely heard. Check it is running and nearer, then retry.`,
      );
    return Math.round(median(b.samples.map((x) => x.rssi)) * 10) / 10;
  }
  async function calibrate(kind: 'one' | 'four') {
    if (busy || !current) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const level = await measure();
      if (kind === 'one') {
        persist(
          beacons.map((b) =>
            b.tag === current.tag
              ? {
                  ...b,
                  referenceRssi: level,
                  calibratedAt: new Date().toISOString(),
                }
              : b,
          ),
        );
        setNote(`${current.tag}: ${level} dBm at 1 m saved.`);
      } else {
        if (current.referenceRssi === undefined)
          throw new Error('Do the 1 m calibration first.');
        const n = exponentFromReading(current.referenceRssi, level, 4);
        if (n === undefined)
          throw new Error('Could not compute a distance model.');
        persist(
          beacons.map((b) =>
            b.tag === current.tag
              ? { ...b, exponent: Math.round(n * 100) / 100 }
              : b,
          ),
        );
        setNote(
          `${current.tag}: ${level} dBm at 4 m, distance model ${n.toFixed(2)} saved.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function onTap(p: { x: number; y: number }) {
    if (moving && current) {
      persist(
        beacons.map((b) =>
          b.tag === current.tag
            ? {
                ...b,
                x: p.x,
                y: p.y,
                referenceRssi: undefined,
                calibratedAt: undefined,
                exponent: undefined,
              }
            : b,
        ),
      );
      setMoving(false);
      setNote(`${current.tag} moved. Calibrate it again from 1 m.`);
      return;
    }
    const hit = beacons.find((b) => Math.hypot(b.x - p.x, b.y - p.y) < 1.2);
    if (hit) setSelected(hit.tag);
  }
  async function sendLogs() {
    if (sending) return;
    setSending(true);
    setError('');
    try {
      const list = loadBleTraces();
      for (let i = 0; i < list.length; i++) {
        setNote(`Sending ${i + 1} of ${list.length}…`);
        await sendRun(list[i]!);
        deleteBleTrace(list[i]!.sessionId); // confirmed on the computer
      }
      setNote(`${list.length} logs confirmed on your computer.`);
      setTraces(loadBleTraces().length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTraces(loadBleTraces().length);
    } finally {
      setSending(false);
    }
  }

  const mapBeacons: MapBeacon[] = beacons.map((b) => ({
    tag: b.tag,
    x: b.x,
    y: b.y,
    state: b.referenceRssi === undefined ? 'uncalibrated' : 'ok',
  }));
  const placed = beacons.filter((b) => b.referenceRssi !== undefined).length;
  const coverage = beacons.length
    ? worstCoverageMetres(
        venue.nodes.filter((n) => n.floorId === floorId),
        beacons,
      )
    : null;
  return (
    <View style={{ gap: 12 }}>
      <Text style={ui.body}>
        Put a beacon at each numbered marker. Choose how many to plan: more
        beacons means every spot hears more of them. Keep them about chest
        height or higher, away from metal, and never in a straight line.
        {quality
          ? ` Predicted: ${Math.round(quality.coverage3 * 100)}% of the floor hears 3 or more, ${Math.round(quality.coverageTarget * 100)}% hears 4 or more, layout roundness ${quality.collinearity.toFixed(2)} (above 0.3 is good).`
          : ''}
      </Text>
      {stale ? (
        <Notice error>
          These placements were measured on a different phone. Calibrate again
          on this phone.
        </Notice>
      ) : null}
      {error ? <Notice error>{error}</Notice> : null}
      {note ? <Notice>{note}</Notice> : null}
      <View
        style={{
          borderRadius: 18,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <NavMap
          venue={venue}
          floorId={floorId}
          height={360}
          beacons={mapBeacons}
          selectedBeacon={selected}
          onTap={onTap}
          hint={
            moving
              ? `Tap where ${current?.tag} is mounted`
              : 'Tap a marker to select it'
          }
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[3, 4, 6, 8].map((n) => (
          <View key={n} style={{ flex: 1 }}>
            <Action
              title={`${n} sites`}
              primary={n === 6}
              onPress={() => useRecommended(n)}
            />
          </View>
        ))}
      </View>
      {beacons.map((b) => (
        <Action
          key={b.tag}
          selected={selected === b.tag}
          title={`${b.tag} · ${roomNameAt(venue, floorId, b) ?? 'on map'} · ${b.referenceRssi === undefined ? 'needs calibration' : `${b.referenceRssi} dBm @1 m${b.exponent ? ` · n ${b.exponent}` : ''}`}`}
          onPress={() => setSelected(b.tag)}
        />
      ))}
      {current && (
        <View style={{ gap: 8 }}>
          <Text style={ui.heading}>{current.tag}</Text>
          <Action
            title={busy ? 'Measuring…' : 'Calibrate: stand 1 m away (6 s)'}
            primary
            busy={busy}
            disabled={!bleBuildAvailable}
            onPress={() => void calibrate('one')}
          />
          <Action
            title="Improve distance model: stand 4 m away (6 s)"
            disabled={
              busy || current.referenceRssi === undefined || !bleBuildAvailable
            }
            onPress={() => void calibrate('four')}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Action
                title={moving ? 'Tap the map…' : 'Move on map'}
                selected={moving}
                onPress={() => setMoving(!moving)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Action
                title="Remove"
                onPress={() => {
                  persist(beacons.filter((b) => b.tag !== current.tag));
                  setSelected(null);
                }}
              />
            </View>
          </View>
        </View>
      )}
      <Text style={ui.body}>
        {placed} of {beacons.length} beacons calibrated
        {coverage !== null && Number.isFinite(coverage)
          ? ` · every route point is within ${coverage.toFixed(0)} m of a beacon`
          : ''}
        . Navigation uses beacons only after calibration. Two or more are needed
        to find your start automatically.
      </Text>
      <Action
        title={sending ? 'Sending…' : `Send walk logs to computer · ${traces}`}
        busy={sending}
        disabled={traces === 0}
        onPress={() => void sendLogs()}
      />
    </View>
  );
}
