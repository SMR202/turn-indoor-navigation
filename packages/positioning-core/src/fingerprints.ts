import { z } from 'zod';

export const FINGERPRINT_REVISION = 'station-fingerprint-v1';
export const FINGERPRINT_MATCHER_REVISION = 'station-rank-v2' as const;
const matcherRevisionSchema = z.enum([
  'station-fingerprint-v1',
  FINGERPRINT_MATCHER_REVISION,
]);
export type FingerprintMatcherRevision = z.infer<typeof matcherRevisionSchema>;
const id = z.string().min(1).max(160);
const finite = z.number().finite();
const magneticSchema = z.object({
  t: finite.nonnegative(),
  x: finite,
  y: finite,
  z: finite,
});
const wifiSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  rssi: finite.min(-120).max(0),
  frequencyMHz: finite.positive(),
  ageSeconds: finite.min(0).max(10),
});
export const fingerprintCaptureSchema = z
  .object({
    id,
    createdAt: z.string().datetime(),
    platform: z.enum(['ios', 'android']),
    deviceProfile: id,
    durationSeconds: finite.min(5).max(30),
    magnetic: z.array(magneticSchema).min(30).max(2000),
    wifi: z.array(wifiSchema).max(100),
    wifiStatus: z.string().max(500),
  })
  .superRefine((c, ctx) => {
    if (
      c.magnetic.some(
        (s, i) =>
          s.t > c.durationSeconds + 1 || (i > 0 && s.t <= c.magnetic[i - 1]!.t),
      )
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Magnetic timestamps must increase within the capture.',
      });
    if (new Set(c.wifi.map((w) => w.id)).size !== c.wifi.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate Wi-Fi readings.' });
  });
export type FingerprintCapture = z.infer<typeof fingerprintCaptureSchema>;
const stationSchema = z.object({
  anchorId: id,
  nodeId: id,
  name: id,
  floorId: id,
  x: finite,
  y: finite,
  captures: z.array(fingerprintCaptureSchema).max(12),
});
export const fingerprintSurveySchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.literal(FINGERPRINT_REVISION),
    venueId: id,
    venueRevision: id,
    deviceProfile: id,
    stations: z.array(stationSchema).max(100),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.stations.map((p) => p.anchorId)).size !== s.stations.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate survey locations.' });
    const captures = s.stations.flatMap((p) => p.captures);
    if (
      new Set(captures.map((c) => c.id)).size !== captures.length ||
      captures.some((c) => c.deviceProfile !== s.deviceProfile)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Captures must be unique and belong to this device profile.',
      });
  });
export type FingerprintSurvey = z.infer<typeof fingerprintSurveySchema>;
export type FingerprintMatch = {
  status: 'candidate' | 'ambiguous' | 'unavailable';
  reason: string;
  anchorId: string | null;
  method: 'magnetic' | 'magnetic-wifi';
  confidence: 'clear' | 'tentative' | 'low' | 'unavailable';
  radioReason: string;
  scores: { anchorId: string; score: number; commonRadios: number }[];
};
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
export function magneticFeatures(capture: FingerprintCapture) {
  const values = capture.magnetic.map((s) => Math.hypot(s.x, s.y, s.z));
  const strength = median(values);
  const spread = median(values.map((v) => Math.abs(v - strength))) * 1.4826;
  const span = capture.magnetic.at(-1)!.t - capture.magnetic[0]!.t;
  return {
    strength,
    spread,
    usable: span >= 5 && strength >= 10 && strength <= 2000 && spread <= 8,
  };
}

