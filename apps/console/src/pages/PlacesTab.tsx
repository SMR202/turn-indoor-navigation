import { useMemo, useState } from 'react';
import { placeCategories, type PlaceCategory } from '@turn/design';
import type { ScenePlace } from '@turn/map-scene';
import { href } from '../router';
import { CatBadge, Empty, Icon } from '../ui';
import { MapEditor } from './MapEditor';
import { PlaceEditor } from './PlaceEditor';
import type { VenueCtx } from './Venue';

export function PlacesTab(ctx: VenueCtx) {
  const { venue, scene, scenes, floors, reload } = ctx;
  const [view, setView] = useState<'list' | 'map'>('list');
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
  const views = (
    <div className="segmented" role="tablist" aria-label="View">
      <button
        className={view === 'list' ? 'on' : ''}
        onClick={() => setView('list')}
        role="tab"
        aria-selected={view === 'list'}
      >
        List
      </button>
      <button
        className={view === 'map' ? 'on' : ''}
        onClick={() => setView('map')}
        role="tab"
        aria-selected={view === 'map'}
      >
        Map
      </button>
    </div>
  );
  const editor = editing && (
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
  );
  if (view === 'map')
    return (
      <>
        <div className="spread" style={{ marginBottom: 14 }}>
          <div className="banner info" style={{ margin: 0 }}>
            <Icon name="info" size={16} /> Drag places to move them, add new
            ones, rename rooms or make them staff only. Saved straight away;
            visitors see it after the next publish.
          </div>
          {views}
        </div>
        <MapEditor {...ctx} onEditPlace={setEditing} />
        {editor}
      </>
    );
  return (
    <>
      <div className="banner info">
        <Icon name="info" size={16} /> Edits are saved straight away and reach
        visitors with the next publish.
      </div>
      <div className="spread" style={{ marginBottom: 14 }}>
        {views}
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
      {editor}
    </>
  );
}
