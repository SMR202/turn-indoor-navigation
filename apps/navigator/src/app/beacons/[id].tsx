import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import { applyPlaceOverrides, buildScene, type P } from '@turn/map-scene';
import { beaconTagKind } from '@turn/positioning-core';
import { bleRichStream, roomNameAt } from '@turn/positioning-runtime';
import { Icon } from '../../components/icon';
import { Badge, Button, Chip, IconButton, T, Tap } from '../../components/ui';
import { useVenue, type VenueBundle } from '../../lib/api';
import {
  adoptionTag,
  describe,
  MODEL_RSSI_AT_1M,
  roughDistance,
  useBeaconLayout,
  useNearbyBeacons,
  type LayoutBeacon,
  type NearbyDevice,
} from '../../lib/beacons';
import { VenueMap, type CameraCommand } from '../../map/VenueMap';
import { shadow, useTheme } from '../../theme';

const CALIBRATION_SECONDS = 12;

export default function BeaconsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useVenue(id ?? '');
  const { c } = useTheme();
  if (state.status !== 'ready')
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.background,
          gap: 12,
        }}
      >
        {state.status === 'loading' ? (
          <ActivityIndicator color={c.accent} />
        ) : (
          <T v="callout" color={c.danger}>
            {state.message}
          </T>
        )}
      </View>
    );
  return <Setup bundle={state.bundle} />;
}

type Selection = { device: string | null; tag: string | null };

