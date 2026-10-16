import { useCallback, useRef, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Action, Notice, Section, dataFont, theme, ui } from '../components/ui';
import { BeaconLayoutEditor } from '../components/beacon-layout';
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

  useFocusEffect(
    useCallback(() => {
      setCaps(bleCapabilities());
      setOn(beaconState().tag);
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
      <Section title="Beacon layout and calibration" initiallyOpen>
        <BeaconLayoutEditor />
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
