import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  calculateRoute,
  initialRouteHeading,
  RouteGuidance,
  type Guidance,
} from '@turn/routing';
import { anchorPayload, resolveAnchorPayload } from '@turn/positioning-core';
import { activeVenue as venue } from '../config/active-venue';
import { useNavigationSession } from '../navigation/use-navigation-session';
import { loadCalibration } from '../navigation/calibration-storage';
import { saveRun } from '../navigation/run-storage';
import { FloorMap } from '../components/floor-map';
import { AnchorScanner } from '../components/anchor-scanner';

import { Action, Section, theme, ui } from '../components/ui';
import { loadFingerprintRecords } from '../fingerprinting/storage';
import { evaluateFingerprint } from '@turn/positioning-core';
const ink = theme.ink;
const card = ui.card;
function instruction(g: Guidance) {
  if (g.status === 'off-route') return 'Off-route estimate · still recording';
  if (g.status === 'recover' || g.status === 'unsupported')
    return 'Check your location';
  if (g.status === 'near-destination') return 'Check for your destination';
  const metres = g.distanceToActionMetres.toFixed(1);
  if (g.action === 'arrive')
    return `Continue · about ${metres} m to destination`;
  const action =
    g.action === 'turn-around'
      ? 'Turn around'
      : g.action === 'continue'
        ? 'Continue'
        : `Turn ${g.action}`;
  return g.distanceToActionMetres <= 0.8
    ? `${action} at the junction`
    : `${action} in about ${metres} m`;
}

