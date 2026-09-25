import { NavigationEngine, recordingSchema } from './index';
import { parseVenuePackage } from '@turn/venue-model';
import { wrapAngle } from '@turn/pdr';
export function diagnoseRecording(input: unknown, fallbackVenue?: unknown) {
  const recording = recordingSchema.parse(input);
  const venue = parseVenuePackage(recording.venue ?? fallbackVenue);
  const engine = new NavigationEngine(
    venue,
    recording.sessionId,
    recording.stepLengthMetres,
  );
  const steps: {
    time: number;
    detectedAt: number;
    headingRad: number;
    x: number;
    y: number;
  }[] = [];
  let origin: { x: number; y: number } | null = null,
    alignment: number | null = null,
    previousSteps = 0;
  let failure: string | null = null;
  const trail: { x: number; y: number }[] = [];
  for (const o of recording.observations) {
    const before = engine.snapshot();
    const after = engine.consume(o);
    if (o.type === 'anchor' && after.pose) {
      origin = { ...after.pose.position };
      steps.length = 0;
      trail.length = 0;
      trail.push(origin);
      previousSteps = 0;
      failure = null;
      alignment = null;
    }
    if (o.type === 'heading-alignment') alignment = o.headingRad;
    if (after.stopped && !before.stopped && o.type !== 'capability')
      failure = after.message;
    if (after.steps > previousSteps && after.pose) {
      steps.push({
        time: after.lastStepAtSeconds ?? o.timestampSeconds,
        detectedAt: o.timestampSeconds,
        headingRad: after.pose.headingRad!,
        ...after.pose.position,
      });
      trail.push({ ...after.pose.position });
      previousSteps = after.steps;
    }
  }
  const timing = (type: 'accelerometer' | 'attitude') => {
    const stamps = recording.observations
      .filter((o) => o.type === type)
      .map((o) => o.timestampSeconds);
    const gaps = stamps.slice(1).map((t, i) => t - stamps[i]!);
    const sorted = gaps.filter((d) => d > 0).sort((a, b) => a - b);
    const median = sorted.length
      ? sorted[Math.floor(sorted.length / 2)]!
      : null;
    return {
      samples: stamps.length,
      hz: median ? 1 / median : null,
      maxGapSeconds: sorted.length ? sorted.at(-1)! : null,
      gapsOver100ms: gaps.filter((d) => d > 0.1).length,
      nonIncreasing: gaps.filter((d) => d <= 0).length,
    };
  };
  const final = engine.snapshot(),
    course = venue.testCourses.find((c) => c.id === recording.test?.courseId);
  const stationary = recording.labels?.mode === 'stationary';
  const completed = !!recording.test?.completedAtMarkedEndpoint;
  const expected = stationary
    ? origin
    : completed
      ? course?.points.at(-1)
      : null;
  const dx = final.pose && origin ? final.pose.position.x - origin.x : 0,
    dy = final.pose && origin ? final.pose.position.y - origin.y : 0;
  const deviations =
    alignment === null
      ? []
      : steps.map((s) => wrapAngle(s.headingRad - alignment));
  const meanHeadingDeviationDeg = deviations.length
    ? (Math.atan2(
        deviations.reduce((s, x) => s + Math.sin(x), 0),
        deviations.reduce((s, x) => s + Math.cos(x), 0),
      ) *
        180) /
      Math.PI
    : null;
  const intervals = steps.slice(1).map((s, i) => s.time - steps[i]!.time);
  const walkingSpanSeconds =
    steps.length > 1 ? steps.at(-1)!.time - steps[0]!.time : null;
  const lastTime = recording.observations.reduce(
    (max, o) => Math.max(max, o.timestampSeconds),
    0,
  );
  const manualSteps = recording.labels?.manualSteps ?? null;
  return {
    sessionId: recording.sessionId,
    algorithm: recording.algorithm,
    labels: recording.labels ?? null,
    platform: recording.metadata.platform,
    osVersion: recording.metadata.osVersion,
    stepLengthMetres: recording.stepLengthMetres,
    steps: final.steps,
    distanceMetres: final.distanceMetres,
    manualSteps,
    stepCountError: manualSteps === null ? null : final.steps - manualSteps,
    durationSeconds: lastTime,
    walkingSpanSeconds,
    cadenceStepsPerMinute: walkingSpanSeconds
      ? (60 * (steps.length - 1)) / walkingSpanSeconds
      : null,
    endpointErrorMetres:
      expected && final.pose
        ? Math.hypot(
            final.pose.position.x - expected.x,
            final.pose.position.y - expected.y,
          )
        : null,
    leftOffsetMetres:
      alignment === null
        ? null
        : -Math.sin(alignment) * dx + Math.cos(alignment) * dy,
    forwardMetres:
      alignment === null
        ? null
        : Math.cos(alignment) * dx + Math.sin(alignment) * dy,
    meanHeadingDeviationDeg,
    finalHeadingDeviationDeg:
      alignment === null || final.pose?.headingRad == null
        ? null
        : (wrapAngle(final.pose.headingRad - alignment) * 180) / Math.PI,
    minimumStepIntervalSeconds: intervals.length
      ? intervals.reduce((min, v) => Math.min(min, v), Infinity)
      : null,
    acceleration: timing('accelerometer'),
    attitude: timing('attitude'),
    completed,
    stationary,
    failure,
    stopReasons: recording.observations
      .filter((o) => o.type === 'capability' && o.status !== 'available')
      .map((o) => (o.type === 'capability' ? o.reason : '')),
    stepsDetail: steps,
    trail,
  };
}