/** Pure shared matcher. Test labels, route preference and PDR never enter scoring. */
export function matchFingerprint(
  survey: FingerprintSurvey,
  query: FingerprintCapture,
  revision: FingerprintMatcherRevision = FINGERPRINT_MATCHER_REVISION,
): FingerprintMatch {
  const unavailable = (reason: string): FingerprintMatch => ({
    status: 'unavailable',
    reason,
    anchorId: null,
    method: 'magnetic',
    confidence: 'unavailable',
    radioReason: 'Signal comparison unavailable.',
    scores: [],
  });
  if (survey.deviceProfile !== query.deviceProfile)
    return unavailable(
      'Survey this phone separately; cross-device calibration is not validated.',
    );
  if (survey.stations.some((s) => s.captures.some((c) => c.id === query.id)))
    return unavailable('A survey capture cannot also be its own test.');
  const ready = survey.stations.filter((s) => s.captures.length >= 2);
  if (ready.length < 3)
    return unavailable(
      'Record two passes at three or more known places before testing.',
    );
  const q = magneticFeatures(query);
  if (!q.usable)
    return unavailable(
      'Magnetic readings were unstable or too sparse. Hold still and retry away from magnetic accessories.',
    );
  const scores = ready.map((s) => {
    const features = s.captures.map(magneticFeatures).filter((f) => f.usable);
    if (features.length < 2)
      return { anchorId: s.anchorId, score: 999, commonRadios: 0 };
    const centre = median(features.map((f) => f.strength));
    const deviations = features.map((f) => Math.abs(f.strength - centre));
    const variation =
      revision === 'station-fingerprint-v1'
        ? Math.max(2, ...deviations, q.spread)
        : Math.max(
            0.5,
            2 * 1.4826 * median(deviations),
            2 * median(features.map((f) => f.spread)),
            2 * q.spread,
          );
    // Repeated surveys must agree; broad/noisy signatures are not made artificially attractive.
    if (variation > 8 || Math.max(...deviations) > 8)
      return { anchorId: s.anchorId, score: 999, commonRadios: 0 };
    const magScore = Math.abs(q.strength - centre) / variation;
    const ids = [
      ...new Set(s.captures.flatMap((c) => c.wifi.map((w) => w.id))),
    ];
    const reference = ids.flatMap((radioId) => {
      const readings = s.captures.flatMap((c) =>
        c.wifi.filter((w) => w.id === radioId),
      );
      return readings.length >= 2
        ? [{ id: radioId, rssi: median(readings.map((r) => r.rssi)) }]
        : [];
    });
    const common = query.wifi.flatMap((w) => {
      const r = reference.find((v) => v.id === w.id);
      return r ? [Math.abs(w.rssi - r.rssi)] : [];
    });
    const overlap =
      common.length / Math.max(1, reference.length, query.wifi.length);
    const radioScore =
      common.length >= 3 ? median(common) / 6 + (1 - overlap) * 2 : null;
    return {
      anchorId: s.anchorId,
      score: magScore,
      commonRadios: common.length,
      radioScore,
    };
  });
  // Use the same feature space for every candidate; never favour a station merely missing radio data.
  if (scores.filter((s) => s.score < 999).length < 3)
    return unavailable(
      'At least three places need stable, repeatable survey readings. Record those places again.',
    );
  const useWifi =
    query.wifi.length >= 3 &&
    scores.every(
      (s) => 'radioScore' in s && s.radioScore !== null && s.score < 999,
    );
  const ranked = scores
    .map((s) => ({
      anchorId: s.anchorId,
      score:
        useWifi && 'radioScore' in s
          ? s.score * 0.4 + s.radioScore! * 0.6
          : s.score,
      commonRadios: s.commonRadios,
    }))
    .sort((a, b) => a.score - b.score);
  const best = ranked[0]!;
  const margin = ranked[1]!.score - best.score;
  const candidate = best.score <= 2 && margin >= 1.25;
  const confidence = candidate
    ? 'clear'
    : best.score <= 3 && margin >= 0.35
      ? 'tentative'
      : 'low';
  const missingRadio = scores
    .filter((s) => s.commonRadios < 3)
    .map((s) => survey.stations.find((p) => p.anchorId === s.anchorId)!.name);
  return {
    status: candidate ? 'candidate' : 'ambiguous',
    reason: candidate
      ? 'Possible known place. Confirm against your surroundings before using it.'
      : 'Signals do not distinguish a known place confidently. Your location has not changed.',
    anchorId: candidate ? best.anchorId : null,
    method: useWifi ? 'magnetic-wifi' : 'magnetic',
    confidence,
    radioReason: useWifi
      ? 'Fresh Wi-Fi and repeated radio references contributed to every place comparison.'
      : query.wifi.length === 0
        ? query.wifiStatus
        : `Wi-Fi was captured but not used: ${query.wifi.length < 3 ? 'the new reading has fewer than three radios' : missingRadio.length ? `${missingRadio.join(', ')} lack three matching, repeatedly observed radios` : 'some survey readings are unstable'}. Record another circuit with Wi-Fi enabled; magnetic ranking is shown meanwhile.`,
    scores: ranked,
  };
}

