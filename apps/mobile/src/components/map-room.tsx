import type { PropsWithChildren } from 'react';
import { G } from 'react-native-svg';

export type MapRoomProps = PropsWithChildren<{
  name: string;
  onSelect?: () => void;
}>;
export function MapRoom({ children, onSelect, name }: MapRoomProps) {
  return (
    <G onPress={onSelect} accessibilityLabel={name}>
      {children}
    </G>
  );
}
