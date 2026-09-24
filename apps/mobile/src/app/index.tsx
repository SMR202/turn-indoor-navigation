import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sampleVenue } from '@turn/venue-model';
import { calculateRoute } from '@turn/routing';
import { FloorMap } from '../components/floor-map';

export default function Home() {
  const [destination, setDestination] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  const startNodeId = sampleVenue.anchors[0]!.nodeId;
  const selected = sampleVenue.pois.find((poi) => poi.id === destination);
  const result = selected
    ? calculateRoute(sampleVenue, startNodeId, selected.nodeId)
    : null;
  const route = result?.status === 'ok' ? result.route : undefined;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: '#f6f7f2' }}
      contentContainerStyle={{
        padding: 24,
        paddingBottom: Math.max(insets.bottom, 24),
        gap: 22,
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
          style={{ fontSize: 34, fontWeight: '700', color: '#183d34' }}
        >
          {sampleVenue.name}
        </Text>
        <Text selectable style={{ color: '#62706b', fontSize: 16 }}>
          Ground floor · A fictional venue to explore TURN
        </Text>
      </View>
      <View
        style={{
          padding: 16,
          borderRadius: 20,
          backgroundColor: '#ffffff',
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <Text style={{ color: '#183d34', fontWeight: '600' }}>
            Your floor at a glance
          </Text>
          <Text style={{ color: '#49745c' }}>
            Bundled venue · Local routing
          </Text>
        </View>
        <FloorMap
          venue={sampleVenue}
          floorId="ground"
          route={route}
          startNodeId={startNodeId}
        />
        <Text selectable style={{ fontSize: 13, color: '#62706b' }}>
          Start: Main entrance (fixed demo location). Live positioning and QR
          scanning are coming next.
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        <Text style={{ fontSize: 23, fontWeight: '600', color: '#183d34' }}>
          Where are you heading?
        </Text>
        {sampleVenue.pois.map((poi) => (
          <Pressable
            key={poi.id}
            accessibilityRole="button"
            accessibilityLabel={`Route to ${poi.name}`}
            accessibilityState={{ selected: destination === poi.id }}
            onPress={() => setDestination(poi.id)}
            style={({ pressed }) => ({
              padding: 18,
              minHeight: 64,
              borderRadius: 16,
              backgroundColor: destination === poi.id ? '#dcebdc' : '#ffffff',
              opacity: pressed ? 0.75 : 1,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            })}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{ fontSize: 17, fontWeight: '600', color: '#183d34' }}
              >
                {poi.name}
              </Text>
              <Text style={{ color: '#62706b' }}>{poi.category}</Text>
            </View>
            <Text style={{ color: '#183d34', fontSize: 20 }}>↗</Text>
          </Pressable>
        ))}
      </View>
      <View
        accessibilityLiveRegion="polite"
        style={{
          padding: 20,
          backgroundColor: '#183d34',
          borderRadius: 18,
          gap: 10,
        }}
      >
        <Text
          selectable
          style={{ color: '#ffffff', fontSize: 21, fontWeight: '600' }}
        >
          {route
            ? `${route.distanceMetres} m to ${selected?.name}`
            : 'Choose a place to see your route'}
        </Text>
        <Text selectable style={{ color: '#d4e6d9', lineHeight: 22 }}>
          {route
            ? 'Follow the green line from the entrance. This preview does not track your movement.'
            : 'The map and route calculation use the venue saved in the app.'}
        </Text>
        {result && result.status !== 'ok' && (
          <Text selectable style={{ color: '#ffffff' }}>
            No route is available from this start.
          </Text>
        )}
        {route && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDestination(null)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: '#ffffff', textDecorationLine: 'underline' }}>
              Clear route
            </Text>
          </Pressable>
        )}
      </View>
      <Text selectable style={{ color: '#62706b', fontSize: 12 }}>
        Synthetic floor · Illustrative metre scale · Not a real venue or an
        accuracy measurement
      </Text>
    </ScrollView>
  );
}