export const fingerprintRecordSchema = z
  .object({
    kind: z.literal('fingerprint'),
    schemaVersion: z.literal(1),
    sessionId: id,
    matcherRevision: matcherRevisionSchema.optional(),
    survey: fingerprintSurveySchema,
    test: fingerprintCaptureSchema.optional(),
    actualAnchorId: id.optional(),
  })
  .superRefine((r, ctx) => {
    if (
      r.actualAnchorId &&
      (!r.test ||
        !r.survey.stations.some((s) => s.anchorId === r.actualAnchorId))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Test label must reference a surveyed place.',
      });
    if (
      r.test &&
      (r.test.deviceProfile !== r.survey.deviceProfile ||
        r.survey.stations.some((s) =>
          s.captures.some((c) => c.id === r.test!.id),
        ))
    )
      ctx.addIssue({
        code: 'custom',
        message:
          'Test must be independent of the survey and use its device profile.',
      });
  });
export type FingerprintRecord = z.infer<typeof fingerprintRecordSchema>;
export function evaluateFingerprint(record: FingerprintRecord) {
  if (!record.test) return null;
  // Missing revision identifies historical records; never silently rescore them.
  const match = matchFingerprint(
    record.survey,
    record.test,
    record.matcherRevision ?? 'station-fingerprint-v1',
  );
  const expected = record.survey.stations.find(
    (s) => s.anchorId === record.actualAnchorId,
  );
  const found = record.survey.stations.find(
    (s) => s.anchorId === match.anchorId,
  );
  return {
    match,
    correct: expected ? match.anchorId === expected.anchorId : null,
    errorMetres:
      expected && found && expected.floorId === found.floorId
        ? Math.hypot(expected.x - found.x, expected.y - found.y)
        : null,
  };
}

export const fingerprintFixSchema = z.object({
  source: z.literal('user-confirmed-fingerprint'),
  fingerprintSessionId: id,
  matcherRevision: matcherRevisionSchema,
  anchorId: id,
  confidence: z.enum(['clear', 'tentative']),
  confirmedAt: z.string().datetime(),
  previousSessionId: id.optional(),
  previousPosition: z.object({ floorId: id, x: finite, y: finite }).optional(),
});

/** Confirmation is a physical user assertion, never automatic pose fusion. */
export function confirmFingerprintLocation(
  record: FingerprintRecord,
  context: {
    venueId: string;
    venueRevision: string;
    deviceProfile: string;
    anchorId: string;
    now: number;
  },
): z.infer<typeof fingerprintFixSchema> {
  const r = fingerprintRecordSchema.parse(record);
  const age = r.test ? context.now - Date.parse(r.test.createdAt) : Infinity;
  const match = evaluateFingerprint(r)?.match;
  if (
    r.survey.venueId !== context.venueId ||
    r.survey.venueRevision !== context.venueRevision ||
    r.survey.deviceProfile !== context.deviceProfile ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 120000 ||
    r.actualAnchorId !== context.anchorId ||
    match?.scores[0]?.anchorId !== context.anchorId ||
    (match.confidence !== 'clear' && match.confidence !== 'tentative')
  ) {
    throw new Error(
      'Find your place again, then confirm the suggested spot against your surroundings within two minutes.',
    );
  }
  return {
    source: 'user-confirmed-fingerprint',
    fingerprintSessionId: r.sessionId,
    matcherRevision: r.matcherRevision ?? 'station-fingerprint-v1',
    anchorId: context.anchorId,
    confidence: match.confidence,
    confirmedAt: new Date(context.now).toISOString(),
  };
}
