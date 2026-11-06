import { useState } from 'react';
import {
  normaliseCategory,
  placeCategories,
  type PlaceCategory,
} from '@turn/design';
import type { ScenePlace } from '@turn/map-scene';
import { api, type PlaceContent } from '../api';
import { CatBadge, Drawer, useToast } from '../ui';

/** Place details a venue team edits: name, category, description, hours, visibility. */
export function PlaceEditor({
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
          Category: {place.categoryLabel}. Position {place.x.toFixed(1)},{' '}
          {place.y.toFixed(1)} m: drag it in the Map view to move it.
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
