import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { Button, IconButton, T } from '../components/ui';
import { parseTurnCode } from '../lib/codes';

export default function Scan() {
  const insets = useSafeAreaInsets();
  const [permission, request] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const locked = useRef(false);
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: 1800 }), -1, true);
  }, [sweep]);
  const line = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * 236 }],
  }));
  return (
    <View style={{ flex: 1, backgroundColor: '#05070B' }}>
      {permission?.granted && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (locked.current) return;
            const code = parseTurnCode(data);
            if (!code) {
              setMessage(
                /exp\+|expo-development-client|exp:\/\//.test(data)
                  ? 'That is the app launch code. Scan a TURN code inside the venue.'
                  : 'Not a TURN code.',
              );
              return;
            }
            locked.current = true;
            router.replace({
              pathname: '/venue/[id]',
              params: code.anchorId
                ? { id: code.venueId, anchor: code.anchorId }
                : { id: code.venueId },
            });
          }}
        />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          { alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <View style={{ width: 252, height: 252 }}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: 44,
                height: 44,
                borderColor: '#FFFFFF',
                borderTopWidth: i < 2 ? 4 : 0,
                borderBottomWidth: i >= 2 ? 4 : 0,
                borderLeftWidth: i % 2 === 0 ? 4 : 0,
                borderRightWidth: i % 2 === 1 ? 4 : 0,
                borderRadius: 6,
                left: i % 2 === 0 ? 0 : undefined,
                right: i % 2 === 1 ? 0 : undefined,
                top: i < 2 ? 0 : undefined,
                bottom: i >= 2 ? 0 : undefined,
              }}
            />
          ))}
          {permission?.granted && (
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 14,
                  right: 14,
                  top: 8,
                  height: 2,
                  backgroundColor: '#4064F0',
                  borderRadius: 1,
                },
                line,
              ]}
            />
          )}
        </View>
      </View>
      <View
        style={{
          position: 'absolute',
          top: insets.top + 12,
          left: 16,
          right: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <T v="headline" color="#FFFFFF">
          Scan a TURN code
        </T>
        <IconButton
          icon="close"
          label="Close"
          size={40}
          tone="sunken"
          onPress={() => router.back()}
        />
      </View>
      <Animated.View
        entering={FadeIn.delay(200)}
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: insets.bottom + 28,
          gap: 12,
        }}
      >
        {!permission?.granted ? (
          <>
            <T v="body" color="#B9BFCA" center>
              {Platform.OS === 'web'
                ? 'Scanning works best in the TURN app. On the web, open the link printed under the code.'
                : 'TURN uses the camera only to read TURN codes. Nothing is recorded.'}
            </T>
            <Button
              label="Allow camera"
              icon="qr"
              onPress={() =>
                void (permission?.canAskAgain === false
                  ? Linking.openSettings()
                  : request())
              }
            />
          </>
        ) : (
          <T v="callout" color={message ? '#F2B8AC' : '#B9BFCA'} center>
            {message ?? 'Point at a TURN code at the entrance or on a sign.'}
          </T>
        )}
      </Animated.View>
    </View>
  );
}
