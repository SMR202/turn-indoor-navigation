import { useCallback, useRef, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Action, Notice, Section, dataFont, theme, ui } from '../components/ui';
import type { BeaconPlacementSet } from '@turn/positioning-core';
import { activeVenue as venue } from '../config/active-venue';
import {
  fingerprintProfile,
  loadBleTraces,
  loadPlacements,
  savePlacements,
} from '../fingerprinting/storage';
import { sendRun } from '../navigation/send-runs';
import {
  beaconState,
  bleBuildAvailable,
  bleCanAdvertise,
  bleCapabilities,
  scanBeacons,
  startBeacon,
  stopBeacon,
  type BeaconPower,
  type BleCapabilities,
  type BleReadings,
} from '../fingerprinting/ble';

const TAGS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
const POWERS: { id: BeaconPower; label: string }[] = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

export default function Beacons() {
  const [caps, setCaps] = useState<BleCapabilities | null>(null);
  const [tag, setTag] = useState('B1');
  const [power, setPower] = useState<BeaconPower>('high');
  const [on, setOn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [heard, setHeard] = useState<BleReadings | null>(null);
  const [scanNote, setScanNote] = useState('');
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const [placements, setPlacements] = useState<BeaconPlacementSet | null>(null);
  const [placeTag, setPlaceTag] = useState('B1');
  const [placeAnchor, setPlaceAnchor] = useState(venue.anchors[0]?.id ?? '');
  const [calibrating, setCalibrating] = useState(false);
  const [placeNote, setPlaceNote] = useState('');
  const [traceCount, setTraceCount] = useState(0);
  const [sending, setSending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setCaps(bleCapabilities());
      setOn(beaconState().tag);
      try {
        setPlacements(loadPlacements(venue.venueId, venue.revision));
      } catch {
        setPlacements(null);
      }
      try {
        setTraceCount(loadBleTraces().length);
      } catch {
        setTraceCount(0);
      }
      return () => abort.current?.abort();
    }, []),
  );

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (on) {
        stopBeacon();
        setOn(null);
      } else {
        const r = await startBeacon(tag, power);
        setOn(r.tag);
      }
      setCaps(bleCapabilities());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function listen() {
    if (scanning) return;
    const controller = new AbortController();
    abort.current = controller;
    setScanning(true);
    setError('');
    setScanNote('');
    setHeard(null);
    try {
      const r = await scanBeacons(6000, controller.signal);
      if (!r.completed) setError(r.status);
      else {
        setHeard(r.readings);
        setScanNote(
          r.readings.length
            ? ''
            : 'No TURN beacon heard. Check that a beacon phone is running, nearby and showing a green status.',
        );
      }
    } finally {
      setScanning(false);
    }
  }

  function writePlacements(beacons: BeaconPlacementSet['beacons']) {
    const next: BeaconPlacementSet = {
      schemaVersion: 1,
      venueId: venue.venueId,
      venueRevision: venue.revision,
      deviceProfile: fingerprintProfile(),
      beacons,
    };
    savePlacements(next);
    setPlacements(next);
  }
  async function calibratePlacement() {
    if (calibrating) return;
    const anchor = venue.anchors.find((a) => a.id === placeAnchor);
    const node = venue.nodes.find((n) => n.id === anchor?.nodeId);
    if (!anchor || !node) return;
    const controller = new AbortController();
    abort.current = controller;
    setCalibrating(true);
    setError('');
    setPlaceNote('');
    try {
      const r = await scanBeacons(6000, controller.signal);
      if (!r.completed) throw new Error(r.status);
      const b = r.readings.find((x) => x.id === placeTag);
      if (!b || b.samples.length < 8)
        throw new Error(
          `Beacon ${placeTag} was barely heard. Stand about 1 metre from it with the phone held as you walk, then retry.`,
        );
      const level = Math.round(median(b.samples.map((x) => x.rssi)) * 10) / 10;
      const rest = (placements?.beacons ?? []).filter(
        (x) => x.tag !== placeTag,
      );
      writePlacements([
        ...rest,
        {
          tag: placeTag,
          anchorId: anchor.id,
          nodeId: node.id,
          floorId: node.floorId,
          x: node.x,
          y: node.y,
          referenceRssi: level,
          calibratedAt: new Date().toISOString(),
        },
      ]);
      setPlaceNote(
        `Saved ${placeTag} at ${anchor.label}: ${level} dBm at 1 m from ${b.samples.length} packets.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCalibrating(false);
    }
  }
  async function sendTraces() {
    if (sending) return;
    setSending(true);
    setError('');
    try {
      const traces = loadBleTraces();
      for (let i = 0; i < traces.length; i++) {
        setPlaceNote(`Sending ${i + 1} of ${traces.length} beacon logs…`);
        await sendRun(traces[i]!);
      }
      setPlaceNote(`${traces.length} beacon logs confirmed on your computer.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }
  const supported = bleBuildAvailable;
  const canBeacon = bleCanAdvertise;
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={ui.page}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 6 }}>
        <Text style={ui.eyebrow}>BLE BEACONS</Text>
        <Text style={ui.title}>Stand-in beacons.</Text>
        <Text style={ui.body}>
          Use spare Android phones as fixed Bluetooth beacons until hardware
          beacons arrive. Place them, survey the spots, then recognize places by
          signal strength.
        </Text>
      </View>
      {error ? <Notice error>{error}</Notice> : null}
      {!supported ? (
        <Notice>
          {Platform.OS === 'android'
            ? 'This TURN installation has no BLE module. Install Android build 4.'
            : Platform.OS === 'ios'
              ? 'This iPhone installation has no BLE module. Install the TURN iPhone development build; Expo Go cannot scan Bluetooth.'
              : 'BLE beacons need the TURN phone app.'}
        </Notice>
      ) : null}
      <View style={ui.card}>
        <Text style={ui.heading}>This phone as a beacon</Text>
        <Text style={ui.body}>
          Pick a different name for every beacon phone. Keep this screen open,
          the phone on a charger and Bluetooth on; the screen stays awake while
          the beacon runs. Mount it at the same spot and height for every test.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TAGS.map((t) => (
            <View key={t} style={{ minWidth: 76 }}>
              <Action
                title={t}
                selected={tag === t}
                disabled={busy || Boolean(on)}
                onPress={() => setTag(t)}
              />
            </View>
          ))}
        </View>
        <Text style={ui.body}>Transmit power</Text>
        <View style={ui.row}>
          {POWERS.map((p) => (
            <View key={p.id} style={{ flex: 1 }}>
              <Action
                title={p.label}
                selected={power === p.id}
                disabled={busy || Boolean(on)}
                onPress={() => setPower(p.id)}
              />
            </View>
          ))}
        </View>
        {on ? (
          <Notice>
            Beacon {on} is transmitting. Do not close TURN or lock the phone.
          </Notice>
        ) : null}
        {supported && !canBeacon ? (
          <Notice>
            This phone can scan for beacons but cannot act as one. Use an
            Android phone as the beacon.
          </Notice>
        ) : null}
        <Action
          title={on ? `Stop beacon ${on}` : `Start beacon ${tag}`}
          primary={!on}
          busy={busy}
          disabled={
            !supported ||
            !canBeacon ||
            (!on && caps !== null && !caps.canAdvertise)
          }
          onPress={() => void toggle()}
        />
        {caps && !caps.canAdvertise ? (
          <Text style={ui.body}>
            This phone cannot advertise Bluetooth LE. It can still scan; use a
            different phone as a beacon.
          </Text>
        ) : null}
      </View>
      <View style={ui.card}>
        <Text style={ui.heading}>Listen for beacons</Text>
        <Text style={ui.body}>
          Scans six seconds for TURN beacons only. Other Bluetooth devices are
          ignored by the phone's controller and never reach the app.
        </Text>
        <Action
          title={scanning ? 'Listening…' : 'Listen for 6 seconds'}
          primary
          busy={scanning}
          disabled={!supported}
          onPress={() => void listen()}
        />
        {scanning && (
          <Action title="Cancel" onPress={() => abort.current?.abort()} />
        )}
        {scanNote ? <Text style={ui.body}>{scanNote}</Text> : null}
        {heard?.map((b) => {
          const level = median(b.samples.map((s) => s.rssi));
          return (
            <View
              key={b.id}
              style={{
                ...ui.row,
                justifyContent: 'space-between',
                borderTopWidth: 1,
                borderColor: theme.border,
                paddingTop: 10,
              }}
            >
              <Text style={{ ...ui.heading, fontFamily: dataFont }}>
                {b.id}
              </Text>
              <Text style={{ ...ui.body, fontFamily: dataFont }}>
                {level.toFixed(0)} dBm · {b.samples.length} packets
              </Text>
            </View>
          );
        })}
      </View>
      <Section
        title="Where are the beacons? (for walking corrections)"
        initiallyOpen
      >
        <Text style={ui.body}>
          Tell TURN where each beacon is mounted, then stand about 1 metre from
          it, holding the phone the way you walk, and calibrate. With beacons
          placed, every walk also records a shadow log of when beacons would
          have corrected your position. Your dot is not moved by it yet.
        </Text>
        <Text style={ui.body}>Beacon name</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TAGS.map((t) => (
            <View key={t} style={{ minWidth: 76 }}>
              <Action
                title={t}
                selected={placeTag === t}
                disabled={calibrating}
                onPress={() => setPlaceTag(t)}
              />
            </View>
          ))}
        </View>
        <Text style={ui.body}>Mounted at</Text>
        <ScrollView
          style={{ maxHeight: 220 }}
          nestedScrollEnabled
          contentContainerStyle={{ gap: 8 }}
        >
          {venue.anchors.map((a) => (
            <Action
              key={a.id}
              title={a.label}
              selected={placeAnchor === a.id}
              disabled={calibrating}
              onPress={() => setPlaceAnchor(a.id)}
            />
          ))}
        </ScrollView>
        {placeNote ? <Notice>{placeNote}</Notice> : null}
        <Action
          title={
            calibrating
              ? 'Measuring 1 m reference…'
              : `Calibrate ${placeTag} here (6 s, stand 1 m away)`
          }
          primary
          busy={calibrating}
          disabled={!supported}
          onPress={() => void calibratePlacement()}
        />
        {placements?.beacons.map((b) => (
          <View
            key={b.tag}
            style={{
              ...ui.row,
              justifyContent: 'space-between',
              borderTopWidth: 1,
              borderColor: theme.border,
              paddingTop: 10,
            }}
          >
            <Text style={{ ...ui.body, flex: 1 }}>
              {b.tag} ·{' '}
              {venue.anchors.find((a) => a.id === b.anchorId)?.label ??
                b.anchorId}
              {' — '}
              {b.referenceRssi === undefined
                ? 'not calibrated'
                : `${b.referenceRssi} dBm at 1 m`}
            </Text>
            <Action
              title="Remove"
              onPress={() =>
                writePlacements(
                  (placements?.beacons ?? []).filter((x) => x.tag !== b.tag),
                )
              }
            />
          </View>
        ))}
        <Action
          title={sending ? 'Sending…' : `Send beacon walk logs · ${traceCount}`}
          busy={sending}
          disabled={traceCount === 0}
          onPress={() => void sendTraces()}
        />
        {placements && placements.deviceProfile !== fingerprintProfile() ? (
          <Notice error>
            These placements were measured on a different phone. Calibrate again
            on this phone.
          </Notice>
        ) : null}
      </Section>
      <Section title="Environment and ready-check">
        <Text style={ui.body}>
          Bluetooth: {caps ? (caps.bluetoothOn ? 'on' : 'OFF') : 'unknown'}
          {'\n'}Location services:{' '}
          {caps ? (caps.locationOn ? 'on' : 'OFF') : 'unknown'}
          {'\n'}Can scan: {caps ? (caps.canScan ? 'yes' : 'no') : 'unknown'}
          {'\n'}Can act as beacon:{' '}
          {caps ? (caps.canAdvertise ? 'yes' : 'no') : 'unknown'}
          {'\n'}Android API: {caps?.sdk ?? 'unknown'}
        </Text>
      </Section>
      <Section title="How to test with phone beacons">
        <Text style={ui.body}>
          1. Start 3–4 beacon phones with different names. Fix them in place
          (tape, tripod or shelf) and leave them. Disable battery optimization
          for TURN on those phones.{'\n\n'}2. On the scanner phone, use Listen
          to confirm every beacon is heard where you stand.{'\n\n'}3. In Survey,
          include BLE beacons and record two passes at each place. In Find my
          place, capture again without choosing the name, then label the actual
          place.{'\n\n'}4. Moving a beacon invalidates the survey; redo it.
          Phone beacons have different power and antennas from commercial
          beacons, so these results exercise the pipeline, not final accuracy.
        </Text>
      </Section>
    </ScrollView>
  );
}