function Setup({ bundle }: { bundle: VenueBundle }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pkg = bundle.pkg;
  const layout = useBeaconLayout(bundle.summary.id, bundle.content);
  const nearby = useNearbyBeacons(true, true);
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [placing, setPlacing] = useState<LayoutBeacon | null>(null);

  const deviceFor = (b: LayoutBeacon) =>
    nearby.devices.find((d) => d.tag === b.tag || d.alt.includes(b.tag)) ??
    null;
  const inLayout = (d: NearbyDevice) =>
    layout.beacons.find((b) => b.tag === d.tag || d.alt.includes(b.tag)) ??
    null;
  const loose = nearby.devices.filter(
    (d) => !inLayout(d) && (showAll || d.info?.kind !== 'other'),
  );
  const hidden = nearby.devices.filter(
    (d) => !inLayout(d) && d.info?.kind === 'other',
  ).length;
  // iBeacons that share one identity cannot be told apart by it.
  const sharedIds = [
    ...new Set(
      nearby.devices
        .filter(
          (d) =>
            d.info?.kind === 'ibeacon' &&
            (nearby.devices.filter((x) => x.tag === d.tag).length > 1 ||
              (d.info.shared ?? 1) > 1),
        )
        .map((d) => d.tag),
    ),
  ];
  const heardBeacons = nearby.devices.filter(
    (d) => d.info?.kind !== 'other',
  ).length;
  const selectedDevice = sel?.device
    ? (nearby.devices.find((d) => d.key === sel.device) ?? null)
    : null;
  const selectedBeacon = sel?.tag
    ? (layout.beacons.find((b) => b.tag === sel.tag) ?? null)
    : selectedDevice
      ? inLayout(selectedDevice)
      : null;
  const liveDevice =
    selectedDevice ?? (selectedBeacon ? deviceFor(selectedBeacon) : null);
  const nextLabel = `Beacon ${layout.beacons.length + 1}`;
  const placeOf = (b: LayoutBeacon) => {
    const floor = pkg.floors.find((f) => f.id === b.floorId);
    const room = roomNameAt(pkg, b.floorId, b);
    return [room, pkg.floors.length > 1 ? floor?.label : null]
      .filter(Boolean)
      .join(' · ');
  };

  if (placing)
    return (
      <Placement
        bundle={bundle}
        beacon={placing}
        others={layout.beacons.filter((b) => b.tag !== placing.tag)}
        onCancel={() => setPlacing(null)}
        onSave={(b) => {
          layout.upsert(stripSource(b));
          setPlacing(null);
          setSel({ device: null, tag: b.tag });
        }}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <IconButton
          icon="back"
          label="Back"
          tone="sunken"
          size={38}
          onPress={() => router.back()}
        />
        <View style={{ flex: 1 }}>
          <T v="title">Beacons</T>
          <T v="caption" color={c.textMuted} lines={1}>
            {bundle.summary.name}
          </T>
        </View>
        <Listening active={nearby.listening} off={nearby.error !== null} />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + (sel ? 380 : 40),
          gap: 18,
        }}
      >
        <StatusCard
          error={nearby.error}
          notices={nearby.notices}
          heard={heardBeacons}
          placed={layout.beacons.length}
          calibrated={
            layout.beacons.filter((b) => b.calibratedAt !== undefined).length
          }
        />
        {sharedIds.length > 0 && (
          <Card tone="warning" icon="beacon">
            <T v="callout" weight="600">
              {sharedIds.length === 1
                ? 'Several beacons use the same iBeacon ID'
                : `${sharedIds.length} iBeacon IDs are shared by several beacons`}
            </T>
            <T v="caption" color={c.textMuted}>
              {Platform.OS === 'android'
                ? 'TURN tells them apart by their Bluetooth address on this phone. iPhones cannot: give each beacon its own Minor value in the maker’s app before using them with an iPhone.'
                : 'This iPhone cannot tell them apart. Give each beacon its own Minor value in the maker’s app, or set them up with an Android phone.'}
            </T>
          </Card>
        )}
        <Section
          title={`In this venue (${layout.beacons.length})`}
          action={
            layout.edited
              ? { label: 'Use venue layout', onPress: layout.reset }
              : undefined
          }
        >
          {layout.beacons.length === 0 ? (
            <T v="caption" color={c.textMuted} style={{ padding: 16 }}>
              No beacons yet. Hold the phone next to a beacon: it rises to the
              top of the list below. Tap it, then Add to venue.
            </T>
          ) : (
            layout.beacons.map((b, i) => {
              const d = deviceFor(b);
              return (
                <Row
                  key={b.tag}
                  first={i === 0}
                  icon="beacon"
                  title={b.label ?? describe(b).title}
                  detail={[
                    placeOf(b) || 'Not placed',
                    b.calibratedAt
                      ? `${Math.round(b.referenceRssi ?? 0)} dBm at 1 m`
                      : 'Not calibrated',
                  ].join(' · ')}
                  rssi={d?.rssi ?? null}
                  selected={sel?.tag === b.tag}
                  onPress={() => setSel({ device: d?.key ?? null, tag: b.tag })}
                />
              );
            })
          )}
        </Section>
        <Section
          title={`Nearby (${loose.length})`}
          action={
            hidden > 0 || showAll
              ? {
                  label: showAll
                    ? 'Beacons only'
                    : `Show ${hidden} other devices`,
                  onPress: () => setShowAll((v) => !v),
                }
              : undefined
          }
        >
          {loose.length === 0 ? (
            <T v="caption" color={c.textMuted} style={{ padding: 16 }}>
              {nearby.listening
                ? 'Listening… beacons appear here within a few seconds.'
                : 'Starting the Bluetooth scan…'}
            </T>
          ) : (
            loose.map((d, i) => {
              const info = describe(d);
              const closest =
                i === 0 && (loose[1] ? d.rssi - loose[1].rssi >= 8 : true);
              return (
                <Row
                  key={d.key}
                  first={i === 0}
                  icon={d.info?.kind === 'other' ? 'more' : 'beacon'}
                  title={info.title}
                  detail={`${info.kind} · ${d.rate.toFixed(1)}/s${closest && d.rssi > -70 ? ' · closest' : ''}`}
                  rssi={d.rssi}
                  selected={sel?.device === d.key}
                  onPress={() => setSel({ device: d.key, tag: null })}
                />
              );
            })
          )}
        </Section>
        <Card icon="flag">
          <T v="callout" weight="600">
            Setting up beacons
          </T>
          <T v="caption" color={c.textMuted}>
            1. Mount each beacon about 2 m high, spread in a zigzag through the
            rooms, not in one line.{'\n'}2. Stand next to one: it rises to the
            top. Add it and tap where it is on the map.{'\n'}3. Calibrate: hold
            the phone 1 m from the beacon for {CALIBRATION_SECONDS} seconds.
            {'\n'}Placements and calibrations are kept on this phone.
          </T>
        </Card>
      </ScrollView>
      {sel && (
        <Detail
          key={`${sel.device}-${sel.tag}`}
          device={liveDevice}
          beacon={selectedBeacon}
          place={selectedBeacon ? placeOf(selectedBeacon) : null}
          collect={nearby.collect}
          onClose={() => setSel(null)}
          onAdd={(d) => {
            const choice = adoptionTag(d, nearby.devices);
            if (!choice.tag) return choice.note;
            setPlacing({
              tag: choice.tag,
              floorId: pkg.floors[0]!.id,
              x: NaN,
              y: NaN,
              label: nextLabel,
              ...(d.info?.uuid ? { uuid: d.info.uuid } : {}),
              ...(d.info?.kind === 'ibeacon' && d.info.tx !== undefined
                ? { txAt1m: d.info.tx }
                : {}),
              source: 'phone',
            });
            return choice.note;
          }}
          onPlace={(b) => setPlacing(b)}
          onCalibrated={(b, rssi) =>
            layout.upsert({
              ...stripSource(b),
              referenceRssi: rssi,
              calibratedAt: new Date().toISOString(),
            })
          }
          onRemove={(b) => {
            layout.remove(b.tag);
            setSel(null);
          }}
        />
      )}
    </View>
  );
}

