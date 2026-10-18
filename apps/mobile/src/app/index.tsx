import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calculateRoute, RouteGuidance, type Guidance } from '@turn/routing';
import { anchorPayload } from '@turn/positioning-core';
import type { Pose, Route } from '@turn/contracts';
import { activeVenue as venue } from '../config/active-venue';
import { useNavigationSession } from '../navigation/use-navigation-session';
import { loadCalibration } from '../navigation/calibration-storage';
import { saveRun } from '../navigation/run-storage';
import {
  AssistedTracker,
  type BeaconHealth,
  type TrackerEstimate,
} from '../navigation/assisted-tracker';
import {
  buildFusionMap,
  etaMinutes,
  headingAlongRoute,
  nearestAnchor,
  nearestRoutableNode,
  remainingRoute,
  roomNameAt,
} from '../navigation/assist-helpers';
import { fingerprintProfile, loadPlacements } from '../fingerprinting/storage';
import { DisplayPose } from '../navigation/display-pose';
import { NavMap } from '../components/nav-map';
import { theme } from '../components/ui';

type Phase =
  'idle' | 'locating' | 'confirm' | 'ready' | 'navigating' | 'arrived';
const BLUE = '#1A73E8';
const floorId = venue.floors[0]!.id;

function maneuver(g: Guidance | null) {
  if (!g) return { glyph: '↑', text: 'Head along the route', sub: '' };
  if (g.status === 'off-route' || g.status === 'recover')
    return {
      glyph: '↻',
      text: 'Rerouting…',
      sub: 'Finding the best way from where you are',
    };
  const metres = g.distanceToActionMetres;
  const dist =
    metres >= 10 ? `${Math.round(metres)} m` : `${metres.toFixed(0)} m`;
  if (g.status === 'near-destination')
    return { glyph: '⚑', text: 'Your destination is close', sub: '' };
  if (g.action === 'arrive')
    return { glyph: '↑', text: `Continue ${dist}`, sub: 'to your destination' };
  const glyph =
    g.action === 'left'
      ? '↰'
      : g.action === 'right'
        ? '↱'
        : g.action === 'turn-around'
          ? '↶'
          : '↑';
  const verb =
    g.action === 'turn-around'
      ? 'Turn around'
      : g.action === 'continue'
        ? 'Continue'
        : `Turn ${g.action}`;
  return {
    glyph,
    text: metres <= 1.2 ? `${verb} now` : `${verb} in ${dist}`,
    sub: '',
  };
}

