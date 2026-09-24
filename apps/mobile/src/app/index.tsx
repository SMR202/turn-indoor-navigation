import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sampleVenue } from '@turn/venue-model';
import { calculateRoute } from '@turn/routing';
import { anchorPayload } from '@turn/positioning-core';
import { calibratedStepLength } from '@turn/pdr';
import { FloorMap } from '../components/floor-map';
import { AnchorScanner } from '../components/anchor-scanner';
import { useNavigationSession } from '../navigation/use-navigation-session';
import { exportRecording } from '../navigation/export-recording';

function Action({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        padding: 14,
        backgroundColor: disabled ? '#d7ddd7' : '#dcebdc',
        borderRadius: 12,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#183d34', fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}
export default function Home() {
  const [destination, setDestination] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lastAnchor, setLastAnchor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState('');
  const [count, setCount] = useState('');
  const [stepLength, setStepLength] = useState<number | null>(null);
  const [heading, setHeading] = useState(0);
  const session = useNavigationSession();
  const { pose } = session.snapshot;
  const insets = useSafeAreaInsets();
  const selected = sampleVenue.pois.find((poi) => poi.id === destination);
  const result =
    selected && session.anchorNodeId
      ? calculateRoute(sampleVenue, session.anchorNodeId, selected.nodeId)
      : null;
  const route = result?.status === 'ok' ? result.route : undefined;
  const establish = (payload: string) => {
    session.anchor(payload, stepLength ?? 0.7);
    setLastAnchor(payload);
    setScanning(false);
    setError(null);
  };
  const report = (failure: unknown) =>
    setError(failure instanceof Error ? failure.message : 'Action failed');
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: '#f6f7f2' }}
      contentContainerStyle={{
        padding: 24,
        paddingBottom: Math.max(insets.bottom, 24),
        gap: 20,
        width: '100%',
        maxWidth: 850,
        alignSelf: 'center',
      }}
    >
      <View style={{ gap: 8 }}>
        <Text
          style={{
            color: '#49745c',
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 2,
          }}
        >
          A LITTLE LESS LOST.
        </Text>
        <Text
          selectable
          style={{ fontSize: 32, fontWeight: '700', color: '#183d34' }}
        >
          {sampleVenue.name}
        </Text>
        <Text selectable style={{ color: '#62706b' }}>
          Expo SDK 57 · Ground floor · Synthetic test venue
        </Text>
      </View>
      <View
        style={{
          padding: 16,
          backgroundColor: 'white',
          borderRadius: 20,
          gap: 12,
        }}
      >
        <FloorMap
          venue={sampleVenue}
          floorId={pose?.floorId ?? 'ground'}
          route={route}
          pose={pose ?? undefined}
        />
        <Text
          selectable
          accessibilityLiveRegion="polite"
          style={{ color: '#183d34' }}
        >
          {session.snapshot.message}
        </Text>
        {pose && (
          <Text selectable style={{ color: '#62706b' }}>
            x {pose.position.x.toFixed(2)} m · y {pose.position.y.toFixed(2)} m
            · {session.snapshot.steps} steps ·{' '}
            {session.snapshot.distanceMetres.toFixed(1)} m walked
            {pose.headingRad === null
              ? ''
              : ` · heading ${Math.round((pose.headingRad * 180) / Math.PI)}°`}
          </Text>
        )}
        <Text selectable style={{ color: '#62706b', fontSize: 12 }}>
          Position accuracy is unmeasured. This fictional map is for controlled
          testing, not real-building guidance.
        </Text>
      </View>
      {error && (
        <Text selectable accessibilityRole="alert" style={{ color: '#9c3328' }}>
          {error}
        </Text>
      )}
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 22, fontWeight: '600', color: '#183d34' }}>
          1. Establish your location
        </Text>
        <Action
          title="Scan TURN location QR"
          disabled={session.running || session.starting}
          onPress={() => setScanning(true)}
        />
        {scanning && (
          <AnchorScanner
            onScan={establish}
            onClose={() => setScanning(false)}
          />
        )}
        <Text style={{ color: '#62706b' }}>
          Or select a known demo marker. These choices set location; they do not
          detect where you are.
        </Text>
        {sampleVenue.anchors.map((anchor) => (
          <Action
            key={anchor.id}
            title={`Use ${anchor.label}`}
            disabled={session.running || session.starting}
            onPress={() => {
              try {
                establish(anchorPayload(sampleVenue, anchor.id));
              } catch (failure) {
                report(failure);
              }
            }}
          />
        ))}
      </View>
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 22, fontWeight: '600', color: '#183d34' }}>
          2. Choose your destination
        </Text>
        {sampleVenue.pois.map((poi) => (
          <Action
            key={poi.id}
            title={`Route to ${poi.name}`}
            onPress={() => setDestination(poi.id)}
          />
        ))}
        <Text selectable style={{ color: '#183d34' }}>
          {route
            ? `${route.distanceMetres} m to ${selected?.name} from your last anchor`
            : selected
              ? 'Establish a location to calculate your route.'
              : 'Select a destination.'}
        </Text>
        {route && (
          <Action title="Clear route" onPress={() => setDestination(null)} />
        )}
      </View>
      <View
        style={{
          gap: 10,
          padding: 16,
          backgroundColor: '#fff',
          borderRadius: 16,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: '600', color: '#183d34' }}>
          3. Calibrate before walking
        </Text>
        <Text style={{ color: '#62706b' }}>
          Walk a measured straight distance of at least 5 m and manually count
          steps. Enter both, then return to your marker. Use a separate walk to
          test accuracy.
        </Text>
        <TextInput
          accessibilityLabel="Calibration distance in metres"
          placeholder="Measured distance (m)"
          keyboardType="decimal-pad"
          editable={!session.running && !session.starting}
          value={distance}
          onChangeText={setDistance}
          style={{
            borderWidth: 1,
            borderColor: '#c2d0c6',
            borderRadius: 10,
            padding: 14,
          }}
        />
        <TextInput
          accessibilityLabel="Calibration counted steps"
          placeholder="Manually counted steps"
          keyboardType="number-pad"
          editable={!session.running && !session.starting}
          value={count}
          onChangeText={setCount}
          style={{
            borderWidth: 1,
            borderColor: '#c2d0c6',
            borderRadius: 10,
            padding: 14,
          }}
        />
        <Action
          title="Apply measured step length"
          disabled={session.running || session.starting}
          onPress={() => {
            try {
              const length = calibratedStepLength(
                Number(distance),
                Number(count),
              );
              setStepLength(length);
              if (lastAnchor) session.anchor(lastAnchor, length);
              setError(null);
            } catch (failure) {
              report(failure);
            }
          }}
        />
        <Text selectable>
          {stepLength
            ? `Calibrated step length: ${stepLength.toFixed(3)} m`
            : 'Calibration required for live PDR.'}
        </Text>
        <Text style={{ color: '#62706b' }}>
          At the marker, hold the phone portrait and screen-up, tilted less than
          60°. Point its top edge in your walking direction. Choose that
          direction on the map, then start and stand still for 1 second. Keep
          the phone aligned with your body while walking.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['Right →', 0],
            ['Up ↑', Math.PI / 2],
            ['Left ←', Math.PI],
            ['Down ↓', -Math.PI / 2],
          ].map(([label, value]) => (
            <Action
              key={String(label)}
              title={`${heading === value ? '✓ ' : ''}${label}`}
              disabled={session.running || session.starting}
              onPress={() => setHeading(Number(value))}
            />
          ))}
        </View>
        <Action
          title={
            session.starting ? 'Starting sensors…' : 'Start calibrated PDR'
          }
          disabled={
            !pose ||
            !stepLength ||
            session.running ||
            session.starting ||
            session.snapshot.stopped ||
            scanning
          }
          onPress={() => {
            setError(null);
            void session.start(heading).catch(report);
          }}
        />
        <Action
          title="Stop walking"
          disabled={!session.running && !session.starting}
          onPress={() => session.stop()}
        />
        <Action
          title="Save test recording"
          disabled={!pose || session.starting}
          onPress={() => {
            session.stop(
              'Stopped for export. Return to marker before restarting.',
            );
            void exportRecording(session.getRecording()).catch(report);
          }}
        />
        <Text selectable style={{ color: '#62706b', fontSize: 12 }}>
          Foreground only. Gaps, heading jumps or excessive tilt stop tracking;
          return to a marker and re-anchor. Pocket/bag modes are not supported
          yet. Recordings stay on your device until you choose a share
          destination.
        </Text>
      </View>
    </ScrollView>
  );
}
