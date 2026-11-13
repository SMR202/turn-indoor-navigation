import { useMemo, useState } from 'react';
import { api, useApi, type Analytics, type Offer } from '../api';
import { href } from '../router';
import { CatBadge, Drawer, Empty, Icon, useToast } from '../ui';
import type { VenueCtx } from './Venue';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const blank = (placeId: string): Offer => ({
  id: `offer-${Date.now().toString(36)}`,
  title: '',
  placeId,
  radiusMetres: 15,
  dwellSeconds: 0,
  cooldownMinutes: 240,
  active: true,
});
/** A date-time input value (local) for an ISO time, and back. */
const toLocal = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined);

/**
 * Offers and tips shown in the app when a visitor is near a place (Plan 005 §11). The phone
 * decides when to show one; the venue only ever sees how often each was shown, opened and
 * dismissed.
 */
export function OffersTab({ venue, scenes, floors, reload }: VenueCtx) {
  const toast = useToast();
  const [editing, setEditing] = useState<Offer | null>(null);
  const analytics = useApi<Analytics>(`/venues/${venue.id}/analytics?days=30`);
  const places = useMemo(
    () =>
      Object.entries(scenes)
        .flatMap(([floorId, s]) => s.places.map((p) => ({ ...p, floorId })))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [scenes],
  );
  const offers = venue.content.offers ?? [];
  const counts = new Map(
    (analytics.data?.offers ?? []).map((o) => [o.offerId, o]),
  );
  const placeOf = (id: string) => places.find((p) => p.id === id);
  const floorName = (id: string) =>
    floors.find((f) => f.id === id)?.label ?? id;

  const save = async (o: Offer) => {
    await api(`/venues/${venue.id}/offers/${o.id}`, { method: 'PUT', body: o });
    toast(`“${o.title}” saved`);
    setEditing(null);
    reload();
  };
  const remove = async (o: Offer) => {
    await api(`/venues/${venue.id}/offers/${o.id}`, { method: 'DELETE' });
    toast(`“${o.title}” removed`, {
      label: 'Undo',
      run: () =>
        void api(`/venues/${venue.id}/offers/${o.id}`, {
          method: 'PUT',
          body: o,
        }).then(reload),
    });
    setEditing(null);
    reload();
  };

  if (!places.length)
    return (
      <div className="card">
        <Empty icon="bag" title="Offers need places">
          An offer belongs to a place on the map.{' '}
          <a href={href.venue(venue.id, 'map')}>Add a floor plan</a> first.
        </Empty>
      </div>
    );
  return (
    <>
      <div className="banner info">
        <Icon name="info" size={16} /> An offer appears as a small card in the
        TURN app when a visitor is near its place. The phone decides when; only
        anonymous counts come back. Offers reach visitors with the next publish.
      </div>
      <div className="spread" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>
          {offers.length ? `${offers.length} offers` : 'Offers'}
        </h2>
        <button
          className="btn primary"
          onClick={() => setEditing(blank(places[0]!.id))}
        >
          <Icon name="plus" size={15} /> New offer
        </button>
      </div>
      {offers.length === 0 ? (
        <div className="card">
          <Empty icon="bag" title="No offers yet">
            Start with one: a discount at a shop, a tip at the information desk,
            a reminder near the exit.
          </Empty>
        </div>
      ) : (
        <div className="card flush">
          <table className="table">
            <thead>
              <tr>
                <th>Offer</th>
                <th>Place</th>
                <th>Shows</th>
                <th style={{ textAlign: 'right' }}>Shown · 30 days</th>
                <th style={{ textAlign: 'right' }}>Opened</th>
                <th style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => {
                const p = placeOf(o.placeId);
                const n = counts.get(o.id);
                return (
                  <tr
                    key={o.id}
                    onClick={() => setEditing(o)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <b>{o.title}</b>
                      {o.text && <div className="subtle">{o.text}</div>}
                    </td>
                    <td>
                      {p ? (
                        <span className="row" style={{ gap: 8 }}>
                          <CatBadge category={p.category} size={22} />
                          {p.name}
                          {floors.length > 1 && (
                            <span className="subtle">
                              {floorName(p.floorId)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="badge danger">Place removed</span>
                      )}
                    </td>
                    <td className="subtle">
                      Within {o.radiusMetres} m
                      {o.dwellSeconds ? ` after ${o.dwellSeconds} s` : ''}
                      {o.hours ? ` · ${o.hours}` : ''}
                    </td>
                    <td style={{ textAlign: 'right' }}>{n?.shown ?? 0}</td>
                    <td style={{ textAlign: 'right' }}>
                      {n?.opened ?? 0}
                      {n?.shown ? (
                        <span className="subtle">
                          {' '}
                          · {Math.round((100 * n.opened) / n.shown)}%
                        </span>
                      ) : null}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`badge ${o.active ? 'live' : 'draft'}`}>
                        {o.active ? 'On' : 'Paused'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <OfferEditor
          key={editing.id}
          offer={editing}
          isNew={!offers.some((o) => o.id === editing.id)}
          places={places.map((p) => ({
            id: p.id,
            label:
              floors.length > 1
                ? `${p.name} · ${floorName(p.floorId)}`
                : p.name,
          }))}
          onClose={() => setEditing(null)}
          onSave={(o) => void save(o)}
          onRemove={(o) => void remove(o)}
        />
      )}
    </>
  );
}

function OfferEditor({
  offer,
  isNew,
  places,
  onClose,
  onSave,
  onRemove,
}: {
  offer: Offer;
  isNew: boolean;
  places: { id: string; label: string }[];
  onClose: () => void;
  onSave: (o: Offer) => void;
  onRemove: (o: Offer) => void;
}) {
  const [d, setD] = useState<Offer>(offer);
  const set = (p: Partial<Offer>) => setD((x) => ({ ...x, ...p }));
  const [from, to] = (d.hours ?? '-').split('-') as [string, string];
  const setHours = (a: string, b: string) =>
    set({ hours: a && b ? `${a}-${b}` : undefined });
  const ends = d.startsAt && d.endsAt && d.endsAt <= d.startsAt;
  const valid = d.title.trim().length > 0 && !ends;
  return (
    <Drawer
      title={isNew ? 'New offer' : d.title || 'Offer'}
      subtitle="Shown in the app near a place"
      onClose={onClose}
      footer={
        <>
          {!isNew && (
            <button
              className="btn danger"
              style={{ marginRight: 'auto' }}
              onClick={() => onRemove(offer)}
            >
              Remove
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!valid}
            onClick={() =>
              onSave({
                ...d,
                title: d.title.trim(),
                text: d.text?.trim() || undefined,
              })
            }
          >
            Save
          </button>
        </>
      }
    >
      <div className="field">
        <label>Title</label>
        <input
          className="input"
          maxLength={60}
          autoFocus={isNew}
          value={d.title}
          placeholder="Free pastry with any coffee"
          onChange={(e) => set({ title: e.target.value })}
        />
      </div>
      <div className="field">
        <label>More detail (optional)</label>
        <input
          className="input"
          maxLength={160}
          value={d.text ?? ''}
          placeholder="Today until 11:00"
          onChange={(e) => set({ text: e.target.value || undefined })}
        />
      </div>
      <div className="field">
        <label>Place</label>
        <select
          className="select"
          value={d.placeId}
          onChange={(e) => set({ placeId: e.target.value })}
        >
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid g2" style={{ gap: 12 }}>
        <div className="field">
          <label>Show within (metres)</label>
          <input
            className="input"
            type="number"
            min={3}
            max={60}
            value={d.radiusMetres}
            onChange={(e) =>
              set({
                radiusMetres: Math.max(3, Math.min(60, Number(e.target.value))),
              })
            }
          />
        </div>
        <div className="field">
          <label>After staying (seconds)</label>
          <input
            className="input"
            type="number"
            min={0}
            max={600}
            value={d.dwellSeconds}
            onChange={(e) =>
              set({
                dwellSeconds: Math.max(
                  0,
                  Math.min(600, Number(e.target.value)),
                ),
              })
            }
          />
        </div>
      </div>
      <div className="subtle">
        A small distance (5–10 m) means “right at the door”. A stay of 30
        seconds or more reaches people who stop, not people walking past.
      </div>
      <div className="grid g2" style={{ gap: 12 }}>
        <div className="field">
          <label>Starts (optional)</label>
          <input
            className="input"
            type="datetime-local"
            value={toLocal(d.startsAt)}
            onChange={(e) => set({ startsAt: fromLocal(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Ends (optional)</label>
          <input
            className="input"
            type="datetime-local"
            value={toLocal(d.endsAt)}
            onChange={(e) => set({ endsAt: fromLocal(e.target.value) })}
          />
        </div>
      </div>
      {ends && <div className="banner">The offer ends before it starts.</div>}
      <div className="grid g2" style={{ gap: 12 }}>
        <div className="field">
          <label>From (time of day)</label>
          <input
            className="input"
            type="time"
            value={from}
            onChange={(e) => setHours(e.target.value, to || '23:59')}
          />
        </div>
        <div className="field">
          <label>Until</label>
          <input
            className="input"
            type="time"
            value={to}
            onChange={(e) => setHours(from || '00:00', e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>Days</label>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {DAYS.map((name, i) => {
            const on = !d.days?.length || d.days.includes(i);
            return (
              <button
                key={name}
                type="button"
                className={`btn sm ${on ? 'primary' : ''}`}
                aria-pressed={on}
                onClick={() => {
                  const all = d.days?.length ? d.days : [0, 1, 2, 3, 4, 5, 6];
                  const next = all.includes(i)
                    ? all.filter((x) => x !== i)
                    : [...all, i].sort();
                  set({
                    days:
                      next.length === 7 || next.length === 0 ? undefined : next,
                  });
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="field">
        <label>Show the same visitor again after (minutes)</label>
        <input
          className="input"
          type="number"
          min={1}
          max={10080}
          value={d.cooldownMinutes}
          onChange={(e) =>
            set({
              cooldownMinutes: Math.max(
                1,
                Math.min(10080, Number(e.target.value)),
              ),
            })
          }
        />
      </div>
      <label className="row" style={{ gap: 10 }}>
        <input
          type="checkbox"
          checked={d.active}
          onChange={(e) => set({ active: e.target.checked })}
        />
        On
      </label>
      <div className="subtle">
        The app also limits itself: one offer at a time, at most one every two
        minutes and six in a visit, never while a turn is coming, and only when
        the position is trustworthy.
      </div>
    </Drawer>
  );
}
