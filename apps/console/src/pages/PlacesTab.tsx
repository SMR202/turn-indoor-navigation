import { useMemo, useState } from 'react';
import {
  normaliseCategory,
  placeCategories,
  type PlaceCategory,
} from '@turn/design';
import type { ScenePlace } from '@turn/map-scene';
import { api, type PlaceContent } from '../api';
import { href } from '../router';
import { CatBadge, Drawer, Empty, Icon, useToast } from '../ui';
import type { VenueCtx } from './Venue';

export function PlacesTab({ venue, scene, scenes, floors, reload }: VenueCtx) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<PlaceCategory | 'all'>('all');
  const [editing, setEditing] = useState<ScenePlace | null>(null);
  const floorName = (id: string) =>
    floors.find((f) => f.id === id)?.label ?? id;
  const places = useMemo(
    () =>
      Object.entries(scenes).flatMap(([fid, s]) =>
        s.places.map((p) => ({ ...p, floorId: fid })),
      ),
    [scenes],
  );
  const cats = [...new Set(places.map((p) => p.category))];
  const rows = places.filter(
    (p) =>
      (cat === 'all' || p.category === cat) &&
      (!query ||
        `${p.name} ${p.categoryLabel}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  if (!scene)
    return (
      <div className="card">
        <Empty icon="pin" title="No places yet">
          Places come from the floor plan.{' '}
          <a href={href.venue(venue.id, 'map')}>Import a floor plan</a> first.
        </Empty>
      </div>
    );
  return (
    <>
      <div className="banner info">
        <Icon name="info" size={16} /> Edits are saved straight away and reach
        visitors with the next publish.
      </div>
      <div className="spread" style={{ marginBottom: 14 }}>
        <div className="row grow" style={{ maxWidth: 360 }}>
          <input
            className="input"
            placeholder="Search places"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="segmented">
          <button
            className={cat === 'all' ? 'on' : ''}
            onClick={() => setCat('all')}
          >
            All · {places.length}
          </button>
          {cats.map((c) => (
            <button
              key={c}
              className={cat === c ? 'on' : ''}
              onClick={() => setCat(c)}
            >
              {placeCategories[c].label}
            </button>
          ))}
        </div>
      </div>
      <div className="card flush">
        <table className="table">
          <thead>
            <tr>
              <th>Place</th>
              <th>Category</th>
              {floors.length > 1 && <th>Floor</th>}
              <th>Hours</th>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const c = venue.content.places[p.id] ?? {};
              return (
                <tr key={p.id} className="click" onClick={() => setEditing(p)}>
                  <td>
                    <div className="row">
                      <CatBadge category={p.category} size={28} />
                      <b>{p.name}</b>
                    </div>
                  </td>
                  <td className="muted">{p.categoryLabel}</td>
                  {floors.length > 1 && (
                    <td className="muted">{floorName(p.floorId)}</td>
                  )}
                  <td className="muted">{c.hours ?? '—'}</td>
                  <td
                    className="muted"
                    style={{
                      maxWidth: 320,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.description ?? (
                      <span className="subtle">Add a description</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div
                      className="row"
                      style={{ justifyContent: 'flex-end', gap: 6 }}
                    >
                      {c.accessible && (
                        <span className="badge accent" title="Step-free access">
                          <Icon name="accessible" size={12} />
                        </span>
                      )}
                      {c.hidden ? (
                        <span className="badge">Hidden</span>
                      ) : (
                        <span className="badge live">Visible</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <PlaceEditor
          key={editing.id}
          venueId={venue.id}
          place={editing}
          content={venue.content.places[editing.id] ?? {}}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function PlaceEditor({
  venueId,
  place,
  content,
  onClose,
  onSaved,
}: {
  venueId: string;
  place: ScenePlace;
  content: PlaceContent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<PlaceContent>(content);
  const [tags, setTags] = useState((content.tags ?? []).join(', '));
  const set = (p: Partial<PlaceContent>) => setDraft((d) => ({ ...d, ...p }));
  const save = async () => {
    await api(`/venues/${venueId}/places/${place.id}`, {
      method: 'PATCH',
      body: {
        ...draft,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 12),
      },
    });
    toast(`${place.name} saved`);
    onSaved();
  };
  return (
    <Drawer
      title={place.name}
      subtitle={place.categoryLabel}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <div className="row">
        <CatBadge category={place.category} size={44} />
        <div className="subtle">
          Category comes from the floor plan ({place.category}). Position:{' '}
          {place.x.toFixed(1)}, {place.y.toFixed(1)} m.
        </div>
      </div>
      <div className="grid g2" style={{ gap: 12 }}>
        <div className="field">
          <label>Display name</label>
          <input
            className="input"
            value={draft.name ?? ''}
            placeholder={place.name}
            onChange={(e) => set({ name: e.target.value || undefined })}
          />
        </div>
        <div className="field">
          <label>Category</label>
          <select
            className="select"
            value={draft.category ? normaliseCategory(draft.category) : ''}
            onChange={(e) => set({ category: e.target.value || undefined })}
          >
            <option value="">From the floor plan</option>
            {(Object.keys(placeCategories) as PlaceCategory[])
              .filter((k) => k !== 'circulation')
              .map((k) => (
                <option key={k} value={k}>
                  {placeCategories[k].label}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Description</label>
        <textarea
          className="textarea"
          maxLength={600}
          value={draft.description ?? ''}
          onChange={(e) => set({ description: e.target.value || undefined })}
          placeholder="What visitors find here"
        />
      </div>
      <div className="grid g2" style={{ gap: 12 }}>
        <div className="field">
          <label>Opening hours</label>
          <input
            className="input"
            value={draft.hours ?? ''}
            onChange={(e) => set({ hours: e.target.value || undefined })}
            placeholder="09:00–18:00"
          />
        </div>
        <div className="field">
          <label>Phone</label>
          <input
            className="input"
            value={draft.phone ?? ''}
            onChange={(e) => set({ phone: e.target.value || undefined })}
          />
        </div>
      </div>
      <div className="field">
        <label>Website</label>
        <input
          className="input"
          value={draft.url ?? ''}
          onChange={(e) => set({ url: e.target.value || undefined })}
          placeholder="https://"
        />
      </div>
      <div className="field">
        <label>Search tags</label>
        <input
          className="input"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="coffee, wifi, toilets"
        />
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(draft.accessible)}
          onChange={(e) => set({ accessible: e.target.checked })}
        />
        Step-free access
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(draft.hidden)}
          onChange={(e) => set({ hidden: e.target.checked })}
        />
        Hide from visitors (still routable)
      </label>
    </Drawer>
  );
}
