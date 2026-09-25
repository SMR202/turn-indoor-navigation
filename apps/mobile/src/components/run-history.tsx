import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { diagnoseRecording, type Recording } from '@turn/positioning-core';
import { activeVenue } from '../config/active-venue';
import { listRuns, readRun } from '../navigation/run-storage';
import { exportRecording } from '../navigation/export-recording';
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
  const [comparison, setComparison] = useState<ReturnType<
    typeof diagnoseRecording
  > | null>(null);
  useEffect(() => {
    void listRuns()
      .then(setNames)
      .catch((e) => setError(String(e)));
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
            {selected.labels?.mode ?? 'walk'} ·{' '}
            {selected.labels?.pace ?? 'unlabelled pace'} · {diagnostics.steps}{' '}
            detected steps / {diagnostics.manualSteps ?? '?'} counted
          </Text>
          <Text selectable>
            {diagnostics.distanceMetres.toFixed(2)} m estimated · endpoint error{' '}
            {diagnostics.endpointErrorMetres?.toFixed(2) ?? 'not confirmed'} m
          </Text>
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
