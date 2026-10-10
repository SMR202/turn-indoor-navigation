import type { MapRoomProps } from './map-room';

// SVG's native responder mixin is not a DOM event API. Web gets a keyboard-accessible group.
export function MapRoom({ children, onSelect, name }: MapRoomProps) {
  return (
    <g
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={name}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {children}
    </g>
  );
}
