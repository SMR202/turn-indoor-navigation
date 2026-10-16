import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Platform } from 'react-native';
import { activeVenue as sampleVenue } from '../config/active-venue';
import {
  NavigationEngine,
  GUARDED_PDR_REVISION,
  appendCheckpoint,
  resolveAnchorPayload,
  type Recording,
  type TrackingSnapshot,
} from '@turn/positioning-core';
import type { Observation } from '@turn/contracts';
import { startMotionSource } from '../sensors/motion-source';
import { Pedometer } from 'expo-sensors';
import {
  preparePedometer,
  type NativeCount,
} from '../sensors/pedometer-capture';
import { saveRun } from './run-storage';
import { SettledStart } from '../sensors/settled-start';
import { waitForForeground } from '../sensors/foreground';
import TurnMotion from '../../modules/turn-motion';
import {
  startShadowRecording,
  summarizeTrace,
  type ShadowRecorder,
} from '../fingerprinting/shadow';
import { bleBuildAvailable } from '../fingerprinting/ble';
import { fingerprintProfile, loadPlacements } from '../fingerprinting/storage';

const empty: TrackingSnapshot = {
  pose: null,
  steps: 0,
  distanceMetres: 0,
  message: 'Choose a test walk or establish your starting point.',
  stopped: false,
};
export function useNavigationSession(options: { shadow?: boolean } = {}) {
  const shadowEnabled = options.shadow !== false;
  const [snapshot, setSnapshot] = useState(empty);
  const [anchorNodeId, setAnchorNodeId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [settling, setSettling] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [nativeCount, setNativeCount] = useState<NativeCount | null>(null);
  const [nativeSaveError, setNativeSaveError] = useState('');
  const nativeCapture = useRef<Awaited<
    ReturnType<typeof preparePedometer>
  > | null>(null);
  const engine = useRef<NavigationEngine | null>(null);
  const recording = useRef<Recording | null>(null);
  const stopSource = useRef<(() => void) | null>(null);
  const shadow = useRef<ShadowRecorder | null>(null);
  const [shadowNote, setShadowNote] = useState('');
  const finishShadow = useCallback(() => {
    const active = shadow.current;
    shadow.current = null;
    if (!active) return;
    try {
      const trace = active.finish();
      if (mounted.current)
        setShadowNote(
          trace
            ? summarizeTrace(
                trace,
                (id) =>
                  sampleVenue.anchors.find((a) => a.id === id)?.label ?? id,
              )
            : 'Beacon shadow log could not be saved.',
        );
    } catch (e) {
      if (mounted.current)
        setShadowNote(`Beacon shadow log failed: ${String(e)}`);
    }
  }, []);
  const generation = useRef(0);
  const lastTime = useRef(0);
  const lastRender = useRef(0);
  const lastMotionReceived = useRef(-Infinity);
  const pendingStart = useRef(false);
  const startupAbort = useRef<AbortController | null>(null);
  const trackingArmed = useRef(false);
  const [trace, setTrace] = useState<{ x: number; y: number }[]>([]);
  const traceRef = useRef<{ x: number; y: number }[]>([]);
  const lastSteps = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const stop = useCallback(
    (reason = 'Paused. Re-anchor before resuming.') => {
      startupAbort.current?.abort();
      trackingArmed.current = false;
      finishShadow();
      const capture = nativeCapture.current;
      nativeCapture.current = null;
      const finishedRecording = recording.current;
      if (finishedRecording?.navigation?.completion === 'in-progress')
        finishedRecording.navigation.completion = 'stopped';
      void capture?.finish().then(() => {
        if (finishedRecording) {
          try {
            saveRun(finishedRecording);
          } catch (e) {
            if (mounted.current && recording.current === finishedRecording)
              setNativeSaveError(String(e));
          }
        }
      });
      generation.current++;
      pendingStart.current = false;
      stopSource.current?.();
      stopSource.current = null;
      if (mounted.current) {
        setRunning(false);
        setStarting(false);
        setSettling(0);
      }
      if (engine.current && recording.current) {
        const event: Observation = {
          schemaVersion: 1,
          sessionId: recording.current.sessionId,
          source: 'lifecycle',
          timestampSeconds: lastTime.current + 0.000001,
          type: 'capability',
          capability: 'motion',
          status: 'degraded',
          reason,
        };
        recording.current.observations.push(event);
        const next = engine.current.consume(event);
        if (mounted.current) setSnapshot(next);
      }
    },
    [finishShadow],
  );
  useFocusEffect(
    useCallback(
      () => () => {
        if (stopSource.current || pendingStart.current)
          stop('Navigation screen left. Re-anchor before resuming.');
      },
      [stop],
    ),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && trackingArmed.current)
        stop('App backgrounded. Re-anchor before resuming.');
    });
    return () => {
      generation.current++;
      startupAbort.current?.abort();
      trackingArmed.current = false;
      stopSource.current?.();
      shadow.current?.finish();
      shadow.current = null;
      nativeCapture.current?.dispose();
      subscription.remove();
    };
  }, [stop]);

  const anchor = (
    payload: string,
    stepLength: number,
    trackingPolicy: 'bounded' | 'continuous-test' = 'bounded',
  ) => {
    startupAbort.current?.abort();
    trackingArmed.current = false;
    nativeCapture.current?.dispose();
    nativeCapture.current = null;
    setNativeCount(null);
    setNativeSaveError('');
    const resolved = resolveAnchorPayload(payload, sampleVenue);
    stopSource.current?.();
    stopSource.current = null;
    generation.current++;
    pendingStart.current = false;
    setStarting(false);
    setRunning(false);
    setSettling(0);
    setElapsed(0);
    setActiveSeconds(0);
    const sessionId = `walk-${Date.now()}`;
    engine.current = new NavigationEngine(
      sampleVenue,
      sessionId,
      stepLength,
      GUARDED_PDR_REVISION,
      trackingPolicy,
    );
    recording.current = {
      venue: sampleVenue,
      schemaVersion: 1,
      algorithm: GUARDED_PDR_REVISION,
      trackingPolicy,
      sessionId,
      stepLengthMetres: stepLength,
      metadata: {
        platform: Platform.OS,
        acquisitionProtocol: 'settle-3s-warmup-v1',
        acquisitionSource:
          Platform.OS === 'android'
            ? (TurnMotion?.revision ?? 'android-native-module-missing')
            : 'expo-devicemotion-57.0.3',
        osVersion: String(Platform.Version),
        timestampBasis: 'native-boot-seconds-minus-session-origin',
        note: `${sampleVenue.provenance.kind} venue / hand-held screen-up baseline. No measured accuracy implied.`,
      },
      observations: [],
    };
    const event: Observation = {
      schemaVersion: 1,
      sessionId,
      source: 'known-anchor',
      timestampSeconds: 0,
      type: 'anchor',
      venueId: sampleVenue.venueId,
      venueRevision: sampleVenue.revision,
      anchorId: resolved.id,
    };
    recording.current.observations.push(event);
    lastTime.current = 0;
    setSnapshot(engine.current.consume(event));
    traceRef.current = [{ ...resolved.position }];
    lastSteps.current = 0;
    setTrace([...traceRef.current]);
    setAnchorNodeId(resolved.nodeId);
  };
  // Shadow mode: record what beacons would correct; never changes the navigation estimate.
  const beginShadow = async (navigationSessionId: string, token: number) => {
    setShadowNote('');
    if (
      !shadowEnabled ||
      !bleBuildAvailable ||
      Platform.OS === 'web' ||
      shadow.current
    )
      return;
    try {
      const placements = loadPlacements(
        sampleVenue.venueId,
        sampleVenue.revision,
      );
      if (
        !placements ||
        placements.deviceProfile !== fingerprintProfile() ||
        !placements.beacons.some((b) => b.referenceRssi !== undefined)
      )
        return;
      const recorder = await startShadowRecording({
        placements,
        navigationSessionId,
        getEstimate: () => {
          const pose = engine.current?.snapshot().pose;
          return pose
            ? { floorId: pose.floorId, x: pose.position.x, y: pose.position.y }
            : undefined;
        },
      });
      if (generation.current !== token || !mounted.current) {
        recorder.finish();
        return;
      }
      shadow.current = recorder;
      setShadowNote('Beacon shadow log running (positions unchanged).');
    } catch (e) {
      if (mounted.current)
        setShadowNote(
          `Beacon shadow log unavailable: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
  };
  const start = async (headingRad: number) => {
    if (Platform.OS === 'web')
      throw new Error(
        'Live motion testing requires TURN on Android or Expo Go on iPhone. Browser preview does not simulate walking.',
      );
    if (!engine.current || !recording.current || snapshot.stopped)
      throw new Error('Establish a fresh anchor first.');
    if (pendingStart.current || stopSource.current) return;
    pendingStart.current = true;
    setStarting(true);
    const token = ++generation.current;
    const startup = new AbortController();
    startupAbort.current = startup;
    const activeEngine = engine.current,
      activeRecording = recording.current;
    const settledStart = new SettledStart();
    setSettling(4);
    try {
      const capture = await preparePedometer(
        Pedometer,
        Platform.OS,
        (state) => {
          activeRecording.nativePedometer = state;
          if (mounted.current && recording.current === activeRecording)
            setNativeCount(state);
        },
      );
      if (generation.current !== token) {
        capture.dispose();
        return;
      }
      nativeCapture.current = capture;
      const cleanup = await startMotionSource(
        activeRecording.sessionId,
        (event) => {
          if (generation.current !== token) return;
          lastTime.current = Math.max(lastTime.current, event.timestampSeconds);
          if (event.type === 'accelerometer')
            lastMotionReceived.current = performance.now();
          if (activeRecording.observations.length >= 30000) {
            stop('Recording limit reached. Export and re-anchor.');
            return;
          }
          const settled = settledStart.consume(event, headingRad);
          if (settled.alignment) {
            activeRecording.observations.push(settled.alignment);
            activeEngine.consume(settled.alignment);
          }
          activeRecording.observations.push(event);
          const next = activeEngine.consume(event);
          if (settled.remaining === 0) capture.begin(next.steps);
          if (next.pose && next.steps > lastSteps.current) {
            lastSteps.current = next.steps;
            traceRef.current.push({ ...next.pose.position });
            setTrace([...traceRef.current]);
          }
          if (next.stopped) {
            stop(next.message);
            return;
          }
          if (performance.now() - lastRender.current > 100) {
            lastRender.current = performance.now();
            setSettling(settled.remaining);
            setElapsed(event.timestampSeconds);
            setActiveSeconds(
              settled.readyAt === null
                ? 0
                : Math.max(0, event.timestampSeconds - settled.readyAt),
            );
            setSnapshot(next);
          }
        },
        (message) => {
          if (generation.current === token) stop(message);
        },
        async () => {
          await waitForForeground(AppState, startup.signal);
          if (generation.current !== token || !mounted.current)
            throw new Error('Motion startup cancelled.');
          trackingArmed.current = true;
        },
      );
      if (generation.current !== token) {
        cleanup();
        return;
      }
      stopSource.current = cleanup;
      setRunning(true);
      void beginShadow(activeRecording.sessionId, token);
    } catch (error) {
      if (generation.current !== token) return;
      stop(error instanceof Error ? error.message : 'Motion startup failed');
      throw error;
    } finally {
      if (generation.current === token) {
        pendingStart.current = false;
        setStarting(false);
      }
    }
  };
  return {
    snapshot,
    anchorNodeId,
    running,
    starting,
    settling,
    elapsed,
    activeSeconds,
    nativeCount,
    nativeSaveError,
    shadowNote,
    anchor,
    start,
    stop,
    getRecording: () => recording.current,
    getSnapshot: () => engine.current?.snapshot() ?? empty,
    markCheckpoint: (nodeId: string, phase: 'arrival' | 'after-wait') => {
      if (
        !running ||
        settling > 0 ||
        engine.current?.snapshot().stopped ||
        performance.now() - lastMotionReceived.current > 300 ||
        !recording.current
      )
        throw new Error(
          'Wait for active, current tracking before marking a point.',
        );
      const point = appendCheckpoint(recording.current, nodeId, phase);
      saveRun(recording.current);
      return point;
    },
    trace,
  };
}
