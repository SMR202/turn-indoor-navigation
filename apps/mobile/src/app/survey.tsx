import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  FINGERPRINT_REVISION,
  evaluateFingerprint,
  magneticFeatures,
  type FingerprintRecord,
  type FingerprintSurvey,
} from '@turn/positioning-core';
import { activeVenue as venue } from '../config/active-venue';
import { Action, Notice, Section, dataFont, theme, ui } from '../components/ui';
import { FloorMap } from '../components/floor-map';
import {
  captureFingerprint,
  wifiBuildAvailable,
} from '../fingerprinting/capture';
import {
  fingerprintProfile,
  loadFingerprintRecords,
  loadSurvey,
  saveFingerprintRecord,
  saveSurvey,
} from '../fingerprinting/storage';
import { sendRun } from '../navigation/send-runs';
import { exportRecording } from '../navigation/export-recording';

export default function Survey() {
  const [survey, setSurvey] = useState<FingerprintSurvey | null>(null);
  const [mode, setMode] = useState<'survey' | 'test'>('survey');
  const [selected, setSelected] = useState(venue.anchors[0]?.id ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [enableWifi, setEnableWifi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [record, setRecord] = useState<FingerprintRecord | null>(null);
  const [saved, setSaved] = useState<FingerprintRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(5);
  const abort = useRef<AbortController | null>(null);
  const focused = useRef(false);
  const captureLock = useRef(false);
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : String(e));
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setBusy(captureLock.current);
      try {
        const deviceProfile = fingerprintProfile();
        setSurvey(
          loadSurvey(venue.venueId, venue.revision) ?? {
            schemaVersion: 1,
            revision: FINGERPRINT_REVISION,
            venueId: venue.venueId,
            venueRevision: venue.revision,
            deviceProfile,
            stations: [],
          },
        );
        setSaved(
          loadFingerprintRecords().filter(
            (r) =>
              r.survey.venueId === venue.venueId &&
              r.survey.venueRevision === venue.revision,
          ),
        );
      } catch (e) {
        report(e);
      }
      return () => {
        focused.current = false;
        abort.current?.abort();
      };
    }, []),
  );
  const station = survey?.stations.find((s) => s.anchorId === selected);
  const anchor = venue.anchors.find((a) => a.id === selected);
  const ready =
    survey?.stations.filter((s) => s.captures.length >= 2).length ?? 0;
  const result = useMemo(
    () => (record ? evaluateFingerprint(record) : null),
    [record],
  );
  const matched = result?.match.anchorId
    ? venue.anchors.find((a) => a.id === result.match.anchorId)
    : null;
  const point = venue.nodes.find((n) => n.id === anchor?.nodeId);
  function persist(r: FingerprintRecord) {
    saveFingerprintRecord(r);
    setRecord(r);
    setSaved(
      loadFingerprintRecords().filter(
        (v) =>
          v.survey.venueId === venue.venueId &&
          v.survey.venueRevision === venue.revision,
      ),
    );
  }
  async function capture() {
    if (
      !survey ||
      captureLock.current ||
      (mode === 'survey' && (!confirmed || !anchor || !point))
    )
      return;
    captureLock.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setSeconds(0);
    setError('');
    setMessage('');
    setRecord(null);
    try {
      const sample = await captureFingerprint(
        survey.deviceProfile,
        enableWifi,
        controller.signal,
        setSeconds,
      );
      if (!focused.current || controller.signal.aborted) return;
      if (!magneticFeatures(sample).usable)
        throw new Error(
          'Signals varied too much. Hold the phone still, remove magnetic accessories and retry. Nothing was added.',
        );
      let next = survey;
      if (mode === 'survey' && anchor && point) {
        if ((station?.captures.length ?? 0) >= 12)
          throw new Error(
            'This location already has 12 passes. Test the existing survey.',
          );
        const updated = {
          anchorId: anchor.id,
          nodeId: point.id,
          name: anchor.label,
          floorId: point.floorId,
          x: point.x,
          y: point.y,
          captures: [...(station?.captures ?? []), sample],
        };
        next = {
          ...survey,
          stations: [
            ...survey.stations.filter((s) => s.anchorId !== anchor.id),
            updated,
          ],
        };
        saveSurvey(next);
        setSurvey(next);
        setConfirmed(false);
      }
      const r: FingerprintRecord = {
        kind: 'fingerprint',
        schemaVersion: 1,
        sessionId: `fingerprint-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        survey: next,
        ...(mode === 'test' ? { test: sample } : {}),
      };
      persist(r);
      setMessage(
        mode === 'survey'
          ? `Pass saved at ${anchor!.label}. ${sample.wifiStatus}.`
          : `Independent test saved. ${sample.wifiStatus}.`,
      );
    } catch (e) {
      if (focused.current) report(e);
    } finally {
      captureLock.current = false;
      if (focused.current) setBusy(false);
    }
  }
  async function sendAll() {
    if (sending) return;
    setSending(true);
    setError('');
    try {
      for (let i = 0; i < saved.length; i++) {
        setMessage(`Sending ${i + 1} of ${saved.length} records…`);
        await sendRun(saved[i]!);
      }
      setMessage(
        `${saved.length} records confirmed on your computer. Tell Codex to check the fingerprint tests.`,
      );
    } catch (e) {
      report(e);
    } finally {
      setSending(false);
    }
  }
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={ui.page}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 6 }}>
        <Text style={ui.eyebrow}>VENUE SIGNALS</Text>
        <Text style={ui.title}>Teach TURN a place.</Text>
        <Text style={ui.body}>
          Survey known spots, then find them again with your phone’s sensors.
        </Text>
      </View>
      <View
        style={{
          ...ui.card,
          backgroundColor: theme.ink,
          borderColor: theme.ink,
        }}
      >
        <Text style={{ ...ui.eyebrow, color: '#B6CDFF' }}>{venue.name}</Text>
        <View style={{ ...ui.row, justifyContent: 'space-between' }}>
          <Text
            style={{
              color: 'white',
              fontSize: 40,
              fontWeight: '700',
              fontFamily: dataFont,
            }}
          >
            {ready}
            <Text style={{ fontSize: 19, color: '#B6CDFF' }}>
              {' '}
              / {venue.anchors.length}
            </Text>
          </Text>
          <Text style={{ color: 'white', fontSize: 15 }}>
            places with{'\n'}two survey passes
          </Text>
        </View>
        <Text style={{ color: '#D4E0EF', lineHeight: 21 }}>
          Collect at least 3 places on this phone. Return for the second pass
          rather than recording twice without moving.
        </Text>
      </View>
      <View style={ui.row}>
        <View style={{ flex: 1 }}>
          <Action
            title="1 · Survey"
            selected={mode === 'survey'}
            disabled={busy}
            onPress={() => {
              setMode('survey');
              setRecord(null);
              setConfirmed(false);
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Action
            title="2 · Find my place"
            selected={mode === 'test'}
            disabled={busy}
            onPress={() => {
              setMode('test');
              setRecord(null);
            }}
          />
        </View>
      </View>
      {error ? <Notice error>{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      <View style={ui.card}>
        <Text style={ui.heading}>
          {mode === 'survey'
            ? 'Choose where you are standing'
            : 'Let the signals choose'}
        </Text>
        {mode === 'survey' ? (
          <>
            <Text style={ui.body}>
              Use a clearly marked, repeatable spot. Confirm the map position
              against the actual building.
            </Text>
            {venue.anchors.map((a) => (
              <Action
                key={a.id}
                title={`${a.label} · ${survey?.stations.find((s) => s.anchorId === a.id)?.captures.length ?? 0} passes`}
                selected={selected === a.id}
                disabled={busy}
                onPress={() => {
                  setSelected(a.id);
                  setConfirmed(false);
                }}
              />
            ))}
            {point && (
              <FloorMap
                venue={venue}
                floorId={point.floorId}
                course={[point]}
                compact
              />
            )}
            <Action
              title={
                confirmed
                  ? '✓ I am at this exact spot'
                  : 'I am at this exact spot'
              }
              selected={confirmed}
              disabled={busy}
              onPress={() => setConfirmed(!confirmed)}
            />
          </>
        ) : (
          <Text style={ui.body}>
            Stand at a surveyed spot without selecting its name. Capture a fresh
            reading; label your actual location afterwards to measure the
            result.
          </Text>
        )}
        {Platform.OS === 'android' && (
          <Action
            title={
              enableWifi ? '✓ Include Wi-Fi signals' : 'Include Wi-Fi signals'
            }
            selected={enableWifi}
            disabled={busy || !wifiBuildAvailable}
            onPress={() => setEnableWifi(!enableWifi)}
          />
        )}
        <Text style={ui.body}>
          {Platform.OS === 'android'
            ? wifiBuildAvailable
              ? 'Wi-Fi needs precise location permission and phone Location services. Android may limit scans; wait two minutes if asked. Network names are not saved.'
              : 'Magnetic capture is available. Install TURN build 3 to add Wi-Fi scanning.'
            : Platform.OS === 'ios'
              ? 'Magnetic capture on iPhone. Wi-Fi scanning is not available through the iOS app.'
              : 'Use the phone QR to capture real signals. Browser preview has no simulated sensor data.'}
        </Text>
        {busy && (
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 8, now: Math.floor(seconds) }}
            style={{ gap: 8 }}
          >
            <View
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.tint,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: 8,
                  width: `${Math.min(100, (seconds / 8) * 100)}%`,
                  backgroundColor: theme.primary,
                }}
              />
            </View>
            <Text style={ui.body}>
              {seconds < 8
                ? `Hold still · ${Math.max(0, 8 - Math.floor(seconds))} seconds`
                : 'Magnetic capture complete · waiting for Wi-Fi result…'}
            </Text>
          </View>
        )}
        <Action
          title={
            busy
              ? 'Recording signals…'
              : mode === 'survey'
                ? 'Record an 8-second pass'
                : 'Find my place'
          }
          primary
          busy={busy}
          disabled={
            !survey ||
            Platform.OS === 'web' ||
            (mode === 'survey'
              ? !confirmed || (station?.captures.length ?? 0) >= 12
              : ready < 3)
          }
          onPress={() => void capture()}
        />
        {busy && (
          <Action
            title="Cancel capture"
            onPress={() => abort.current?.abort()}
          />
        )}
        {mode === 'test' && ready < 3 && (
          <Text style={ui.body}>
            Finish two passes at three places to unlock testing.
          </Text>
        )}
      </View>
      {record?.test && result && (
        <View style={ui.card}>
          <Text style={ui.eyebrow}>
            {result.match.method === 'magnetic-wifi'
              ? 'MAGNETIC + WI-FI'
              : 'MAGNETIC MATCH'}
          </Text>
          <Text style={ui.heading}>
            {matched ? `Possible match: ${matched.label}` : 'Not sure yet'}
          </Text>
          <Text style={ui.body}>{result.match.reason}</Text>
          <Text style={ui.heading}>Where were you actually standing?</Text>
          {record.survey.stations.map((s) => (
            <Action
              key={s.anchorId}
              title={s.name}
              selected={record.actualAnchorId === s.anchorId}
              onPress={() => {
                try {
                  persist({ ...record, actualAnchorId: s.anchorId });
                } catch (e) {
                  report(e);
                }
              }}
            />
          ))}
          {record.actualAnchorId && (
            <Notice>
              {matched
                ? result.correct
                  ? 'Correct place. This test is saved separately from the survey.'
                  : `Different place. ${result.errorMetres?.toFixed(1) ?? 'Unknown'} m between map points; this failure is saved for diagnosis.`
                : 'No place identified. This abstention is saved; it is not counted as a correct match.'}
            </Notice>
          )}
          {matched && record.actualAnchorId === matched.id && (
            <Action
              title="Confirm this location & navigate"
              primary
              onPress={() =>
                router.navigate({
                  pathname: '/',
                  params: {
                    fingerprintAnchor: matched.id,
                    fingerprintRecord: record.sessionId,
                  },
                })
              }
            />
          )}
          <Text style={ui.body}>
            This test recognizes surveyed spots. It does not continuously track
            between them. Confirming a place resets navigation there; direction
            still needs alignment.
          </Text>
        </View>
      )}
      <Section title={`Saved survey & tests · ${saved.length}`} initiallyOpen>
        <Text style={ui.body}>
          Stored on this phone. Send the records when you want them analysed;
          uploads include the survey needed to replay each test.
        </Text>
        <Action
          title={sending ? 'Sending records…' : 'Send all to computer'}
          primary
          busy={sending}
          disabled={saved.length === 0 || busy}
          onPress={() => void sendAll()}
        />
        {saved.slice(0, historyLimit).map((r) => (
          <View
            key={r.sessionId}
            style={{
              gap: 8,
              borderTopWidth: 1,
              borderColor: theme.border,
              paddingTop: 12,
            }}
          >
            <Text style={ui.body}>
              {r.test ? 'Recognition test' : 'Survey snapshot'} ·{' '}
              {r.test?.createdAt
                ? new Date(r.test.createdAt).toLocaleString()
                : `${r.survey.stations.reduce((n, s) => n + s.captures.length, 0)} passes`}
            </Text>
            {r.test && (
              <Action
                title="Review & label test"
                disabled={busy}
                onPress={() => {
                  setMode('test');
                  setRecord(r);
                }}
              />
            )}
            <Action
              title="Share file"
              disabled={busy}
              onPress={() => void exportRecording(r).catch(report)}
            />
          </View>
        ))}
        {saved.length > historyLimit && (
          <Action
            title="Show more records"
            onPress={() => setHistoryLimit((v) => v + 5)}
          />
        )}
      </Section>
      <Section title="How to get a useful survey">
        <Text style={ui.body}>
          1. Mark at least three known places on the floor. Use the same spots
          every time.{'\n\n'}2. Hold the phone naturally at the same height.
          Keep keys and magnetic accessories away. Record one pass at each
          place, then repeat the route.{'\n\n'}3. Switch to Find my place.
          Return to each spot and capture without choosing a name. Label the
          real place afterwards—even when the result is wrong.{'\n\n'}4. Survey
          each phone separately. A good result on one phone does not establish
          cross-device accuracy.
        </Text>
      </Section>
    </ScrollView>
  );
}