export default function Navigate() {
  const session = useNavigationSession();
  const params = useLocalSearchParams<{
    fingerprintAnchor?: string;
    fingerprintRecord?: string;
  }>();
  const appliedFingerprint = useRef<string | null>(null);
  const insets = useSafeAreaInsets();
  const [destination, setDestination] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stepLength, setStepLength] = useState<number | null>(null);
  const [calibrationLoaded, setCalibrationLoaded] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showStarts, setShowStarts] = useState(false);
  const [anchorName, setAnchorName] = useState('Location not set');
  const [aligned, setAligned] = useState(false);
  const [started, setStarted] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [error, setError] = useState('');
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [checkpointNode, setCheckpointNode] = useState<string | null>(null);
  const [checkpointMessage, setCheckpointMessage] = useState('');
  const [markedAt, setMarkedAt] = useState<number | null>(null);
  const busy = session.running || session.starting;
  const pose = session.snapshot.pose;
  const sessionId = session.getRecording()?.sessionId;
  const poi = venue.pois.find((p) => p.id === destination);
  const routeResult = useMemo(
    () =>
      destination && session.anchorNodeId
        ? calculateRoute(
            venue,
            session.anchorNodeId,
            venue.pois.find((p) => p.id === destination)!.nodeId,
          )
        : null,
    [destination, session.anchorNodeId],
  );
  const route = routeResult?.status === 'ok' ? routeResult.route : undefined;
  const guide = useMemo(
    () => (route ? new RouteGuidance(route) : null),
    [route, sessionId],
  );
  const heading = route ? initialRouteHeading(route) : null;
  const checkpoint = venue.nodes.find(
    (n) => n.id === checkpointNode && route?.nodeIds.includes(n.id),
  );
  useEffect(() => {
    setCheckpointNode(null);
    setMarkedAt(null);
    setCheckpointMessage('');
  }, [sessionId, destination]);
  function markCheckpoint(phase: 'arrival' | 'after-wait') {
    if (!checkpoint) return;
    try {
      const point = session.markCheckpoint(checkpoint.id, phase);
      setMarkedAt(phase === 'arrival' ? point.timestampSeconds : null);
      setCheckpointMessage(
        phase === 'arrival'
          ? 'Arrival saved. Stay at this point for 2 seconds, then save the still check.'
          : 'Still check saved. Continue walking or choose your next checkpoint.',
      );
    } catch (e) {
      report(e);
    }
  }
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadCalibration().then((value) => {
        if (active) {
          setStepLength(value);
          setCalibrationLoaded(true);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );
  useEffect(() => {
    if (!guide) {
      setGuidance(null);
      return;
    }
    const next = pose ? guide.consume(pose) : guide.snapshot();
    setGuidance(next);
    if (next.status === 'recover' && busy) session.stop(next.message);
  }, [guide, pose, busy, session.stop]);
  useEffect(() => {
    if (!session.snapshot.stopped) return;
    const recording = session.getRecording();
    if (recording?.observations.some((o) => o.type === 'accelerometer')) {
      try {
        saveRun(recording);
      } catch (e) {
        report(e);
      }
    }
    // Refresh the saved record when the bounded Apple query completes as well.
  }, [session.snapshot.stopped, session.nativeCount?.status, sessionId]);

  function establish(payload: string) {
    const anchor = resolveAnchorPayload(payload, venue);
    const previous = session.getRecording();
    if (previous?.observations.some((o) => o.type === 'accelerometer'))
      saveRun(previous);
    session.anchor(payload, stepLength ?? 0.55, 'continuous-test');
    setAnchorName(anchor.label);
    setScanning(false);
    setShowStarts(false);
    setAligned(false);
    setStarted(false);
    setArrived(false);
    setError('');
  }
  useEffect(() => {
    if (
      !params.fingerprintRecord ||
      appliedFingerprint.current === params.fingerprintRecord ||
      busy ||
      !calibrationLoaded
    )
      return;
    try {
      const saved = loadFingerprintRecords().find(
        (r) =>
          r.sessionId === params.fingerprintRecord &&
          r.survey.venueId === venue.venueId &&
          r.survey.venueRevision === venue.revision,
      );
      const match = saved ? evaluateFingerprint(saved) : null;
      if (
        !saved?.test ||
        Date.now() - Date.parse(saved.test.createdAt) > 120000 ||
        saved.actualAnchorId !== params.fingerprintAnchor ||
        match?.match.anchorId !== params.fingerprintAnchor
      ) {
        appliedFingerprint.current = params.fingerprintRecord;
        throw new Error(
          'This fingerprint confirmation is missing or older than two minutes. Find your place again in Survey.',
        );
      }
      appliedFingerprint.current = params.fingerprintRecord;
      establish(anchorPayload(venue, params.fingerprintAnchor!));
    } catch (e) {
      report(e);
    }
  });
  function selectDestination(id: string) {
    setDestination(id);
    setAligned(false);
    setArrived(false);
    setStarted(false);
    setError('');
  }
  function start() {
    const recording = session.getRecording();
    if (!recording || !poi || heading === null || stepLength === null) return;
    if (recording.stepLengthMetres !== stepLength) {
      setError('Calibration changed. Set your starting location again.');
      return;
    }
    const anchor = recording.observations.find((o) => o.type === 'anchor');
    if (anchor?.type !== 'anchor') return;
    recording.navigation = {
      destinationPoiId: poi.id,
      sourceAnchorId: anchor.anchorId,
      guidanceRevision: 'route-progress-v2',
      completion: 'in-progress',
    };
    setStarted(true);
    setError('');
    void session.start(heading).catch(report);
  }
  function recover() {
    if (busy) session.stop('Paused for location recovery.');
    setScanning(true);
    setAligned(false);
  }
  function confirmArrival() {
    const recording = session.getRecording();
    const anchor = recording?.observations.find((o) => o.type === 'anchor');
    if (recording && poi && anchor?.type === 'anchor')
      recording.navigation = {
        destinationPoiId: poi.id,
        sourceAnchorId: anchor.anchorId,
        guidanceRevision: 'route-progress-v2',
        completion: 'user-confirmed',
      };
    session.stop('Destination confirmed by the user.');
    if (recording) {
      try {
        saveRun(recording);
      } catch (e) {
        report(e);
      }
    }
    setArrived(true);
    setStarted(false);
  }
  const needsRecovery =
    !arrived &&
    !!pose &&
    (session.snapshot.stopped || guidance?.status === 'recover');
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{
        padding: 18,
        paddingBottom: Math.max(insets.bottom, 24),
        gap: 16,
        maxWidth: 850,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <View style={{ gap: 5 }}>
        <Text
          style={{ color: theme.primary, fontWeight: '700', letterSpacing: 2 }}
        >
          YOUR INDOOR GUIDE
        </Text>
        <Text
          style={{
            fontSize: 32,
            letterSpacing: -1,
            color: ink,
            fontWeight: '700',
          }}
        >
          Where are you heading?
        </Text>
        <Text style={{ color: theme.muted }}>{venue.name} · Offline map</Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: '#9c3328' }}>
          {error}
        </Text>
      ) : null}
      {session.nativeSaveError ? (
        <Text accessibilityRole="alert">{session.nativeSaveError}</Text>
      ) : null}
      <View style={{ ...card, padding: 10 }}>
        <FloorMap
          venue={venue}
          compact
          floorId={pose?.floorId ?? venue.floors[0]!.id}
          pose={pose ?? undefined}
          route={route}
          trace={session.trace}
          course={
            checkpoint ? [{ x: checkpoint.x, y: checkpoint.y }] : undefined
          }
          onSelectRoom={
            busy
              ? undefined
              : (id) => {
                  const found = venue.pois.find((p) => p.nodeId === id);
                  if (found) selectDestination(found.id);
                }
          }
          selectedRoom={poi?.nodeId}
        />
        <Text style={{ color: theme.muted, padding: 8 }}>
          Your position is estimated and may drift from the route. Check door
          locations and clearance as you go.
        </Text>
      </View>
      {arrived ? (
        <View style={card}>
          <Text style={{ fontSize: 25, color: ink, fontWeight: '700' }}>
            You confirmed arrival
          </Text>
          <Text>{poi?.name}. Your session is saved in Tests & recordings.</Text>
          <Action
            title="Choose another destination"
            onPress={() => {
              setDestination(null);
              setArrived(false);
              setStarted(false);
            }}
          />
        </View>
      ) : (
        <>
          <View style={card}>
            <Text style={{ color: ink, fontSize: 19, fontWeight: '700' }}>
              1 · Choose a destination
            </Text>
            {poi && (
              <Text style={{ color: ink, fontWeight: '600' }}>
                Selected: {poi.name}
              </Text>
            )}
            {!busy && (
              <>
                <TextInput
                  accessibilityLabel="Search destinations"
                  placeholder="Search rooms and places"
                  value={query}
                  onChangeText={setQuery}
                  style={{
                    padding: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 10,
                  }}
                />
                {query.length > 0 && (
                  <Action title="Clear search" onPress={() => setQuery('')} />
                )}
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
                >
                  {venue.pois
                    .filter((p) =>
                      p.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((p) => (
                      <Action
                        key={p.id}
                        title={p.name}
                        selected={p.id === destination}
                        onPress={() => selectDestination(p.id)}
                      />
                    ))}
                </View>
                {!venue.pois.some((p) =>
                  p.name.toLowerCase().includes(query.toLowerCase()),
                ) && <Text>No matching destinations.</Text>}
              </>
            )}
          </View>
          <View style={card}>
            <Text style={{ color: ink, fontSize: 19, fontWeight: '700' }}>
              2 · Establish your location
            </Text>
            <Text style={ui.body}>{anchorName}</Text>
            <Action
              title="Find location with fingerprints"
              primary
              onPress={() => {
                if (busy) session.stop('Paused to find a surveyed location.');
                router.navigate('/survey');
              }}
            />
            <Action
              title={
                needsRecovery ? 'Scan a marker to recover' : 'Scan location QR'
              }
              onPress={recover}
            />
            {!busy && (
              <Action
                title={
                  showStarts
                    ? 'Hide known locations'
                    : 'Set a known location manually'
                }
                onPress={() => setShowStarts(!showStarts)}
              />
            )}
            {showStarts && !busy && (
              <>
                <Text>
                  Only choose a location where you are physically standing. This
                  resets the position estimate.
                </Text>
                {venue.anchors.map((a) => (
                  <Action
                    key={a.id}
                    title={`I’m at ${a.label}`}
                    onPress={() => {
                      try {
                        establish(anchorPayload(venue, a.id));
                      } catch (e) {
                        report(e);
                      }
                    }}
                  />
                ))}
              </>
            )}
            {scanning && (
              <AnchorScanner
                onScan={establish}
                onClose={() => setScanning(false)}
              />
            )}
          </View>
          {routeResult && routeResult.status !== 'ok' && (
            <Text accessibilityRole="alert">
              No route connects these locations. Choose another destination or
              starting point.
            </Text>
          )}
          {route && guidance && (
            <View
              style={{
                ...card,
                backgroundColor: needsRecovery ? '#fff0de' : '#e7efe6',
              }}
            >
              <Text
                style={{ color: ink, fontSize: 23, fontWeight: '700' }}
                accessibilityLiveRegion="polite"
              >
                {needsRecovery
                  ? 'Tracking paused'
                  : session.starting || (busy && session.settling > 0)
                    ? `Hold still · ${session.settling || 4}`
                    : !started && heading !== null
                      ? '3 · Face the route to begin'
                      : instruction(guidance)}
              </Text>
              {needsRecovery ? (
                <Text>
                  {session.snapshot.message} Scan a known marker or set a known
                  location to recalculate your route.
                </Text>
              ) : (
                <>
                  {guidance.status !== 'off-route' && (
                    <Text style={{ color: ink, fontSize: 20 }}>
                      About {guidance.remainingMetres.toFixed(1)} m remaining
                    </Text>
                  )}
                  {session.snapshot.warning && (
                    <Text>{session.snapshot.warning}</Text>
                  )}
                  <Text>{guidance.message}</Text>
                  {busy && session.settling === 0 && (
                    <Text>
                      Walk when ready. Keep the phone screen-up, top edge facing
                      forward.
                    </Text>
                  )}
                  {busy &&
                    session.snapshot.motion &&
                    !['walking-like', 'checking'].includes(
                      session.snapshot.motion.state,
                    ) && (
                      <Text>
                        Position held while motion is unclear or no walking is
                        detected.
                      </Text>
                    )}
                  {!busy &&
                    !session.snapshot.stopped &&
                    guidance.status !== 'unsupported' &&
                    heading !== null && (
                      <>
                        <Text>
                          At the starting marker, face along the first
                          highlighted segment. The QR sets position, not
                          direction.
                        </Text>
                        <Action
                          title={
                            aligned
                              ? '✓ I’m facing the first route segment'
                              : 'I’m facing the first route segment'
                          }
                          onPress={() => setAligned(!aligned)}
                        />
                        <Action
                          title={
                            stepLength === null
                              ? 'Calibration needed — open Tests & calibration'
                              : 'Start guidance'
                          }
                          primary
                          disabled={!aligned || stepLength === null || scanning}
                          onPress={start}
                        />
                      </>
                    )}
                  {guidance.status === 'near-destination' && (
                    <Action
                      title="I can see the destination — confirm arrival"
                      primary
                      onPress={confirmArrival}
                    />
                  )}
                </>
              )}
              {busy && (
                <Action
                  title="Pause guidance"
                  onPress={() =>
                    session.stop(
                      'Guidance paused. Set a known location before resuming.',
                    )
                  }
                />
              )}
            </View>
          )}
        </>
      )}
      {route && !arrived && (
        <Section title="Accuracy checkpoints">
          <Text style={{ fontSize: 19, fontWeight: '700', color: ink }}>
            Accuracy test · checkpoints
          </Text>
          <Text>
            Select a point on your route. The amber S on the map marks it. Tap
            arrival when you physically reach that point, even if the blue dot
            is behind. These taps record the discrepancy; they do not move the
            dot.
          </Text>
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {route.nodeIds.map((id, i) => (
              <Action
                key={id}
                title={`${checkpointNode === id ? '✓ ' : ''}${i + 1} · ${venue.pois.find((p) => p.nodeId === id)?.name ?? id.replaceAll('-', ' ')}`}
                onPress={() => {
                  setCheckpointNode(id);
                  setMarkedAt(null);
                  setCheckpointMessage('');
                }}
              />
            ))}
          </ScrollView>
          <Action
            title="I’m at the selected point now"
            primary
            disabled={
              !checkpoint ||
              !session.running ||
              session.settling > 0 ||
              markedAt !== null
            }
            onPress={() => markCheckpoint('arrival')}
          />
          {markedAt !== null && (
            <Action
              title={
                session.elapsed < markedAt + 2
                  ? 'Stay still · waiting 2 seconds…'
                  : 'Still at the same point · save check'
              }
              disabled={!session.running || session.elapsed < markedAt + 2}
              onPress={() => markCheckpoint('after-wait')}
            />
          )}
          {checkpointMessage ? (
            <Text accessibilityLiveRegion="polite">{checkpointMessage}</Text>
          ) : null}
          <Text>
            Map positions need on-site verification. Skip a point if you cannot
            identify it confidently. Keep your calibration unchanged for this
            comparison.
          </Text>
          {session.snapshot.motion && (
            <Text>
              {session.snapshot.motion.detected} detected ·{' '}
              {session.snapshot.steps} accepted ·{' '}
              {session.snapshot.motion.rejected} not used ·{' '}
              {session.snapshot.motion.pending} pending
            </Text>
          )}
        </Section>
      )}
      {stepLength === null && (
        <Text>
          Calibrate your step length once in Tests & calibration before starting
          live guidance.
        </Text>
      )}
      <Action
        title="Tests, calibration & recordings"
        onPress={() => {
          if (busy)
            session.stop('Navigation paused to open tests and recordings.');
          const recording = session.getRecording();
          try {
            if (recording?.observations.some((o) => o.type === 'accelerometer'))
              saveRun(recording);
            router.push('/tests');
          } catch (e) {
            report(e);
          }
        }}
      />
      <Text style={{ color: theme.muted, fontSize: 12 }}>
        Experimental one-floor guidance. Position and remaining distance are
        estimates. Use visible surroundings to confirm turns and arrival. No
        furniture or obstacle detection.
      </Text>
    </ScrollView>
  );
}