export default function Navigate() {
  const session = useNavigationSession({ shadow: false });
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    fingerprintAnchor?: string;
    fingerprintRecord?: string;
  }>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [destination, setDestination] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [est, setEst] = useState<TrackerEstimate | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [follow, setFollow] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [stepLength, setStepLength] = useState<number | null>(null);
  const [health, setHealth] = useState<BeaconHealth[]>([]);
  const [tapMode, setTapMode] = useState<'destination' | 'position'>(
    'destination',
  );
  const [reroutes, setReroutes] = useState(0);
  const [markOpen, setMarkOpen] = useState(false);
  const display = useRef(new DisplayPose()).current;
  const [shown, setShown] = useState<{ x: number; y: number } | null>(null);
  const lowConfidenceSince = useRef<number | null>(null);
  const [notSure, setNotSure] = useState(false);
  const [lastMark, setLastMark] = useState('');
  const tracker = useRef<AssistedTracker | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const guide = useRef<RouteGuidance | null>(null);
  const offRouteSince = useRef<number | null>(null);
  const appliedFingerprint = useRef<string | null>(null);
  const [sheetHeight, setSheetHeight] = useState(200);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  const poi = venue.pois.find((p) => p.id === destination) ?? null;
  const destNode = poi
    ? (venue.nodes.find((n) => n.id === poi.nodeId) ?? null)
    : null;
  const rawPose = session.snapshot.pose;
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadCalibration().then((v) => active && setStepLength(v));
      return () => {
        active = false;
        // Leaving the screen mid-setup: stop scanning and drop the half-finished fix.
        if (phaseRef.current === 'locating' || phaseRef.current === 'confirm') {
          disposeTracker();
          setPhase('idle');
        }
      };
    }, []),
  );

  function ensureTracker() {
    if (tracker.current) return tracker.current;
    let placements = null;
    try {
      const saved = loadPlacements(venue.venueId, venue.revision);
      if (
        saved &&
        saved.deviceProfile === fingerprintProfile() &&
        saved.beacons.some((b) => b.referenceRssi !== undefined)
      )
        placements = saved;
    } catch {
      placements = null;
    }
    const t = new AssistedTracker({
      floorId,
      map: buildFusionMap(venue, floorId),
      placements,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    tracker.current = t;
    unsubscribe.current = t.subscribe(setEst);
    return t;
  }
  function disposeTracker() {
    unsubscribe.current?.();
    unsubscribe.current = null;
    tracker.current?.finish();
    tracker.current = null;
    setEst(null);
    setHealth([]);
  }
  useEffect(() => () => disposeTracker(), []);
  useEffect(() => {
    if (!tracker.current) return;
    const timer = setInterval(
      () => setHealth(tracker.current?.health() ?? []),
      1000,
    );
    return () => clearInterval(timer);
  }, [phase]);

  function selectDestination(id: string) {
    setDestination(id);
    setSearchOpen(false);
    setQuery('');
    setError('');
    if (phase === 'arrived') {
      setPhase('idle');
      setRoute(null);
    }
  }
  async function findMe() {
    if (!poi) return;
    setError('');
    setMessage('Listening for your beacons…');
    setPhase('locating');
    try {
      const t = ensureTracker();
      if (t.estimate()) {
        setPhase('confirm');
        setMessage('');
        return;
      }
      await t.begin();
      if (t.beaconCount < 2) {
        setTapMode('position');
        setMessage(
          t.beaconCount === 0
            ? 'Beacon assist is not set up yet. Tap where you are on the map.'
            : 'Only one beacon is set up. Tap where you are on the map.',
        );
        setPhase('confirm');
        return;
      }
      const found = await t.locate(6000);
      if (phaseRef.current !== 'locating') return;
      if (!found) {
        setTapMode('position');
        setMessage(
          t.streamFailure ??
            'Could not hear enough beacons here. Tap where you are on the map.',
        );
      } else setMessage('');
      setPhase('confirm');
    } catch (e) {
      setTapMode('position');
      setMessage(
        `${e instanceof Error ? e.message : String(e)} Tap where you are on the map.`,
      );
      setPhase('confirm');
    }
  }
  function buildRoute(from: { x: number; y: number }) {
    if (!poi) return null;
    const start = nearestRoutableNode(venue, floorId, from);
    const result = calculateRoute(venue, start.id, poi.nodeId);
    if (result.status !== 'ok') return null;
    return result.route;
  }
  function confirmLocation() {
    const e = tracker.current?.estimate();
    if (!e || !poi) return;
    const r = buildRoute(e);
    if (!r) {
      setError(
        'No walkable route from here to that destination. Tap your location again.',
      );
      return;
    }
    setRoute(r);
    guide.current = new RouteGuidance(r);
    setGuidance(guide.current.snapshot());
    setReroutes(0);
    setFollow(false);
    setPhase('ready');
  }
  function beginWalking() {
    const e = tracker.current?.estimate();
    if (!e || !route || !poi) return;
    try {
      const anchor = nearestAnchor(venue, floorId, e);
      session.anchor(
        anchorPayload(venue, anchor.id),
        stepLength ?? 0.62,
        'resilient',
      );
      tracker.current!.syncRaw(anchor.position.x, anchor.position.y);
      const line = remainingRoute(route.geometry, e);
      const heading = headingAlongRoute(line, e, 1) ?? 0;
      const rec = session.getRecording();
      if (rec)
        rec.navigation = {
          destinationPoiId: poi.id,
          sourceAnchorId: anchor.id,
          guidanceRevision: 'route-progress-v2',
          completion: 'in-progress',
        };
      offRouteSince.current = null;
      setError('');
      setFollow(true);
      setPhase('navigating');
      void session.start(heading).catch(report);
    } catch (err) {
      report(err);
    }
  }
  function reroute(from: { x: number; y: number }) {
    const r = buildRoute(from);
    if (!r) return;
    setRoute(r);
    guide.current = new RouteGuidance(r);
    offRouteSince.current = null;
    setReroutes((n) => n + 1);
  }
  function arrive() {
    const rec = session.getRecording();
    session.stop('Arrived at the destination.');
    if (rec?.observations.some((o) => o.type === 'accelerometer')) {
      try {
        saveRun(rec);
      } catch (e) {
        report(e);
      }
    }
    disposeTracker();
    setFollow(false);
    setPhase('arrived');
  }
  function endNavigation() {
    session.stop('Navigation ended.');
    disposeTracker();
    setRoute(null);
    setGuidance(null);
    setFollow(false);
    setTapMode('destination');
    setMessage('');
    setPhase('idle');
  }

  // What the dot shows: snapped to the route, smoothed, and still while the user stands (Plan 002 A3).
  useEffect(() => {
    if (!est) {
      display.reset();
      setShown(null);
      return;
    }
    display.update(
      { x: est.x, y: est.y },
      Date.now() / 1000,
      est.source === 'walking',
      est.source === 'fix' || phaseRef.current === 'confirm',
    );
  }, [est]);
  useEffect(() => {
    display.setRoute(
      route ? route.geometry.map((q) => ({ x: q.x, y: q.y })) : null,
    );
  }, [route]);
  useEffect(() => {
    if (!est) return;
    const timer = setInterval(() => {
      const before = display.current();
      const next = display.step(0.08);
      if (
        next &&
        (!before || Math.hypot(next.x - before.x, next.y - before.y) > 0.01)
      )
        setShown({ x: next.x, y: next.y });
    }, 80);
    return () => clearInterval(timer);
  }, [!!est]);

  // Walking sensors feed the filter as displacements.
  useEffect(() => {
    if (phase !== 'navigating' || !rawPose) return;
    tracker.current?.walk(rawPose.position.x, rawPose.position.y);
  }, [rawPose?.position.x, rawPose?.position.y, phase]);

  // Guidance runs on the fused position, with automatic rerouting and arrival.
  useEffect(() => {
    if (phase !== 'navigating' || !guide.current || !est || !rawPose) return;
    const fused: Pose = {
      ...rawPose,
      position: { x: est.x, y: est.y },
      status: 'tracking',
      horizontalUncertaintyMetres: est.displaySigmaMetres,
    };
    const g = guide.current.consume(fused);
    setGuidance(g);
    if (g.status === 'off-route' || g.status === 'recover') {
      offRouteSince.current ??= Date.now();
      if (
        Date.now() - offRouteSince.current > 4000 &&
        est.displaySigmaMetres < 3
      )
        reroute(est);
    } else offRouteSince.current = null;
    // A4: do not give turn instructions while we genuinely do not know where the user is.
    if (est.displaySigmaMetres > 4) {
      lowConfidenceSince.current ??= Date.now();
      if (Date.now() - lowConfidenceSince.current > 10000) setNotSure(true);
    } else {
      lowConfidenceSince.current = null;
      setNotSure(false);
    }
    if (
      destNode &&
      (g.status === 'near-destination' || g.remainingMetres < 1.2) &&
      Math.hypot(est.x - destNode.x, est.y - destNode.y) < 2.4
    )
      arrive();
  }, [est, rawPose?.timestampSeconds, phase]);

  // Walking sensors stopped (permission, tilt, timing): keep the fused position and ask to resume.
  useEffect(() => {
    if (phase === 'navigating' && session.snapshot.stopped) {
      setMessage(
        `${session.snapshot.message} Hold the phone flat and press Resume.`,
      );
      setFollow(false);
      setPhase('ready');
    }
  }, [session.snapshot.stopped]);

  // A confirmed fingerprint match from the Survey tab sets the position.
  useEffect(() => {
    const id = params.fingerprintRecord;
    if (!id || appliedFingerprint.current === id || !params.fingerprintAnchor)
      return;
    appliedFingerprint.current = id;
    const anchor = venue.anchors.find((a) => a.id === params.fingerprintAnchor);
    if (!anchor) return;
    const t = ensureTracker();
    void t.begin();
    t.setPosition(anchor.position.x, anchor.position.y, 1.2);
    setMessage(`Position set from your fingerprint at ${anchor.label}.`);
    setPhase((p) => (p === 'idle' ? 'confirm' : p));
  });

  const displayRoute = useMemo(() => {
    if (!route) return undefined;
    const pts = route.geometry.map((p) => ({ x: p.x, y: p.y }));
    if (!est) return pts;
    const line = remainingRoute(pts, est);
    return Math.hypot(line[0]!.x - est.x, line[0]!.y - est.y) > 0.4
      ? [{ x: est.x, y: est.y }, ...line]
      : line;
  }, [route, est?.x, est?.y]);
  const remaining =
    guidance && guidance.status !== 'off-route'
      ? guidance.remainingMetres
      : null;
  const heardCount = health.filter(
    (h) => h.silentSeconds !== null && h.silentSeconds < 6,
  ).length;
  const silentBeacons = health
    .filter((h) => h.silentSeconds === null || h.silentSeconds > 20)
    .map((h) => h.tag);
  const streamProblem = tracker.current?.streamFailure ?? null;
  const matches = query
    ? venue.pois
        .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
    : venue.pois.slice(0, 6);
  const here = est ? roomNameAt(venue, floorId, est) : null;
  const mapBeacons =
    phase === 'idle' || phase === 'navigating' || phase === 'confirm' ? [] : [];

  // Ground truth for evaluation: "I am standing at this known point now". Never moves the dot.
  const landmarkChoices = useMemo(
    () => [
      ...venue.anchors.map((a) => ({
        id: a.id,
        label: a.label,
        x: a.position.x,
        y: a.position.y,
      })),
      ...venue.pois.flatMap((p) => {
        const n = venue.nodes.find((q) => q.id === p.nodeId);
        return n ? [{ id: 'poi-' + p.id, label: p.name, x: n.x, y: n.y }] : [];
      }),
    ],
    [],
  );
  function markLandmark(l: {
    id: string;
    label: string;
    x: number;
    y: number;
  }) {
    tracker.current?.markLandmark(l.id, l.x, l.y);
    setLastMark('Marked ' + l.label + ' for the accuracy log.');
    setMarkOpen(false);
  }

  function onMapTap(p: { x: number; y: number }) {
    if (phase === 'confirm' && tapMode === 'position') {
      const t = ensureTracker();
      void t.begin();
      t.setPosition(p.x, p.y, 1.2);
      setMessage('');
      return;
    }
    if (phase === 'navigating' && tapMode === 'position') {
      tracker.current?.setPosition(p.x, p.y, 1.2);
      setTapMode('destination');
      setMessage('Location corrected.');
      return;
    }
    if (phase === 'idle' || phase === 'arrived') {
      const nearest = venue.pois
        .map((q) => ({ q, n: venue.nodes.find((n) => n.id === q.nodeId)! }))
        .filter((r) => r.n.floorId === floorId)
        .map((r) => ({ q: r.q, d: Math.hypot(r.n.x - p.x, r.n.y - p.y) }))
        .sort((a, b) => a.d - b.d)[0];
      if (nearest && nearest.d < 3) selectDestination(nearest.q.id);
    }
  }

  const sheet = {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: Math.max(insets.bottom, 14) + 4,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 14,
  };
  const primary = (title: string, onPress: () => void, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: disabled ? '#C9D3E0' : BLUE,
        borderRadius: 26,
        minHeight: 52,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 22,
      }}
    >
      <Text style={{ color: 'white', fontSize: 17, fontWeight: '700' }}>
        {title}
      </Text>
    </Pressable>
  );
  const secondary = (title: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{
        borderRadius: 26,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
        backgroundColor: '#EEF3FD',
      }}
    >
      <Text style={{ color: BLUE, fontSize: 16, fontWeight: '600' }}>
        {title}
      </Text>
    </Pressable>
  );
  const man = maneuver(guidance);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <NavMap
        venue={venue}
        floorId={floorId}
        height="fill"
        insets={{
          top: phase === 'navigating' ? insets.top + 96 : insets.top + 70,
          bottom: sheetHeight + 8,
        }}
        position={
          est
            ? {
                x: shown?.x ?? est.x,
                y: shown?.y ?? est.y,
                sigma: est.displaySigmaMetres,
                headingRad:
                  phase === 'navigating' ? (rawPose?.headingRad ?? null) : null,
              }
            : null
        }
        route={displayRoute}
        destination={destNode ? { x: destNode.x, y: destNode.y } : null}
        beacons={mapBeacons}
        follow={follow}
        onFollowChange={setFollow}
        onTap={onMapTap}
        hint={
          tapMode === 'position' &&
          (phase === 'confirm' || phase === 'navigating')
            ? 'Tap your exact location on the map'
            : undefined
        }
      />
      <View
        style={{
          position: 'absolute',
          top: insets.top + 10,
          left: 12,
          right: 12,
          gap: 8,
        }}
      >
        {phase === 'navigating' ? (
          <View
            style={{
              backgroundColor: '#1F3A5F',
              borderRadius: 20,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <Text style={{ color: 'white', fontSize: 44, lineHeight: 48 }}>
              {notSure ? '?' : man.glyph}
            </Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: 'white', fontSize: 22, fontWeight: '700' }}
                accessibilityLiveRegion="polite"
              >
                {session.settling > 0 || session.starting
                  ? `Hold still · ${session.settling || 4}`
                  : notSure
                    ? 'Not sure where you are'
                    : man.text}
              </Text>
              {notSure ? (
                <Text style={{ color: '#C7D6EE', fontSize: 14 }}>
                  Tap Fix my location below, then tap where you are.
                </Text>
              ) : man.sub ? (
                <Text style={{ color: '#C7D6EE', fontSize: 14 }}>
                  {man.sub}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <>
            <View
              style={{
                backgroundColor: 'white',
                borderRadius: 26,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                shadowColor: '#000',
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <Text style={{ fontSize: 18, color: '#5F6368' }}>⌕</Text>
              <TextInput
                accessibilityLabel="Search rooms and places"
                placeholder={poi ? poi.name : 'Search rooms and places'}
                placeholderTextColor={poi ? theme.ink : '#80868B'}
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChangeText={(v) => {
                  setQuery(v);
                  setSearchOpen(true);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: theme.ink,
                }}
              />
              {(query || searchOpen) && (
                <Pressable
                  accessibilityLabel="Close search"
                  onPress={() => {
                    setQuery('');
                    setSearchOpen(false);
                  }}
                >
                  <Text style={{ fontSize: 20, color: '#5F6368', padding: 6 }}>
                    ✕
                  </Text>
                </Pressable>
              )}
            </View>
            {searchOpen && (
              <View
                style={{
                  backgroundColor: 'white',
                  borderRadius: 20,
                  overflow: 'hidden',
                  elevation: 8,
                }}
              >
                {matches.length === 0 ? (
                  <Text style={{ padding: 16, color: theme.muted }}>
                    No matching places.
                  </Text>
                ) : (
                  matches.map((p) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      onPress={() => selectDestination(p.id)}
                      style={{
                        paddingVertical: 14,
                        paddingHorizontal: 18,
                        borderTopWidth: 1,
                        borderColor: '#EEF1F5',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          color: theme.ink,
                          fontWeight: '600',
                        }}
                      >
                        {p.name}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            )}
          </>
        )}
        {error ? (
          <View
            style={{
              backgroundColor: '#FDECEA',
              borderRadius: 14,
              padding: 12,
            }}
          >
            <Text accessibilityRole="alert" style={{ color: '#9C3328' }}>
              {error}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        style={sheet}
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
      >
        {phase === 'idle' && (
          <>
            {poi ? (
              <>
                <Text
                  style={{ fontSize: 24, fontWeight: '700', color: theme.ink }}
                >
                  {poi.name}
                </Text>
                <Text style={{ color: theme.muted }}>{venue.name}</Text>
                {primary('Directions', () => void findMe())}
              </>
            ) : (
              <>
                <Text
                  style={{ fontSize: 22, fontWeight: '700', color: theme.ink }}
                >
                  Where to?
                </Text>
                <Text style={{ color: theme.muted }}>
                  Search above, or tap a room on the map.
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {venue.pois.slice(0, 8).map((p) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      onPress={() => selectDestination(p.id)}
                      style={{
                        backgroundColor: '#EEF3FD',
                        borderRadius: 18,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: BLUE, fontWeight: '600' }}>
                        {p.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}
            <Text style={{ color: theme.muted, fontSize: 12 }}>
              {tracker.current?.beaconCount
                ? `Beacon assist ready · ${tracker.current.beaconCount} beacons`
                : 'Beacon assist is set up in the Beacons tab.'}
            </Text>
          </>
        )}
        {phase === 'locating' && (
          <>
            <Text style={{ fontSize: 22, fontWeight: '700', color: theme.ink }}>
              Finding you…
            </Text>
            <Text style={{ color: theme.muted }}>
              {message || 'Stand still for a few seconds.'}
            </Text>
            {secondary('Cancel', endNavigation)}
          </>
        )}
        {phase === 'confirm' && (
          <>
            <Text style={{ fontSize: 22, fontWeight: '700', color: theme.ink }}>
              {est
                ? here
                  ? `You're in ${here}`
                  : "You're here"
                : 'Where are you?'}
            </Text>
            <Text style={{ color: theme.muted }}>
              {est
                ? `Accuracy about ±${Math.max(0.5, est.displaySigmaMetres).toFixed(1)} m${est.beaconsUsed ? ` · ${est.beaconsUsed} beacons heard` : ''}`
                : message || 'Tap your location on the map.'}
            </Text>
            {est && message ? (
              <Text style={{ color: theme.muted }}>{message}</Text>
            ) : null}
            {primary(
              est
                ? 'Yes, start directions'
                : 'Tap the map to set your location',
              confirmLocation,
              !est,
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                {secondary('Not here · tap map', () => setTapMode('position'))}
              </View>
              <View style={{ flex: 1 }}>
                {secondary('Try again', () => {
                  disposeTracker();
                  void findMe();
                })}
              </View>
            </View>
            <Pressable
              onPress={() =>
                router.navigate({
                  pathname: '/survey',
                  params: { intent: 'find' },
                })
              }
              accessibilityRole="button"
            >
              <Text
                style={{ color: BLUE, textAlign: 'center', paddingVertical: 4 }}
              >
                Use a surveyed spot (fingerprint) instead
              </Text>
            </Pressable>
          </>
        )}
        {phase === 'ready' && route && (
          <>
            <Text style={{ fontSize: 22, fontWeight: '700', color: theme.ink }}>
              {poi?.name} ·{' '}
              {Math.round(guidance?.remainingMetres ?? route.distanceMetres)} m
            </Text>
            <Text style={{ color: theme.muted }}>
              {message ||
                'Hold the phone flat with its top edge pointing the way you will walk first, along the blue line.'}
            </Text>
            {stepLength === null && (
              <Text style={{ color: theme.warning, fontSize: 13 }}>
                Using a default step length. Calibrate once under Tests for
                better distance.
              </Text>
            )}
            {primary(
              session.snapshot.stopped ? 'Resume' : 'Start walking',
              beginWalking,
            )}
            {secondary('Cancel', endNavigation)}
          </>
        )}
        {phase === 'navigating' && (
          <>
            <View
              style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}
            >
              <Text
                style={{ fontSize: 28, fontWeight: '700', color: theme.ink }}
              >
                {remaining !== null
                  ? `${Math.max(1, Math.round(remaining))} m`
                  : '…'}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 16 }}>
                {remaining !== null
                  ? `${etaMinutes(remaining)} min · ${poi?.name}`
                  : poi?.name}
              </Text>
            </View>
            <Text style={{ color: theme.muted, fontSize: 13 }}>
              {est
                ? `±${Math.max(0.5, est.displaySigmaMetres).toFixed(1)} m · ${heardCount}/${health.length || tracker.current?.beaconCount || 0} beacons${reroutes ? ` · rerouted ${reroutes}×` : ''}`
                : 'Positioning…'}
              {message ? ` · ${message}` : ''}
            </Text>
            {streamProblem ? (
              <Text style={{ color: theme.danger, fontSize: 13 }}>
                Beacon scanning stopped: {streamProblem} Positioning continues
                from walking and the map only.
              </Text>
            ) : silentBeacons.length ? (
              <Text style={{ color: theme.warning, fontSize: 13 }}>
                Not hearing {silentBeacons.join(', ')}. Check those phones are
                on and nearby.
              </Text>
            ) : null}
            {markOpen ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {landmarkChoices.map((l) => (
                  <Pressable
                    key={l.id}
                    accessibilityRole="button"
                    onPress={() => markLandmark(l)}
                    style={{
                      backgroundColor: '#FFF4E5',
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={{ color: '#8A5300', fontWeight: '600' }}>
                      {l.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : lastMark ? (
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                {lastMark}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                {secondary('Mark where I am', () => setMarkOpen(!markOpen))}
              </View>
              <View style={{ flex: 1 }}>
                {secondary('Fix my location', () => {
                  setTapMode('position');
                  setMessage('Tap where you really are');
                })}
              </View>
              <View style={{ flex: 1 }}>{secondary('End', endNavigation)}</View>
            </View>
          </>
        )}
        {phase === 'arrived' && (
          <>
            <Text style={{ fontSize: 24, fontWeight: '700', color: theme.ink }}>
              You've arrived
            </Text>
            <Text style={{ color: theme.muted }}>{poi?.name}</Text>
            {primary('Done', () => {
              setDestination(null);
              setRoute(null);
              setGuidance(null);
              setPhase('idle');
            })}
          </>
        )}
      </View>
    </View>
  );
}
