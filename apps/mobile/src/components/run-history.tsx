import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { diagnoseRecording, type Recording } from '@turn/positioning-core';
import { activeVenue } from '../config/active-venue';
import { listRuns, readRun } from '../navigation/run-storage';
import { exportRecording } from '../navigation/export-recording';
import { inboxConfigured, sendRun } from '../navigation/send-runs';
import { FloorMap } from './floor-map';

export const RunHistory = memo(function RunHistory({
  revision,
}: {
  revision: number;
}) {
  const [names, setNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<Recording | null>(null);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(10);
  const [sending, setSending] = useState(false);
  const [transfer, setTransfer] = useState('');
  async function send(namesToSend: string[]) {
    if (sending) return;
    setSending(true);
    setError('');
    let sent = 0;
    let failed = 0;
    let lastError = '';
    try {
      for (const name of namesToSend) {
        setTransfer(`Sending ${sent + failed + 1} of ${namesToSend.length}…`);
        try {
          await sendRun(await readRun(name));
          sent++;
        } catch (e) {
          failed = namesToSend.length - sent;
          lastError = String(e);
          break;
        }
      }
      setTransfer(
        `${sent} run(s) confirmed on your computer${failed ? `; ${failed} not sent. Retry safely.` : '. Tell Codex: “check the new runs”.'}`,
      );
      if (lastError) setError(lastError);
    } finally {
      setSending(false);
    }
  }
  const [comparison, setComparison] = useState<ReturnType<
    typeof diagnoseRecording
  > | null>(null);
  useEffect(() => {
    let active = true;
    void listRuns()
      .then((runs) => {
        if (active) setNames(runs);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const diagnostics = useMemo(
    () => (selected ? diagnoseRecording(selected, activeVenue) : null),
    [selected],
  );
  const venue = selected?.venue ?? activeVenue;
  return (
    <View
      style={{
        gap: 10,
        padding: 16,
        backgroundColor: 'white',
        borderRadius: 16,
      }}
    >
      <Text style={{ fontSize: 19, fontWeight: '700' }}>
        Saved runs · {names.length}
      </Text>
      <Text>
        Save your count and notes first. Send tests to this computer for
        analysis, including their map and sensor data. Nothing is sent until you
        tap.
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={sending || names.length === 0 || !inboxConfigured}
        style={{
          padding: 14,
          backgroundColor: '#e7efe6',
          borderRadius: 8,
          opacity: sending || !inboxConfigured ? 0.5 : 1,
        }}
        onPress={() => void send(names)}
      >
        <Text>
          {sending ? 'Sending tests…' : 'Send all saved tests to computer'}
        </Text>
      </Pressable>
      {!inboxConfigured && (
        <Text>
          Computer inbox is off. Start npm run phone:tests on your computer and
          reload TURN.
        </Text>
      )}
      {transfer ? (
        <Text accessibilityLiveRegion="polite">{transfer}</Text>
      ) : null}
      <Text>
        Runs save on this device when you finish or stop. Choose one to replay
        its trace and inspect detection, heading and sensor timing.
      </Text>
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      {names.slice(0, limit).map((name) => (
        <Pressable
          key={name}
          accessibilityRole="button"
          style={{ padding: 12, backgroundColor: '#e7efe6', borderRadius: 8 }}
          onPress={() => {
            setError('');
            void readRun(name)
              .then(setSelected)
              .catch((e) => setError(String(e)));
          }}
        >
          <Text>{name.replace('turn-run-v1-', '').replace('.json', '')}</Text>
        </Pressable>
      ))}
      {names.length > limit && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setLimit(limit + 10)}
        >
          <Text style={{ padding: 14 }}>Show more</Text>
        </Pressable>
      )}
      {diagnostics && selected && (
        <>
          {selected.navigation && (
            <Text>
              Navigation to{' '}
              {venue.pois.find(
                (p) => p.id === selected.navigation?.destinationPoiId,
              )?.name ?? selected.navigation.destinationPoiId}{' '}
              ·{' '}
              {selected.navigation.completion === 'user-confirmed'
                ? 'arrival confirmed by user'
                : selected.navigation.completion}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            style={{ padding: 14, backgroundColor: '#e7efe6', borderRadius: 8 }}
            onPress={() => setComparison(diagnostics)}
          >
            <Text>Compare against this run</Text>
          </Pressable>
          {comparison && (
            <Text selectable>
              Comparison: {comparison.sessionId} (
              {comparison.labels?.pace ?? 'unlabelled'}) · {comparison.steps}{' '}
              steps · {comparison.distanceMetres.toFixed(2)} m ·{' '}
              {comparison.stepLengthMetres.toFixed(3)} m/step. Current:{' '}
              {diagnostics.stepLengthMetres.toFixed(3)} m/step. Compare only
              equivalent paths and modes.
            </Text>
          )}
          <Text selectable>
            {selected.labels?.activity ?? selected.labels?.mode ?? 'walk'} ·{' '}
            {selected.labels?.pace ?? 'unlabelled pace'} · {diagnostics.steps}{' '}
            detected steps / {diagnostics.manualSteps ?? '?'} counted
          </Text>
          {diagnostics.motion && (
            <Text selectable>
              Motion filter: {diagnostics.motion.detected} detected ·{' '}
              {diagnostics.steps} accepted · {diagnostics.motion.rejected}{' '}
              filtered · {diagnostics.motion.pending} pending. Last assessment:{' '}
              {diagnostics.motion.state}. Algorithm: {diagnostics.algorithm}.
            </Text>
          )}
          <Text selectable>
            TURN in native interval:{' '}
            {diagnostics.turnStepsInNativeWindow ?? 'unknown'} · Native count:{' '}
            {diagnostics.nativeStepCount ?? 'unavailable'} · manual:{' '}
            {diagnostics.manualSteps ?? 'unknown'} · native count error:{' '}
            {diagnostics.nativeStepCountError ?? 'unknown'}
          </Text>
          <Text selectable>
            {diagnostics.nativePedometer?.source} ·{' '}
            {diagnostics.nativePedometer?.message}
          </Text>
          <Text selectable>
            {diagnostics.distanceMetres.toFixed(2)} m estimated · endpoint error{' '}
            {diagnostics.endpointErrorMetres?.toFixed(2) ?? 'not confirmed'} m
          </Text>
          {diagnostics.checkpoints.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text style={{ fontWeight: '700' }}>
                Checkpoint discrepancies · map references, not surveyed truth
              </Text>
              {diagnostics.checkpoints.map((point, index) => (
                <Text key={index} selectable>
                  {point.nodeId.replaceAll('-', ' ')} ·{' '}
                  {point.phase === 'arrival' ? 'arrival tap' : 'after waiting'}{' '}
                  at {point.timestampSeconds.toFixed(1)} s:{' '}
                  {point.discrepancyMetres === null
                    ? 'unavailable'
                    : `${point.discrepancyMetres.toFixed(2)} m`}{' '}
                  · {point.steps} accepted / {point.pending ?? '—'} pending /{' '}
                  {point.rejected ?? '—'} not used
                </Text>
              ))}
            </View>
          )}
          {diagnostics.invalidCheckpointCount > 0 && (
            <Text>
              {diagnostics.invalidCheckpointCount} checkpoint(s) could not be
              evaluated.
            </Text>
          )}
          <Text selectable>
            Offset from initial direction:{' '}
            {diagnostics.leftOffsetMetres?.toFixed(2) ?? '—'} m left · mean step
            heading {diagnostics.meanHeadingDeviationDeg?.toFixed(1) ?? '—'}°
            left
          </Text>
          <Text selectable>
            Final heading from start:{' '}
            {diagnostics.finalHeadingDeviationDeg?.toFixed(1) ?? '—'}° left
          </Text>
          <Text selectable>
            Acceleration {diagnostics.acceleration.hz?.toFixed(1) ?? '—'} Hz ·
            largest gap{' '}
            {((diagnostics.acceleration.maxGapSeconds ?? 0) * 1000).toFixed(0)}{' '}
            ms · {diagnostics.acceleration.nonIncreasing} clock
            reversals/repeats
          </Text>
          <Text selectable>
            {diagnostics.failure ??
              diagnostics.stopReasons.at(-1) ??
              'No stop recorded'}
          </Text>
          <Text style={{ fontSize: 12 }}>
            Offsets use the initial direction; turns are not heading errors. A
            replay reproduces the estimate, not the true path.
          </Text>
          <FloorMap
            venue={venue}
            floorId={venue.floors[0]!.id}
            trace={diagnostics.trail}
            course={
              venue.testCourses.find((c) => c.id === selected.test?.courseId)
                ?.points
            }
          />
          <Pressable
            accessibilityRole="button"
            disabled={sending || !inboxConfigured}
            style={{ padding: 14, backgroundColor: '#e7efe6', borderRadius: 8 }}
            onPress={() =>
              void send([`turn-run-v1-${selected.sessionId}.json`])
            }
          >
            <Text>Send selected test to computer</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={{ padding: 14, backgroundColor: '#e7efe6', borderRadius: 8 }}
            onPress={() =>
              void exportRecording(selected).catch((e) => setError(String(e)))
            }
          >
            <Text>Share selected run</Text>
          </Pressable>
        </>
      )}
    </View>
  );
});
