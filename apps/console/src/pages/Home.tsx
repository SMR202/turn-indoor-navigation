import { useState } from 'react';
import {
  api,
  ApiError,
  useApi,
  type PackageResponse,
  type VenueSummary,
} from '../api';
import { Thumb } from '../map/Thumb';
import { go, href } from '../router';
import { isStaff, useSession } from '../session';
import { Empty, fmt, Icon, Modal, Stat, StatusBadge, useToast } from '../ui';

export function HomePage({
  venues,
  onChanged,
}: {
  venues: VenueSummary[] | null;
  onChanged: () => void;
}) {
  const { user, orgs } = useSession();
  const [creating, setCreating] = useState(false);
  const live = venues?.filter((v) => v.status === 'live').length ?? 0;
  const sessions = venues?.reduce((n, v) => n + v.sessions7d, 0) ?? 0;
  const places = venues?.reduce((n, v) => n + v.places, 0) ?? 0;
  const first = user.name.split(' ')[0];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>
            {greeting()}, {first}
          </h1>
          <p className="muted">
            {isStaff(user)
              ? 'Every venue across TURN customers.'
              : `Venues for ${orgs[0]?.name ?? 'your organisation'}.`}
          </p>
        </div>
        {user.role !== 'editor' && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New venue
          </button>
        )}
      </div>
      <div className="grid g4" style={{ marginBottom: 24 }}>
        <Stat
          label="Venues"
          value={venues?.length ?? '—'}
          delta={`${live} live`}
          icon="building"
        />
        <Stat
          label="Visitors · 7 days"
          value={fmt.n(sessions)}
          delta="App sessions (anonymous)"
          icon="walk"
        />
        <Stat
          label="Destinations"
          value={places}
          delta="Across published maps"
          icon="pin"
        />
        <Stat
          label="Beacons planned"
          value={venues?.reduce((n, v) => n + v.beacons, 0) ?? 0}
          delta="Saved layouts"
          icon="beacon"
        />
      </div>
      {venues && venues.length === 0 && (
        <div className="card">
          <Empty icon="building" title="No venues yet">
            Create a venue, import its floor plan and publish it to the TURN
            app.
          </Empty>
        </div>
      )}
      <div className="grid g3">
        {(venues ?? []).map((v, i) => (
          <VenueCard key={v.id} venue={v} delay={i * 60} />
        ))}
        {!venues &&
          [0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 250 }} />
          ))}
      </div>
      {creating && (
        <NewVenue
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            onChanged();
            go(href.venue(id, 'map'));
          }}
        />
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function VenueCard({ venue, delay }: { venue: VenueSummary; delay: number }) {
  const pkg = useApi<PackageResponse>(
    venue.status === 'empty' ? null : `/venues/${venue.id}/package`,
  );
  return (
    <a
      className="venue-card"
      href={href.venue(venue.id)}
      style={{ animation: `rise 360ms var(--ease) ${delay}ms both` }}
    >
      <div className="thumb">
        {pkg.data ? (
          <Thumb pkg={pkg.data.package} width={380} height={156} />
        ) : (
          <div
            style={{ height: '100%', display: 'grid', placeItems: 'center' }}
          >
            <Icon
              name="layers"
              size={28}
              color="var(--c-text-subtle)"
              stroke={1.6}
            />
          </div>
        )}
        <div className="badges">
          <StatusBadge venue={venue} />
          {venue.visibility === 'private-lan' && (
            <span className="badge ink">
              <Icon name="lock" size={11} /> Local network only
            </span>
          )}
        </div>
      </div>
      <div className="body">
        <div className="spread">
          <h3
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {venue.name}
          </h3>
          <Icon name="forward" size={16} color="var(--c-text-subtle)" />
        </div>
        <div className="subtle" style={{ marginTop: 2, fontSize: 13 }}>
          {venue.orgName} · {venue.address || 'No address'}
        </div>
        <div className="row" style={{ marginTop: 14, gap: 16, fontSize: 13 }}>
          <span className="row" style={{ gap: 6 }}>
            <Icon name="pin" size={14} color="var(--c-text-subtle)" />{' '}
            {venue.places} places
          </span>
          <span className="row" style={{ gap: 6 }}>
            <Icon name="beacon" size={14} color="var(--c-text-subtle)" />{' '}
            {venue.beacons} beacons
          </span>
          <span className="row" style={{ gap: 6 }}>
            <Icon name="walk" size={14} color="var(--c-text-subtle)" />{' '}
            {venue.sessions7d} / 7d
          </span>
        </div>
      </div>
    </a>
  );
}

function NewVenue({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { user, orgs } = useSession();
  const toast = useToast();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [orgId, setOrgId] = useState(user.org_id ?? orgs[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    try {
      const v = await api<VenueSummary>('/venues', {
        body: { name, address, orgId },
      });
      toast(`${v.name} created`);
      onCreated(v.id);
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : 'Could not create the venue',
      );
    }
  };
  return (
    <Modal
      title="New venue"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={name.trim().length < 2 || !orgId}
            onClick={() => void create()}
          >
            Create and import map
          </button>
        </>
      }
    >
      <div className="field">
        <label>Name</label>
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Harbour Mall"
        />
      </div>
      <div className="field">
        <label>Address</label>
        <input
          className="input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street, city"
        />
      </div>
      {isStaff(user) && (
        <div className="field">
          <label>Organisation</label>
          <select
            className="select"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <div className="banner">{error}</div>}
    </Modal>
  );
}
