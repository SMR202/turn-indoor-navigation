import { useEffect, useMemo, useState } from 'react';
import {
  categoryColors,
  placeCategories,
  type PlaceCategory,
} from '@turn/design';
import type { P, ScenePlace } from '@turn/map-scene';
import { api, type CustomPlace, type PlaceContent } from '../api';
import { MapCanvas, type MapPin } from '../map/MapCanvas';
import { CatBadge, Icon, useToast } from '../ui';
import type { VenueCtx } from './Venue';

type Selection = { kind: 'place'; id: string } | { kind: 'room'; id: string };
const CATEGORY_CHOICES = (
  Object.keys(placeCategories) as PlaceCategory[]
).filter((k) => k !== 'circulation' && k !== 'other');

/**
 * Studio map editing: drag places to where they really are, add places the floor plan missed,
 * rename rooms and mark staff-only rooms. Every change saves at once and can be undone.
 */
export function MapEditor({
  venue,
  scene,
  floorId,
  floorPicker,
  reload,
  onEditPlace,
}: VenueCtx & { onEditPlace: (p: ScenePlace) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'select' | 'add'>('select');
  const [selected, setSelected] = useState<Selection | null>(null);
  const [adding, setAdding] = useState<P | null>(null);
  // Positions shown while dragging and until the saved venue comes back.
  const [moving, setMoving] = useState<Record<string, P>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => setMoving({}), [venue]);
  useEffect(() => {
    setSelected(null);
    setAdding(null);
  }, [floorId]);
  // Escape leaves add mode or clears the selection.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMode('select');
      setAdding(null);
      setSelected(null);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const content = venue.content;
  const customs = useMemo(
    () => new Map(content.customPlaces.map((c) => [c.id, c])),
    [content.customPlaces],
  );
  const pins: MapPin[] = useMemo(
    () =>
      (scene?.places ?? []).map((p) => ({
        id: p.id,
        x: moving[p.id]?.x ?? p.x,
        y: moving[p.id]?.y ?? p.y,
        color: categoryColors[p.category],
        label: p.name,
        selected: selected?.kind === 'place' && selected.id === p.id,
        edited: customs.has(p.id) || !!content.places[p.id]?.position,
      })),
    [scene, moving, selected, customs, content.places],
  );
  if (!scene) return null;
  const place =
    selected?.kind === 'place'
      ? scene.places.find((p) => p.id === selected.id)
      : undefined;
  const room =
    selected?.kind === 'room'
      ? scene.rooms.find((r) => r.id === selected.id)
      : undefined;
  const restricted = scene.rooms
    .filter((r) => content.rooms[r.id]?.restricted)
    .map((r) => r.id);

  const save = async (
    fn: () => Promise<unknown>,
    message: string,
    undo?: () => Promise<unknown>,
  ) => {
    setBusy(true);
    try {
      await fn();
      toast(
        message,
        undo && {
          label: 'Undo',
          run: () => void undo().then(reload),
        },
      );
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save');
      setMoving({});
    } finally {
      setBusy(false);
    }
  };
  const putCustom = (c: CustomPlace) =>
    api(`/venues/${venue.id}/custom-places/${c.id}`, {
      method: 'PUT',
      body: c,
    });
  const patchPlace = (id: string, record: PlaceContent) =>
    api(`/venues/${venue.id}/places/${id}`, { method: 'PATCH', body: record });

  const movePlace = (id: string, to: P) => {
    const p = { x: Number(to.x.toFixed(2)), y: Number(to.y.toFixed(2)) };
    setMoving((m) => ({ ...m, [id]: p }));
    const name = scene.places.find((x) => x.id === id)?.name ?? 'Place';
    const custom = customs.get(id);
    if (custom)
      return void save(
        () => putCustom({ ...custom, ...p }),
        `${name} moved`,
        () => putCustom(custom),
      );
    const before = content.places[id] ?? {};
    void save(
      () => patchPlace(id, { ...before, position: p }),
      `${name} moved`,
      () => patchPlace(id, before),
    );
  };
  const resetPosition = (id: string) => {
    const before = content.places[id] ?? {};
    const rest = { ...before };
    delete rest.position;
    void save(
      () => patchPlace(id, rest),
      'Back where the floor plan puts it',
      () => patchPlace(id, before),
    );
  };
  const removeCustom = (id: string) => {
    const c = customs.get(id);
    if (!c) return;
    setSelected(null);
    void save(
      () =>
        api(`/venues/${venue.id}/custom-places/${id}`, { method: 'DELETE' }),
      `${c.name} removed`,
      () => putCustom(c),
    );
  };
  const saveRoom = (
    id: string,
    edit: { name?: string; restricted?: boolean },
    message: string,
  ) => {
    const before = content.rooms[id] ?? {};
    void save(
      () =>
        api(`/venues/${venue.id}/rooms/${id}`, { method: 'PATCH', body: edit }),
      message,
      () =>
        api(`/venues/${venue.id}/rooms/${id}`, {
          method: 'PATCH',
          body: before,
        }),
    );
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 320px', gap: 16 }}>
      <MapCanvas
        scene={scene}
        height={600}
        placeMarkers={false}
        pins={
          mode === 'select'
            ? pins
            : pins.map((p) => ({ ...p, selected: false }))
        }
        restrictedRoomIds={restricted}
        selectedRoomId={room?.id ?? null}
        onPinMove={(id, p) => {
          setMoving((m) => ({ ...m, [id]: p }));
          setSelected({ kind: 'place', id });
        }}
        onPinDrop={movePlace}
        onPinClick={(id) => setSelected({ kind: 'place', id })}
        onRoomClick={(id) => setSelected(id ? { kind: 'room', id } : null)}
        onMapClick={
          mode === 'add'
            ? (p) => {
                setAdding(p);
                setSelected(null);
              }
            : undefined
        }
        cursor={mode === 'add' ? 'crosshair' : undefined}
        toolbar={
          <div className="row" style={{ gap: 8 }}>
            {floorPicker}
            <button
              className={`btn ${mode === 'add' ? 'primary' : ''}`}
              aria-pressed={mode === 'add'}
              onClick={() => {
                setMode(mode === 'add' ? 'select' : 'add');
                setAdding(null);
              }}
            >
              <Icon name="plus" size={16} />
              {mode === 'add' ? 'Click the map…' : 'Add a place'}
            </button>
          </div>
        }
      />
      <div className="card col" style={{ gap: 12, alignSelf: 'start' }}>
        {adding ? (
          <NewPlace
            key={`${adding.x},${adding.y}`}
            at={adding}
            busy={busy}
            onCancel={() => setAdding(null)}
            onCreate={(name, category) => {
              const c: CustomPlace = {
                id: `custom-${Date.now().toString(36)}`,
                floorId: scene.floorId,
                x: Number(adding.x.toFixed(2)),
                y: Number(adding.y.toFixed(2)),
                name,
                category,
              };
              setAdding(null);
              setMode('select');
              setSelected({ kind: 'place', id: c.id });
              void save(
                () => putCustom(c),
                `${name} added`,
                () =>
                  api(`/venues/${venue.id}/custom-places/${c.id}`, {
                    method: 'DELETE',
                  }),
              );
            }}
          />
        ) : place ? (
          <>
            <div className="row">
              <CatBadge category={place.category} size={40} />
              <div>
                <b>{place.name}</b>
                <div className="subtle">
                  {place.categoryLabel}
                  {customs.has(place.id) ? ' · added in Studio' : ''}
                </div>
              </div>
            </div>
            <p className="subtle" style={{ margin: 0 }}>
              Drag the pin to move it. Visitors are routed to the pin.
            </p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => onEditPlace(place)}>
                Edit details
              </button>
              {content.places[place.id]?.position && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => resetPosition(place.id)}
                >
                  Reset position
                </button>
              )}
              {customs.has(place.id) && (
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() => removeCustom(place.id)}
                >
                  Remove
                </button>
              )}
            </div>
          </>
        ) : room ? (
          <RoomPanel
            key={room.id}
            name={room.name}
            linked={!!room.placeId}
            restricted={!!content.rooms[room.id]?.restricted}
            busy={busy}
            onRename={(name) => {
              if (room.placeId) {
                // A room with a place is renamed through the place, so both stay in step.
                const before = content.places[room.placeId] ?? {};
                const id = room.placeId;
                void save(
                  () => patchPlace(id, { ...before, name }),
                  `Renamed to ${name}`,
                  () => patchPlace(id, before),
                );
              } else
                saveRoom(
                  room.id,
                  { ...content.rooms[room.id], name },
                  `Renamed to ${name}`,
                );
            }}
            onRestricted={(on) =>
              saveRoom(
                room.id,
                { ...content.rooms[room.id], restricted: on },
                on
                  ? `${room.name || 'Room'} is staff only: routes go around it`
                  : `${room.name || 'Room'} is open to visitors`,
              )
            }
          />
        ) : (
          <div className="col" style={{ gap: 8 }}>
            <b>Edit the map</b>
            <p className="subtle" style={{ margin: 0 }}>
              Click a place pin or a room. Use “Add a place” for anything the
              floor plan missed: a water fountain, a help point, a lift.
            </p>
            <ul className="subtle" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Dashed ring: moved or added here</li>
              <li>Striped room: staff only</li>
              <li>Esc cancels</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function NewPlace({
  at,
  busy,
  onCancel,
  onCreate,
}: {
  at: P;
  busy: boolean;
  onCancel: () => void;
  onCreate: (name: string, category: PlaceCategory) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('service');
  return (
    <form
      className="col"
      style={{ gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim(), category);
      }}
    >
      <b>New place</b>
      <span className="subtle">
        At {at.x.toFixed(1)}, {at.y.toFixed(1)} m
      </span>
      <div className="field">
        <label htmlFor="new-place-name">Name</label>
        <input
          id="new-place-name"
          className="input"
          autoFocus
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Water fountain"
        />
      </div>
      <div className="field">
        <label htmlFor="new-place-category">Category</label>
        <select
          id="new-place-category"
          className="select"
          value={category}
          onChange={(e) => setCategory(e.target.value as PlaceCategory)}
        >
          {CATEGORY_CHOICES.map((k) => (
            <option key={k} value={k}>
              {placeCategories[k].label}
            </option>
          ))}
        </select>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn primary"
          disabled={busy || !name.trim()}
        >
          Add place
        </button>
      </div>
    </form>
  );
}

function RoomPanel({
  name,
  linked,
  restricted,
  busy,
  onRename,
  onRestricted,
}: {
  name: string;
  linked: boolean;
  restricted: boolean;
  busy: boolean;
  onRename: (name: string) => void;
  onRestricted: (on: boolean) => void;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <form
      className="col"
      style={{ gap: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim() && draft.trim() !== name) onRename(draft.trim());
      }}
    >
      <b>{name || 'Unnamed room'}</b>
      <div className="field">
        <label htmlFor="room-name">Room name</label>
        <input
          id="room-name"
          className="input"
          maxLength={80}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Name shown on the map"
        />
        {linked && (
          <span className="subtle">Also renames the place in this room.</span>
        )}
      </div>
      <button
        type="submit"
        className="btn primary"
        disabled={busy || !draft.trim() || draft.trim() === name}
      >
        Rename
      </button>
      <label className="check">
        <input
          type="checkbox"
          checked={restricted}
          disabled={busy}
          onChange={(e) => onRestricted(e.target.checked)}
        />
        Staff only: routes never pass through
      </label>
    </form>
  );
}