function stripSource(b: LayoutBeacon): Omit<LayoutBeacon, 'source'> {
  const rest: Partial<LayoutBeacon> = { ...b };
  delete rest.source;
  return rest as Omit<LayoutBeacon, 'source'>;
}

function Listening({ active, off }: { active: boolean; off: boolean }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        height: 30,
        borderRadius: 15,
        backgroundColor: active ? c.successSoft : c.sunken,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: active ? c.success : c.textSubtle,
        }}
      />
      <T v="caption" weight="600" color={active ? c.success : c.textMuted}>
        {active ? 'Listening' : off ? 'Off' : 'Starting'}
      </T>
    </View>
  );
}

function StatusCard({
  error,
  notices,
  heard,
  placed,
  calibrated,
}: {
  error: string | null;
  notices: string[];
  heard: number;
  placed: number;
  calibrated: number;
}) {
  const { c } = useTheme();
  if (error)
    return (
      <Card tone="danger" icon="beacon">
        <T v="callout" weight="600">
          Cannot listen for beacons
        </T>
        <T v="caption" color={c.textMuted}>
          {error}
        </T>
      </Card>
    );
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat value={heard} label="heard now" />
        <Stat value={placed} label="in venue" />
        <Stat value={calibrated} label="calibrated" />
      </View>
      {!bleRichStream && (
        <Card tone="warning" icon="beacon">
          <T v="callout" weight="600">
            Update TURN to hear iBeacons
          </T>
          <T v="caption" color={c.textMuted}>
            This installed build hears Eddystone and TURN phone beacons only.
            April beacons use iBeacon: install Android build 7 or the new iPhone
            build.
          </T>
        </Card>
      )}
      {notices.map((n) => (
        <Card key={n} tone="warning" icon="lock">
          <T v="caption" color={c.textMuted}>
            {n}
          </T>
        </Card>
      ))}
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.surface,
        borderRadius: 16,
        paddingVertical: 12,
        alignItems: 'center',
      }}
    >
      <T v="title">{String(value)}</T>
      <T v="caption" color={c.textMuted}>
        {label}
      </T>
    </View>
  );
}

function Card({
  tone,
  icon,
  children,
}: {
  tone?: 'warning' | 'danger';
  icon: string;
  children: ReactNode;
}) {
  const { c } = useTheme();
  const color =
    tone === 'warning' ? c.warning : tone === 'danger' ? c.danger : c.accent;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        backgroundColor:
          tone === 'warning'
            ? c.warningSoft
            : tone === 'danger'
              ? c.dangerSoft
              : c.surface,
      }}
    >
      <Icon name={icon} size={20} color={color} />
      <View style={{ flex: 1, gap: 4 }}>{children}</View>
    </View>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginHorizontal: 4,
        }}
      >
        <T
          v="micro"
          color={c.textSubtle}
          style={{ textTransform: 'uppercase' }}
        >
          {title}
        </T>
        {action && (
          <Tap onPress={action.onPress}>
            <T v="caption" weight="600" color={c.accent}>
              {action.label}
            </T>
          </Tap>
        )}
      </View>
      <View
        style={{
          backgroundColor: c.surface,
          borderRadius: 18,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  first,
  icon,
  title,
  detail,
  rssi,
  selected,
  onPress,
}: {
  first: boolean;
  icon: string;
  title: string;
  detail: string;
  rssi: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Tap
      scaleTo={0.99}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.line,
        backgroundColor: selected ? c.accentSoft : 'transparent',
      }}
    >
      <Badge
        icon={icon}
        color={rssi === null ? c.textSubtle : c.accent}
        size={34}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <T v="callout" weight="600" lines={1}>
          {title}
        </T>
        <T v="caption" color={c.textMuted} lines={1}>
          {detail}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Bars rssi={rssi} />
        <T v="micro" color={rssi === null ? c.textSubtle : c.textMuted}>
          {rssi === null ? 'not heard' : `${Math.round(rssi)} dBm`}
        </T>
      </View>
    </Tap>
  );
}

