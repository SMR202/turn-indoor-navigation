import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeVenue as venue } from '../config/active-venue';
import { calculateRoute } from '@turn/routing';
import {
  anchorPayload,
  evaluateWalk,
  type Recording,
} from '@turn/positioning-core';
import { calibratedStepLength, wrapAngle } from '@turn/pdr';
import { pathLength } from '@turn/venue-model';
import { FloorMap } from '../components/floor-map';
import { AnchorScanner } from '../components/anchor-scanner';
import { useNavigationSession } from '../navigation/use-navigation-session';
import { exportRecording } from '../navigation/export-recording';
import { saveRun } from '../navigation/run-storage';
import { RunHistory } from '../components/run-history';
import {
  loadCalibration,
  saveCalibration,
  clearCalibration,
} from '../navigation/calibration-storage';

const ink = '#183d34',
  muted = '#617369';
function Action({
  title,
  onPress,
  disabled = false,
  primary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        padding: 14,
        backgroundColor: disabled ? '#e0e5df' : primary ? ink : '#e7efe6',
        borderRadius: 12,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: primary && !disabled ? 'white' : ink,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export default function Home() {
  const session = useNavigationSession();
  const insets = useSafeAreaInsets();
  const [courseId, setCourseId] = useState<string | null>(
    venue.testCourses[0]?.id ?? null,
  );
  const course = venue.testCourses.find((c) => c.id === courseId);
  const [destination, setDestination] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>();
  const [scanning, setScanning] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [stepLength, setStepLength] = useState<number | null>(null),
    [showCalibration, setShowCalibration] = useState(false);
  const [distance, setDistance] = useState('5'),
    [count, setCount] = useState('');
  const [heading, setHeading] = useState(Math.PI / 2),
    [lastAnchor, setLastAnchor] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false),
    [marked, setMarked] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof evaluateWalk> | null>(
    null,
  );
  const [mode, setMode] = useState<'walk' | 'stationary'>('walk');
  const [pace, setPace] =
    useState<NonNullable<Recording['labels']>['pace']>('normal');
  const [manualSteps, setManualSteps] = useState('');
  const [notes, setNotes] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const [savedMessage, setSavedMessage] = useState('');
  const busy = session.running || session.starting;
  const pose = session.snapshot.pose;
  const room = venue.floors[0]!.rooms.find((r) => r.id === selectedRoom);
  const poi = venue.pois.find((p) => p.id === destination);
  const routing =
    poi && session.anchorNodeId
      ? calculateRoute(venue, session.anchorNodeId, poi.nodeId)
      : null;
  const route = routing?.status === 'ok' ? routing.route : undefined;
  const report = (e: unknown) =>
    setError(e instanceof Error ? e.message : 'Action failed');
  useEffect(() => {
    void loadCalibration().then((value) => {
      setStepLength(value);
      setShowCalibration(value === null);
    });
  }, []);
  const runId = session.getRecording()?.sessionId;
  useEffect(() => {
    if (!session.snapshot.stopped) return;
    const recording = session.getRecording();
    if (!recording?.observations.some((o) => o.type === 'accelerometer'))
      return;
    try {
      saveRun(recording);
      setSavedMessage(
        'Saved on this device. Add your actual count below, then save the details.',
      );
      setHistoryRevision((v) => v + 1);
    } catch (e) {
      report(e);
      setSavedMessage('Save failed. Share this run before resetting.');
    }
  }, [session.snapshot.stopped, runId]);
  const attachLabels = () => {
    const recording = session.getRecording();
    if (!recording) return;
    const actual =
      mode === 'stationary'
        ? 0
        : manualSteps.trim() === ''
          ? null
          : Number(manualSteps);
    if (
      actual !== null &&
      (!Number.isInteger(actual) || actual < 0 || actual > 10000)
    )
      throw new Error(
        'Enter a whole count for this run, or leave it blank if unknown.',
      );
    recording.labels = {
      mode,
      pace: mode === 'stationary' ? 'unspecified' : pace,
      manualSteps: actual,
      phoneModel: '',
      notes,
    };
  };
  const establish = (payload: string) => {
    const previous = session.getRecording();
    if (previous?.observations.some((o) => o.type === 'accelerometer'))
      saveRun(previous);
    session.anchor(payload, stepLength ?? 0.7);
    setLastAnchor(payload);
    setScanning(false);
    setError(null);
    setResult(null);
    setManualSteps('');
    setNotes('');
    setSavedMessage('');
  };
  const reset = () => {
    try {
      if (course) {
        establish(anchorPayload(venue, course.anchorId));
        setHeading(course.headingRad);
      } else if (lastAnchor) establish(lastAnchor);
    } catch (e) {
      report(e);
    }
  };
  const chooseCourse = (id: string) => {
    setCourseId(id);
    setMarked(false);
    setResult(null);
    setDestination(null);
    setError(null);
    const next = venue.testCourses.find((c) => c.id === id)!;
    setHeading(next.headingRad);
    session.stop('Test changed. Stand at its start and set your position.');
    setLastAnchor(null);
  };
  const courseReady =
    !course ||
    (!!lastAnchor && JSON.parse(lastAnchor).anchorId === course.anchorId);
  const finish = () => {
    try {
      const recording = session.getRecording();
      attachLabels();
      if (recording && course)
        recording.test = {
          courseId: course.id,
          completedAtMarkedEndpoint:
            mode === 'walk' && !session.getSnapshot().stopped,
        };
      if (course && mode === 'walk')
        setResult(evaluateWalk(session.getSnapshot(), course.points));
      session.stop(
        'Test finished. Review the saved run or return to the start to repeat.',
      );
    } catch (e) {
      report(e);
    }
  };
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: '#f4f5ef' }}
      contentContainerStyle={{
        padding: 18,
        paddingBottom: Math.max(insets.bottom, 24),
        gap: 16,
        width: '100%',
        maxWidth: 850,
        alignSelf: 'center',
      }}
    >
      <View style={{ gap: 5 }}>
        <Text
          style={{
            fontSize: 12,
            color: '#49745c',
            fontWeight: '700',
            letterSpacing: 2,
          }}
        >
          TURN / WALK TEST
        </Text>
        <Text style={{ fontSize: 29, fontWeight: '700', color: ink }}>
          {venue.name}
        </Text>
        <Text style={{ color: muted }}>
          SDK 57 ·{' '}
          {venue.provenance.kind === 'plan-derived'
            ? 'Scaled from your plan · dimensions in feet & metres'
            : 'Development venue'}
        </Text>
      </View>
      {error && (
        <Text accessibilityRole="alert" selectable style={{ color: '#9c3328' }}>
          {error}
        </Text>
      )}
      {venue.testCourses.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '600', color: ink }}>
            Choose a short walk
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {venue.testCourses.map((c) => (
              <Action
                key={c.id}
                title={`${courseId === c.id ? '✓ ' : ''}${c.name}`}
                disabled={busy}
                onPress={() => chooseCourse(c.id)}
              />
            ))}
          </View>
        </View>
      )}
      <View style={{ gap: 8 }}>
        <Text style={{ fontWeight: '700', color: ink }}>Test mode & pace</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {(['walk', 'stationary'] as const).map((value) => (
            <Action
              key={value}
              title={`${mode === value ? '✓ ' : ''}${value === 'walk' ? 'Measured walk' : 'Stand still · 20 s'}`}
              disabled={busy}
              onPress={() => {
                setMode(value);
                setResult(null);
                reset();
              }}
            />
          ))}
        </View>
        {mode === 'walk' && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['normal', 'brisk', 'slow'] as const).map((value) => (
              <Action
                key={value}
                title={`${pace === value ? '✓ ' : ''}${value}`}
                disabled={busy || session.snapshot.stopped}
                onPress={() => setPace(value)}
              />
            ))}
          </View>
        )}
        <Text style={{ color: muted }}>
          {mode === 'stationary'
            ? 'Remain still for 20 seconds after the countdown. Expected steps: zero.'
            : 'Keep one calibration for comparison walks. Count every footfall; enter the actual count after finishing.'}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: 'white',
          borderRadius: 18,
          padding: 16,
          gap: 12,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {[
            [String(session.snapshot.steps), 'steps'],
            [`${session.snapshot.distanceMetres.toFixed(2)} m`, 'walked'],
            [
              mode === 'stationary'
                ? '0 m'
                : course
                  ? `${pathLength(course.points).toFixed(0)} m`
                  : '—',
              'planned',
            ],
          ].map(([value, label]) => (
            <View key={label}>
              <Text style={{ fontSize: 25, fontWeight: '700', color: ink }}>
                {value}
              </Text>
              <Text style={{ fontSize: 12, color: muted }}>{label}</Text>
            </View>
          ))}
        </View>
        <Text
          selectable
          accessibilityLiveRegion="polite"
          style={{ color: muted }}
        >
          {session.snapshot.message}
        </Text>
        {busy && (
          <Text
            accessibilityLiveRegion="polite"
            style={{ fontSize: 22, fontWeight: '700', color: ink }}
          >
            {session.starting
              ? 'Starting sensors…'
              : session.settling > 0
                ? `Hold still & point along the path · ${session.settling}`
                : mode === 'stationary'
                  ? `Stay still · ${Math.floor(session.activeSeconds)} / 20 s`
                  : 'Walk now'}
          </Text>
        )}
        {busy && (
          <Text>
            Heading from start:{' '}
            {pose?.headingRad == null
              ? '—'
              : `${((wrapAngle(pose.headingRad - heading) * 180) / Math.PI).toFixed(1)}°`}{' '}
            · {session.elapsed.toFixed(1)} s
          </Text>
        )}
        {busy ? (
          <>
            <Action
              title={
                session.starting
                  ? 'Starting sensors…'
                  : session.settling > 0
                    ? 'Wait for the countdown'
                    : mode === 'stationary'
                      ? 'Finish stationary test'
                      : 'Finish at the end mark'
              }
              disabled={
                session.starting ||
                session.settling > 0 ||
                (mode === 'stationary' && session.activeSeconds < 20)
              }
              primary
              onPress={finish}
            />
            <Action
              title="Stop / interrupted walk"
              onPress={() =>
                session.stop(
                  'Walk interrupted. Save for diagnosis or return to start.',
                )
              }
            />
          </>
        ) : (
          <>
            <Action
              title={
                course
                  ? 'I’m at the start · set position'
                  : 'Reset to known start'
              }
              disabled={(!course && !lastAnchor) || scanning}
              onPress={reset}
            />
            <Action
              title={
                mode === 'stationary' ? 'Start stationary test' : 'Start walk'
              }
              primary
              disabled={
                !pose ||
                (mode === 'walk' && !stepLength) ||
                !courseReady ||
                session.snapshot.stopped ||
                scanning ||
                (mode === 'walk' && !!course && !marked)
              }
              onPress={() => {
                setError(null);
                setResult(null);
                const recording = session.getRecording();
                if (recording && course)
                  recording.test = {
                    courseId: course.id,
                    completedAtMarkedEndpoint: false,
                  };
                try {
                  attachLabels();
                  void session.start(heading).catch(report);
                } catch (e) {
                  report(e);
                }
              }}
            />
            {!stepLength && mode === 'walk' && (
              <Text style={{ color: '#9b6122' }}>
                One-time step calibration is required below. It will be saved on
                this phone.
              </Text>
            )}
          </>
        )}
        {result && (
          <View
            style={{
              padding: 12,
              backgroundColor: '#eef4ed',
              borderRadius: 10,
              gap: 5,
            }}
          >
            <Text style={{ fontWeight: '700', color: ink }}>This walk</Text>
            <Text selectable>
              Endpoint error: {result.endpointErrorMetres.toFixed(2)} m
            </Text>
            <Text selectable>
              Distance error: {result.distanceErrorPercent >= 0 ? '+' : ''}
              {result.distanceErrorPercent.toFixed(1)}% · {result.steps} steps
            </Text>
            <Text style={{ fontSize: 12, color: muted }}>
              {result.interrupted
                ? 'Tracking was interrupted; this is not a completed accuracy trial.'
                : 'Compared with the end mark you confirmed. One walk does not establish overall accuracy.'}
            </Text>
          </View>
        )}
        {savedMessage && (
          <Text accessibilityLiveRegion="polite" style={{ color: ink }}>
            {savedMessage}
          </Text>
        )}
        {session.snapshot.stopped && pose && (
          <View style={{ gap: 8 }}>
            <Text>Actual steps in THIS test (leave blank if unknown)</Text>
            <TextInput
              accessibilityLabel="Actual test step count"
              placeholder="e.g. 10"
              keyboardType="number-pad"
              editable={mode === 'walk'}
              value={mode === 'stationary' ? '0' : manualSteps}
              onChangeText={setManualSteps}
              style={{
                padding: 14,
                borderWidth: 1,
                borderColor: '#cbd5ca',
                borderRadius: 10,
              }}
            />
            <TextInput
              accessibilityLabel="Run notes"
              placeholder="Phone model, grip, anything unusual…"
              value={notes}
              onChangeText={setNotes}
              maxLength={1000}
              style={{
                padding: 14,
                borderWidth: 1,
                borderColor: '#cbd5ca',
                borderRadius: 10,
              }}
            />
            <Action
              title="Save count & notes"
              onPress={() => {
                try {
                  attachLabels();
                  const recording = session.getRecording();
                  if (recording) {
                    saveRun(recording);
                    setHistoryRevision((v) => v + 1);
                    setSavedMessage('Run and details saved on this device.');
                  }
                } catch (e) {
                  report(e);
                }
              }}
            />
          </View>
        )}
        {pose && (
          <Action
            title="Share this run"
            disabled={session.starting}
            onPress={() => {
              session.stop(
                'Stopped for export. Return to start before repeating.',
              );
              try {
                attachLabels();
                const recording = session.getRecording();
                // Sharing remains available if document storage is full.
                if (recording) {
                  try {
                    saveRun(recording);
                  } catch (e) {
                    report(e);
                  }
                }
                void exportRecording(recording).catch(report);
              } catch (e) {
                report(e);
              }
            }}
          />
        )}
      </View>
      <View
        style={{
          padding: 10,
          backgroundColor: 'white',
          borderRadius: 18,
          gap: 10,
        }}
      >
        <FloorMap
          venue={venue}
          floorId={pose?.floorId ?? 'ground'}
          pose={pose ?? undefined}
          route={route}
          course={course?.points}
          trace={session.trace}
          selectedRoom={selectedRoom}
          onSelectRoom={(id) => {
            setSelectedRoom(id);
            const found = venue.pois.find((p) => p.nodeId === id);
            if (found) setDestination(found.id);
            else setDestination(null);
          }}
        />
        {room && (
          <View style={{ padding: 10, gap: 5 }}>
            <Text style={{ fontWeight: '700', color: ink }}>
              {room.name}
              {room.dimensionLabel ? ` · ${room.dimensionLabel}` : ''}
            </Text>
            <Text style={{ color: muted }}>
              {room.note ??
                'Room dimensions follow the plan; check door locations and obstacles on site.'}
            </Text>
          </View>
        )}
        {route && (
          <Text style={{ color: ink }}>
            {route.distanceMetres.toFixed(1)} m to {poi?.name} from your last
            start point
          </Text>
        )}
      </View>
      {course && (
        <View
          style={{
            padding: 16,
            backgroundColor: '#fff7e6',
            borderRadius: 16,
            gap: 10,
          }}
        >
          <Text style={{ fontWeight: '700', color: ink }}>
            Set up once · repeat easily
          </Text>
          <Text style={{ color: ink, lineHeight: 22 }}>{course.setup}</Text>
          <Action
            title={
              marked
                ? '✓ Start, corner and end marks measured'
                : 'I’ve measured and cleared the test path'
            }
            disabled={busy}
            onPress={() => setMarked((v) => !v)}
          />
          <Text style={{ fontSize: 12, color: muted }}>
            Place tape marks first. After each walk, return to S and tap “I’m at
            the start”. The map cannot detect that you have returned.
          </Text>
        </View>
      )}
      <View
        style={{
          padding: 16,
          backgroundColor: 'white',
          borderRadius: 16,
          gap: 10,
        }}
      >
        <Action
          title={
            stepLength
              ? `${showCalibration ? 'Hide' : 'Edit'} calibration · ${stepLength.toFixed(3)} m/step`
              : 'Calibrate my steps'
          }
          disabled={busy}
          onPress={() => setShowCalibration((v) => !v)}
        />
        {showCalibration && (
          <>
            <Text style={{ color: muted }}>
              Walk a taped straight distance of at least 5 m, counting steps
              manually. Use a separate walk for evaluation. The saved
              calibration is specific to your pace and carry style.
            </Text>
            <TextInput
              accessibilityLabel="Calibration distance in metres"
              placeholder="Distance in metres"
              keyboardType="decimal-pad"
              value={distance}
              editable={!busy}
              onChangeText={setDistance}
              style={{
                borderWidth: 1,
                borderColor: '#cbd5ca',
                borderRadius: 10,
                padding: 14,
              }}
            />
            <TextInput
              accessibilityLabel="Calibration counted steps"
              placeholder="Steps you counted"
              keyboardType="number-pad"
              value={count}
              editable={!busy}
              onChangeText={setCount}
              style={{
                borderWidth: 1,
                borderColor: '#cbd5ca',
                borderRadius: 10,
                padding: 14,
              }}
            />
            <Action
              title="Save calibration on this phone"
              disabled={busy}
              onPress={() => {
                try {
                  const value = calibratedStepLength(
                    Number(distance),
                    Number(count),
                  );
                  saveCalibration(value);
                  setStepLength(value);
                  setShowCalibration(false);
                  setError(null);
                  if (lastAnchor) session.anchor(lastAnchor, value);
                  setResult(null);
                } catch (e) {
                  report(e);
                }
              }}
            />
            {stepLength !== null && (
              <Action
                title="Forget saved calibration"
                disabled={busy}
                onPress={() => {
                  try {
                    clearCalibration();
                    setStepLength(null);
                    setResult(null);
                  } catch (e) {
                    report(e);
                  }
                }}
              />
            )}
          </>
        )}
        <Text style={{ color: muted }}>
          Hold the phone screen-up, top edge pointing along your body. After
          Start, hold still through the countdown and wait for “Walk now”. Keep
          it below 60° tilt and keep the app open.
        </Text>
      </View>
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: ink }}>
          Explore from another location
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {venue.anchors.map((a) => (
            <Action
              key={a.id}
              title={a.label}
              disabled={busy}
              onPress={() => {
                setCourseId(null);
                setResult(null);
                establish(anchorPayload(venue, a.id));
              }}
            />
          ))}
        </ScrollView>
        <Action
          title="Scan a location marker"
          disabled={busy}
          onPress={() => {
            setCourseId(null);
            setScanning(true);
          }}
        />
        {scanning && (
          <AnchorScanner
            onScan={establish}
            onClose={() => setScanning(false)}
          />
        )}
        {!course && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[
              ['Toward rear ↑', Math.PI / 2],
              ['Toward right →', 0],
              ['Toward front ↓', -Math.PI / 2],
              ['Toward left ←', Math.PI],
            ].map(([label, value]) => (
              <Action
                key={label}
                title={`${heading === value ? '✓ ' : ''}${label}`}
                disabled={busy}
                onPress={() => setHeading(Number(value))}
              />
            ))}
          </View>
        )}
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {venue.pois.map((p) => (
            <Action
              key={p.id}
              title={`To ${p.name}`}
              onPress={() => setDestination(p.id)}
            />
          ))}
        </ScrollView>
      </View>
      <RunHistory revision={historyRevision} />
      <Action
        title={showNotes ? 'Hide plan notes' : 'Dimensions & plan notes'}
        onPress={() => setShowNotes((v) => !v)}
      />
      {showNotes && (
        <View style={{ gap: 10 }}>
          <Text selectable>{venue.provenance.description}</Text>
          {venue.provenance.notes.map((note) => (
            <Text key={note} selectable style={{ color: muted }}>
              • {note}
            </Text>
          ))}
        </View>
      )}
      <Text style={{ fontSize: 12, color: muted }}>
        Experimental PDR; accuracy is unmeasured. Private venue and recordings
        remain local until you choose to share them. Routes do not account for
        furniture.
      </Text>
    </ScrollView>
  );
}
