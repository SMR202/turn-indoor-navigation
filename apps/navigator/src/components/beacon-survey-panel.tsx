import { useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { postJson } from '../lib/api';
import type { LayoutBeacon } from '../lib/beacon-layout';
import {
  fitSurvey,
  spotResult,
  SURVEY_SECONDS,
  type SurveyFit,
  type SurveySpot,
} from '../lib/beacon-survey';
import { load, save } from '../lib/storage';
import { useTheme } from '../theme';
import { Icon } from './icon';
import { Badge, Button, T } from './ui';

type Heard = {
  key: string;
  tag: string;
  alt: string[];
  median: number;
  count: number;
};

/**
 * Beacon test: stand under each placed beacon and record what this phone hears. Shows at once
 * whether that beacon is the strongest at its own spot (the property room-level positioning needs),
 * fits this building's radio model from all spots, and sends the results to the TURN server
 * (private LAN venues) for analysis on the computer.
 */
export function BeaconSurveyPanel({
  venueId,
  shared,
  beacons,
  listening,
  snapshot,
  onApply,
  onClose,
}: {
  venueId: string;
  /** Private LAN venue: results go to the TURN server too. */
  shared: boolean;
  /** Placed beacons of one floor. */
  beacons: LayoutBeacon[];
  listening: boolean;
  snapshot: (since: number) => Heard[];
  onApply: (fit: SurveyFit) => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const key = `beacon-survey-${venueId}-${Platform.OS}`;
  const [spots, setSpots] = useState<Record<string, SurveySpot>>(() =>
    load(key, {}),
  );
  const [rec, setRec] = useState<{
    tag: string;
    since: number;
    left: number;
  } | null>(null);
  const [sent, setSent] = useState<'idle' | 'sent' | 'failed'>('idle');
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const left = SURVEY_SECONDS - (performance.now() - rec.since) / 1000;
      if (left > 0) return setRec((r) => (r ? { ...r, left } : r));
      clearInterval(t);
      const heard = snapshot(rec.since);
      const readings: SurveySpot['readings'] = {};
      for (const b of beacons) {
        const d = heard
          .filter((h) => h.tag === b.tag || h.alt.includes(b.tag))
          .sort((x, y) => y.count - x.count)[0];
        if (d) readings[b.tag] = { median: d.median, count: d.count };
      }
      const spot: SurveySpot = {
        tag: rec.tag,
        at: new Date().toISOString(),
        seconds: SURVEY_SECONDS,
        readings,
      };
      setSpots((s) => {
        const next = { ...s, [rec.tag]: spot };
        save(key, next);
        return next;
      });
      setRec(null);
    }, 250);
    return () => clearInterval(t);
  }, [rec, snapshot, beacons, key]);

  const list = useMemo(
    () => beacons.filter((b) => spots[b.tag]).map((b) => spots[b.tag]!),
    [beacons, spots],
  );
  const fit = useMemo(() => fitSurvey(list, beacons), [list, beacons]);
  const results = list.map(spotResult);
  const passed = results.filter((r) => r.pass).length;

  // Every finished spot goes to the TURN server, so the setup can be analysed on the computer.
  useEffect(() => {
    if (!shared || list.length === 0) return;
    postJson(`/public/venues/${encodeURIComponent(venueId)}/beacon-survey`, {
      platform: `${Platform.OS} ${String(Platform.Version)}`.slice(0, 40),
      beacons: beacons.map((b) => ({
        tag: b.tag,
        x: b.x,
        y: b.y,
        ...(b.label ? { label: b.label } : {}),
      })),
      spots: list,
      fit,
    })
      .then(() => setSent('sent'))
      .catch(() => setSent('failed'));
  }, [list, fit, shared, venueId, beacons]);

  const name = (tag: string | null) =>
    beacons.find((b) => b.tag === tag)?.label ?? tag ?? '—';

  return (
    <View style={{ gap: 14 }}>
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          padding: 14,
          borderRadius: 16,
          backgroundColor: c.surface,
        }}
      >
        <Icon name="beacon" size={20} color={c.accent} />
        <View style={{ flex: 1, gap: 4 }}>
          <T v="callout" weight="600">
            Test your beacons
          </T>
          <T v="caption" color={c.textMuted}>
            Stand right under a beacon, phone at chest height and still, and
            record {SURVEY_SECONDS} seconds. Do every beacon. TURN checks that
            each one is the strongest at its own spot and measures how your
            walls weaken the signal.
          </T>
          {!listening && (
            <T v="caption" color={c.danger}>
              Bluetooth is not scanning yet.
            </T>
          )}
        </View>
      </View>
      <View
        style={{
          backgroundColor: c.surface,
          borderRadius: 18,
          overflow: 'hidden',
        }}
      >
        {beacons.map((b, i) => {
          const spot = spots[b.tag];
          const r = spot ? spotResult(spot) : null;
          const busy = rec?.tag === b.tag;
          return (
            <View
              key={b.tag}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: c.line,
              }}
            >
              <Badge
                icon={r ? (r.pass ? 'check' : 'close') : 'beacon'}
                color={r ? (r.pass ? c.success : c.danger) : c.textSubtle}
                size={34}
              />
              <View style={{ flex: 1, gap: 1 }}>
                <T v="callout" weight="600" lines={1}>
                  {b.label ?? b.tag}
                </T>
                <T v="caption" color={c.textMuted} lines={2}>
                  {busy
                    ? `Recording… ${Math.ceil(rec.left)} s, keep still`
                    : !r
                      ? 'Not tested'
                      : r.own === null
                        ? 'Not heard at its own spot: check power and mounting'
                        : r.pass
                          ? `Strongest here: ${Math.round(r.own)} dBm, ${r.marginDb! >= 99 ? 'only one heard' : `${Math.round(r.marginDb!)} dB clear`}`
                          : `${name(r.strongest)} is stronger here (${Math.round(r.strongestRssi!)} vs ${Math.round(r.own)} dBm)`}
                </T>
              </View>
              <Button
                label={busy ? '…' : r ? 'Again' : 'Record'}
                size="md"
                kind={r ? 'secondary' : 'primary'}
                disabled={rec !== null || !listening}
                onPress={() =>
                  setRec({
                    tag: b.tag,
                    since: performance.now(),
                    left: SURVEY_SECONDS,
                  })
                }
              />
            </View>
          );
        })}
      </View>
      {list.length > 0 && (
        <View
          style={{
            gap: 6,
            padding: 14,
            borderRadius: 16,
            backgroundColor: c.surface,
          }}
        >
          <T v="callout" weight="600">
            {passed} of {list.length} tested beacons are the strongest at their
            own spot
          </T>
          {fit ? (
            <>
              <T v="caption" color={c.textMuted}>
                Measured in your building: signals fall{' '}
                {(fit.exponent * 10).toFixed(0)} dB for every tenfold distance
                (open space: about 20), readings fit the model within ±
                {fit.rmsDb.toFixed(1)} dB.
              </T>
              <T v="caption" color={c.textMuted}>
                {beacons
                  .filter((b) => fit.references[b.tag] !== undefined)
                  .map(
                    (b) =>
                      `${b.label ?? b.tag}: ${Math.round(fit.references[b.tag]!)} dBm at 1 m${b.referenceRssi !== undefined ? ` (was ${Math.round(b.referenceRssi)})` : ''}`,
                  )
                  .join('\n')}
              </T>
              <Button
                label={
                  applied
                    ? 'Measured calibration in use'
                    : 'Use measured calibration'
                }
                icon={applied ? 'check' : undefined}
                kind={applied ? 'secondary' : 'primary'}
                disabled={applied}
                onPress={() => {
                  onApply(fit);
                  setApplied(true);
                }}
              />
            </>
          ) : (
            <T v="caption" color={c.textMuted}>
              Test at least three beacons to measure your building.
            </T>
          )}
          {shared && (
            <T v="micro" color={c.textSubtle}>
              {sent === 'sent'
                ? 'Results sent to the TURN server.'
                : sent === 'failed'
                  ? 'TURN server not reachable: results kept on this phone.'
                  : 'Sending results to the TURN server…'}
            </T>
          )}
        </View>
      )}
      <Button label="Done" kind="secondary" onPress={onClose} />
    </View>
  );
}