/** Five signal bars: −90, −80, −70, −60 and −50 dBm. */
function Bars({ rssi, size = 1 }: { rssi: number | null; size?: number }) {
  const { c } = useTheme();
  const level =
    rssi === null
      ? 0
      : [-90, -80, -70, -60, -50].filter((t) => rssi >= t).length;
  const color = level >= 4 ? c.success : level >= 2 ? c.accent : c.warning;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 * size }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            width: 4 * size,
            height: (5 + i * 3) * size,
            borderRadius: 2 * size,
            backgroundColor: i < level ? color : c.lineStrong,
          }}
        />
      ))}
    </View>
  );
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const { c } = useTheme();
  const w = 300,
    h = 56;
  const pts = values
    .map((v, i) =>
      v === null
        ? null
        : `${(i / Math.max(1, values.length - 1)) * w},${h - ((Math.max(-100, Math.min(-35, v)) + 100) / 65) * h}`,
    )
    .filter(Boolean)
    .join(' ');
  return (
    <Svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <Polyline
        points={pts}
        fill="none"
        stroke={c.accent}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function Detail({
  device,
  beacon,
  place,
  collect,
  onClose,
  onAdd,
  onPlace,
  onCalibrated,
  onRemove,
}: {
  device: NearbyDevice | null;
  beacon: LayoutBeacon | null;
  place: string | null;
  collect: (
    key: string,
    since: number,
  ) => { median: number | null; count: number };
  onClose: () => void;
  onAdd: (d: NearbyDevice) => string | null;
  onPlace: (b: LayoutBeacon) => void;
  onCalibrated: (b: LayoutBeacon, rssi: number) => void;
  onRemove: (b: LayoutBeacon) => void;
}) {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<{
    key: string;
    since: number;
    left: number;
    result: { median: number | null; count: number } | null;
  } | null>(null);
  useEffect(() => {
    if (!calibration || calibration.result) return;
    const timer = setInterval(() => {
      const left = Math.max(
        0,
        CALIBRATION_SECONDS - (performance.now() - calibration.since) / 1000,
      );
      setCalibration((cal) =>
        cal && !cal.result
          ? left > 0
            ? { ...cal, left }
            : { ...cal, left: 0, result: collect(cal.key, cal.since) }
          : cal,
      );
    }, 250);
    return () => clearInterval(timer);
  }, [calibration, collect]);

  const desc = describe(device ?? { tag: beacon?.tag ?? '' });
  const reference =
    beacon?.referenceRssi ??
    beacon?.txAt1m ??
    (device?.info?.kind === 'ibeacon' ? device.info.tx : undefined) ??
    MODEL_RSSI_AT_1M;
  const rssi = device?.rssi ?? null;
  const words =
    rssi === null
      ? 'Not heard right now'
      : rssi >= reference + 6
        ? 'Right next to it'
        : rssi >= reference - 6
          ? 'About a metre away'
          : rssi >= -80
            ? 'Nearby'
            : 'Far away or behind walls';
  const facts: [string, string][] = [];
  if (device?.info?.uuid) facts.push(['UUID', device.info.uuid]);
  if (device?.info?.major !== undefined)
    facts.push([
      'Major · Minor',
      `${device.info.major} · ${device.info.minor}`,
    ]);
  if (device?.info?.tx !== undefined)
    facts.push([
      device.info.kind === 'eddystone' ? 'Power at 0 m' : 'Power at 1 m',
      `${device.info.tx} dBm`,
    ]);
  if (device?.info?.name) facts.push(['Name', device.info.name]);
  const address = device?.alt.find((a) => beaconTagKind(a) === 'address');
  if (address) facts.push(['Address ends', address.slice(2)]);
  if (device) facts.push(['Packets', `${device.rate.toFixed(1)} per second`]);
  if (beacon) facts.push(['TURN ID', beacon.tag]);

  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '72%',
          backgroundColor: c.surface,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
        },
        shadow('sheet', dark),
      ]}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 18,
          gap: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T v="headline" lines={1}>
              {beacon?.label ?? desc.title}
            </T>
            <T v="caption" color={c.textMuted} lines={1}>
              {[desc.kind, place].filter(Boolean).join(' · ')}
            </T>
          </View>
          <IconButton
            icon="close"
            label="Close"
            tone="sunken"
            size={36}
            onPress={onClose}
          />
        </View>
        {calibration ? (
          <View
            style={{
              backgroundColor: c.sunken,
              borderRadius: 18,
              padding: 16,
              gap: 10,
              alignItems: 'center',
            }}
          >
            {calibration.result ? (
              <>
                <T v="title">
                  {calibration.result.median === null
                    ? 'Not heard'
                    : `${Math.round(calibration.result.median)} dBm`}
                </T>
                <T v="caption" color={c.textMuted} center>
                  {calibration.result.count < 5
                    ? `Only ${calibration.result.count} readings in ${CALIBRATION_SECONDS} s. Move closer to 1 m, check the beacon has power, and try again.`
                    : `Median of ${calibration.result.count} readings one metre away.`}
                </T>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    alignSelf: 'stretch',
                  }}
                >
                  <Button
                    label="Again"
                    kind="secondary"
                    size="md"
                    grow
                    onPress={() =>
                      setCalibration({
                        key: calibration.key,
                        since: performance.now(),
                        left: CALIBRATION_SECONDS,
                        result: null,
                      })
                    }
                  />
                  <Button
                    label="Save"
                    size="md"
                    grow
                    disabled={
                      !beacon ||
                      calibration.result.count < 5 ||
                      calibration.result.median === null
                    }
                    onPress={() => {
                      if (beacon && calibration.result?.median != null)
                        onCalibrated(beacon, calibration.result.median);
                      setCalibration(null);
                      setNote('Calibration saved on this phone.');
                    }}
                  />
                </View>
              </>
            ) : (
              <>
                <T v="display" color={c.accent}>
                  {String(Math.ceil(calibration.left))}
                </T>
                <T v="callout" weight="600" center>
                  Hold the phone 1 m from the beacon
                </T>
                <T v="caption" color={c.textMuted} center>
                  Chest height, screen up, nothing in between. Keep still.
                </T>
                <Button
                  label="Cancel"
                  kind="ghost"
                  size="md"
                  onPress={() => setCalibration(null)}
                />
              </>
            )}
          </View>
        ) : (
          <View
            style={{
              backgroundColor: c.sunken,
              borderRadius: 18,
              padding: 16,
              gap: 10,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              <View style={{ flex: 1 }}>
                <T v="display">
                  {rssi === null ? '—' : String(Math.round(rssi))}
                  <T v="callout" color={c.textMuted}>
                    {rssi === null ? '' : '  dBm'}
                  </T>
                </T>
                <T v="callout" weight="600" color={c.accent}>
                  {words}
                </T>
                {rssi !== null && (
                  <T v="caption" color={c.textMuted}>
                    Roughly {formatMetres(roughDistance(rssi, reference))} ·
                    walk around and watch it change
                  </T>
                )}
              </View>
              <Bars rssi={rssi} size={1.6} />
            </View>
            {device && <Sparkline values={device.history} />}
          </View>
        )}
        {note && (
          <Animated.View entering={FadeIn}>
            <T v="caption" color={c.textMuted}>
              {note}
            </T>
          </Animated.View>
        )}
        {!calibration && (
          <View style={{ gap: 10 }}>
            {beacon ? (
              <>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    label={
                      Number.isFinite(beacon.x) ? 'Move on map' : 'Place on map'
                    }
                    icon="pin"
                    kind="secondary"
                    size="md"
                    grow
                    onPress={() => onPlace(beacon)}
                  />
                  <Button
                    label="Calibrate 1 m"
                    icon="beacon"
                    size="md"
                    grow
                    disabled={!device}
                    onPress={() =>
                      device &&
                      setCalibration({
                        key: device.key,
                        since: performance.now(),
                        left: CALIBRATION_SECONDS,
                        result: null,
                      })
                    }
                  />
                </View>
                <Button
                  label="Remove from venue"
                  kind="ghost"
                  size="md"
                  onPress={() => onRemove(beacon)}
                />
              </>
            ) : device ? (
              <Button
                label="Add to venue"
                icon="plus"
                size="md"
                onPress={() => setNote(onAdd(device))}
              />
            ) : null}
          </View>
        )}
        <View style={{ gap: 6 }}>
          {facts.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', gap: 12 }}>
              <T v="caption" color={c.textSubtle} style={{ width: 104 }}>
                {k}
              </T>
              <T v="caption" style={{ flex: 1 }} lines={2}>
                {v}
              </T>
            </View>
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

function formatMetres(m: number) {
  if (m < 1) return 'under 1 m';
  if (m < 10) return `${m.toFixed(1)} m`;
  return `${Math.round(m)} m`;
}

/** Full-screen map: tap where the beacon is mounted. */
function Placement({
  bundle,
  beacon,
  others,
  onCancel,
  onSave,
}: {
  bundle: VenueBundle;
  beacon: LayoutBeacon;
  others: LayoutBeacon[];
  onCancel: () => void;
  onSave: (b: LayoutBeacon) => void;
}) {
  const { c, dark, map } = useTheme();
  const insets = useSafeAreaInsets();
  const pkg = bundle.pkg;
  const [floorId, setFloorId] = useState(beacon.floorId);
  const [point, setPoint] = useState<P | null>(
    Number.isFinite(beacon.x) ? { x: beacon.x, y: beacon.y } : null,
  );
  const scene = useMemo(
    () =>
      applyPlaceOverrides(buildScene(pkg, floorId, map), bundle.content.places),
    [pkg, floorId, map, bundle.content.places],
  );
  const [command] = useState<CameraCommand>({ kind: 'fit', id: 1 });
  const markers = [
    ...others
      .filter((b) => b.floorId === floorId && Number.isFinite(b.x))
      .map((b) => ({
        key: b.tag,
        x: b.x,
        y: b.y,
        text: b.label ?? b.tag,
        icon: 'beacon',
      })),
    ...(point && floorId
      ? [
          {
            key: '__new',
            x: point.x,
            y: point.y,
            text: beacon.label ?? 'Beacon',
            icon: 'beacon',
          },
        ]
      : []),
  ];
  return (
    <View style={{ flex: 1, backgroundColor: map.land }}>
      <VenueMap
        scene={scene}
        insets={{ top: insets.top + 120, bottom: 150 + insets.bottom }}
        selectedPlace={null}
        route={null}
        user={null}
        command={command}
        markers={markers}
        onSelect={() => undefined}
        onMapTap={(p) => setPoint(p)}
      />
      <View
        style={[
          {
            position: 'absolute',
            top: insets.top + 8,
            left: 12,
            right: 12,
            borderRadius: 22,
            padding: 16,
            gap: 10,
            backgroundColor: c.surface,
          },
          shadow('floating', dark),
        ]}
      >
        <T v="callout" weight="600">
          Tap where {beacon.label ?? 'the beacon'} is mounted
        </T>
        <T v="caption" color={c.textMuted}>
          Zoom in for accuracy; tap again to move it.
        </T>
        {pkg.floors.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {[...pkg.floors]
              .sort((a, b) => b.level - a.level)
              .map((f) => (
                <Chip
                  key={f.id}
                  label={f.label}
                  selected={f.id === floorId}
                  onPress={() => {
                    setFloorId(f.id);
                    setPoint(null);
                  }}
                />
              ))}
          </View>
        )}
      </View>
      <View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: 20,
            paddingBottom: insets.bottom + 16,
            gap: 10,
            backgroundColor: c.surface,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
          },
          shadow('sheet', dark),
        ]}
      >
        <T v="caption" color={c.textMuted}>
          {point
            ? `${roomNameAt(pkg, floorId, point) ?? 'Spot chosen'} - tap again to adjust.`
            : 'Nothing placed yet.'}
        </T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label="Cancel"
            kind="secondary"
            size="md"
            grow
            onPress={onCancel}
          />
          <Button
            label="Save"
            size="md"
            grow
            disabled={!point}
            onPress={() =>
              point && onSave({ ...beacon, floorId, x: point.x, y: point.y })
            }
          />
        </View>
      </View>
    </View>
  );
}
