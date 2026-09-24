import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Linking, Pressable, Text, View } from 'react-native';

export function AnchorScanner({
  onScan,
  onClose,
}: {
  onScan: (payload: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  return (
    <View
      style={{
        padding: 16,
        gap: 12,
        backgroundColor: '#fff',
        borderRadius: 16,
      }}
    >
      <Text style={{ fontWeight: '700', color: '#183d34' }}>
        Scan a TURN location marker
      </Text>
      {!permission?.granted ? (
        <>
          <Text>
            Camera access is only used to read marker IDs. Photos are not
            recorded.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void (
                permission?.canAskAgain === false
                  ? Linking.openSettings()
                  : requestPermission()
              ).catch(() => setError('Unable to request camera access.'));
            }}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text>
              {permission?.canAskAgain === false
                ? 'Open camera settings'
                : 'Allow camera'}
            </Text>
          </Pressable>
        </>
      ) : (
        !error && (
          <CameraView
            style={{ height: 260 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onMountError={(event) => setError(event.message)}
            onBarcodeScanned={({ data }) => {
              if (locked.current) return;
              locked.current = true;
              try {
                onScan(data);
              } catch (failure) {
                setError(
                  failure instanceof Error ? failure.message : 'Invalid marker',
                );
              }
            }}
          />
        )
      )}
      {error && (
        <>
          <Text
            selectable
            accessibilityRole="alert"
            style={{ color: '#9c3328' }}
          >
            {error}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              locked.current = false;
              setError(null);
            }}
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text>Try another marker</Text>
          </Pressable>
        </>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={{ minHeight: 48, justifyContent: 'center' }}
      >
        <Text>Cancel scanning</Text>
      </Pressable>
    </View>
  );
}
