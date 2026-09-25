import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { activeVenue as sampleVenue } from '../config/active-venue';
import {
  NavigationEngine,
  resolveAnchorPayload,
  type Recording,
  type TrackingSnapshot,
} from '@turn/positioning-core';
import { PDR_REVISION } from '@turn/pdr';
import type { Observation } from '@turn/contracts';
import { startMotionSource } from '../sensors/motion-source';

const empty: TrackingSnapshot = {
  pose: null,
  steps: 0,
  distanceMetres: 0,
  message: 'Choose a test walk or establish your starting point.',
  stopped: false,
};
export function useNavigationSession() {
  const [snapshot, setSnapshot] = useState(empty);
  const [anchorNodeId, setAnchorNodeId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const engine = useRef<NavigationEngine | null>(null);
  const recording = useRef<Recording | null>(null);
  const stopSource = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const lastTime = useRef(0);
  const lastRender = useRef(0);
  const pendingStart = useRef(false);
  const [trace, setTrace] = useState<{ x: number; y: number }[]>([]);
  const traceRef = useRef<{ x: number; y: number }[]>([]);
  const lastSteps = useRef(0);

  const stop = useCallback((reason = 'Paused. Re-anchor before resuming.') => {
    generation.current++;
    pendingStart.current = false;
    stopSource.current?.();
    stopSource.current = null;
    setRunning(false);
    setStarting(false);
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
      setSnapshot(engine.current.consume(event));
    }
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && stopSource.current)
        stop('App backgrounded. Re-anchor before resuming.');
    });
    return () => {
      generation.current++;
      stopSource.current?.();
      subscription.remove();
    };
  }, [stop]);

  const anchor = (payload: string, stepLength: number) => {
    const resolved = resolveAnchorPayload(payload, sampleVenue);
    stopSource.current?.();
    stopSource.current = null;
    generation.current++;
    pendingStart.current = false;
    setStarting(false);
    setRunning(false);
    const sessionId = `walk-${Date.now()}`;
    engine.current = new NavigationEngine(sampleVenue, sessionId, stepLength);
    recording.current = {
      venue: sampleVenue,
      schemaVersion: 1,
      algorithm: PDR_REVISION,
      sessionId,
      stepLengthMetres: stepLength,
      metadata: {
        platform: Platform.OS,
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
  const start = async (headingRad: number) => {
    if (Platform.OS === 'web')
      throw new Error(
        'Live motion testing requires Expo Go on a phone. Browser preview does not simulate walking.',
      );
    if (!engine.current || !recording.current || snapshot.stopped)
      throw new Error('Establish a fresh anchor first.');
    if (pendingStart.current || stopSource.current) return;
    pendingStart.current = true;
    setStarting(true);
    const token = ++generation.current;
    const activeEngine = engine.current,
      activeRecording = recording.current;
    const alignment: Observation = {
      schemaVersion: 1,
      sessionId: activeRecording.sessionId,
      source: 'user-heading',
      timestampSeconds: 0,
      type: 'heading-alignment',
      headingRad,
      frame: 'venue',
    };
    activeRecording.observations.push(alignment);
    activeEngine.consume(alignment);
    try {
      const cleanup = await startMotionSource(
        activeRecording.sessionId,
        (event) => {
          if (generation.current !== token) return;
          lastTime.current = Math.max(lastTime.current, event.timestampSeconds);
          if (activeRecording.observations.length >= 30000) {
            stop('Recording limit reached. Export and re-anchor.');
            return;
          }
          activeRecording.observations.push(event);
          const next = activeEngine.consume(event);
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
            setSnapshot(next);
          }
        },
        (message) => {
          if (generation.current === token) stop(message);
        },
      );
      if (generation.current !== token) {
        cleanup();
        return;
      }
      stopSource.current = cleanup;
      setRunning(true);
    } catch (error) {
      if (generation.current === token)
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
    anchor,
    start,
    stop,
    getRecording: () => recording.current,
    getSnapshot: () => engine.current?.snapshot() ?? empty,
    trace,
  };
}
