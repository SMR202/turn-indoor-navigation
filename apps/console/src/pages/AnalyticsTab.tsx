import { useState } from 'react';
import { useApi, type Analytics } from '../api';
import { BarList, TrendChart } from '../charts';
import { CatBadge, fmt, Icon, Stat } from '../ui';
import type { VenueCtx } from './Venue';

export function AnalyticsTab({ venue, scenes }: VenueCtx) {
  const [days, setDays] = useState(30);
  const a = useApi<Analytics>(`/venues/${venue.id}/analytics?days=${days}`);
  const d = a.data;
  const placeName = (id: string) =>
    Object.values(scenes)
      .flatMap((s) => s.places)
      .find((p) => p.id === id);
  // Fill missing days so the chart has an honest zero instead of a gap.
  const daily = d
    ? Array.from({ length: days }, (_, i) => {
        const day = new Date(Date.now() - (days - 1 - i) * 864e5)
          .toISOString()
          .slice(0, 10);
        const row = d.daily.find((x) => x.day === day);
        return {
          day,
          sessions: row?.sessions ?? 0,
          routes: row?.routes ?? 0,
          arrivals: row?.arrivals ?? 0,
        };
      })
    : [];
  const top = d?.topDestinations[0];
  return (
    <>
      <div className="spread" style={{ marginBottom: 16 }}>
        <p className="muted">
          Anonymous app events: a random id per app launch, never a location
          trace.
        </p>
        <div className="segmented">
          {[7, 30, 90].map((n) => (
            <button
              key={n}
              className={days === n ? 'on' : ''}
              onClick={() => setDays(n)}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>
      {d?.sampleData && (
        <div className="banner">
          <Icon name="info" size={16} /> This fictional demo venue includes
          generated sample events so the dashboard can be explored. Real venues
          show real events only.
        </div>
      )}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat
          label="Visitors"
          value={d ? fmt.n(d.totals.sessions) : '—'}
          delta="App sessions"
          icon="walk"
        />
        <Stat
          label="Routes started"
          value={d ? fmt.n(d.totals.routes) : '—'}
          delta={
            d && d.totals.sessions
              ? `${(d.totals.routes / d.totals.sessions).toFixed(2)} per visitor`
              : undefined
          }
          icon="navigate"
        />
        <Stat
          label="Arrivals"
          value={d ? fmt.n(d.totals.arrivals) : '—'}
          delta="Reached the destination"
          icon="flag"
        />
        <Stat
          label="Arrival rate"
          value={fmt.pct(d?.totals.completion)}
          delta="Arrivals ÷ routes started"
          icon="check"
        />
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2>Activity</h2>
          <div className="row" style={{ gap: 14, fontSize: 12.5 }}>
            <span>
              <span className="swatch" style={{ background: '#2F5AF2' }} />
              Visitors
            </span>
            <span>
              <span className="swatch" style={{ background: '#24857F' }} />
              Routes
            </span>
            <span>
              <span className="swatch" style={{ background: '#C0662A' }} />
              Arrivals
            </span>
          </div>
        </div>
        {d ? (
          <TrendChart
            key={days}
            data={daily}
            series={[
              {
                key: 'sessions',
                label: 'Visitors',
                color: '#2F5AF2',
                area: true,
              },
              { key: 'routes', label: 'Routes', color: '#24857F' },
              { key: 'arrivals', label: 'Arrivals', color: '#C0662A' },
            ]}
          />
        ) : (
          <div className="skeleton" style={{ height: 240 }} />
        )}
      </div>
      <div className="grid g3">
        <div className="card">
          <h2 style={{ marginBottom: 14 }}>Top searches</h2>
          <BarList
            rows={(d?.topSearches ?? []).map((s) => ({
              label: s.query,
              value: s.n,
            }))}
          />
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 14 }}>Top destinations</h2>
          <BarList
            color="#24857F"
            rows={(d?.topDestinations ?? []).map((t) => {
              const p = placeName(t.placeId);
              return {
                label: p?.name ?? t.placeId,
                value: t.n,
                icon: p ? (
                  <CatBadge category={p.category} size={20} />
                ) : undefined,
              };
            })}
          />
        </div>
        <div className="card">
          <h2>What this suggests</h2>
          <div className="col" style={{ marginTop: 12, gap: 12 }}>
            {top && placeName(top.placeId) && (
              <Insight
                icon="pin"
                text={`${placeName(top.placeId)!.name} is the most requested destination — make sure its signage and hours are current.`}
              />
            )}
            {d?.topSearches[0] && (
              <Insight
                icon="search"
                text={`“${d.topSearches[0].query}” is searched most. Add it as a tag on the places that match.`}
              />
            )}
            {d && d.totals.completion != null && d.totals.completion < 0.75 && (
              <Insight
                icon="flag"
                text={`Only ${fmt.pct(d.totals.completion)} of routes end in an arrival — check positioning coverage on the busiest routes.`}
              />
            )}
            {d && d.totals.sessions === 0 && (
              <Insight
                icon="info"
                text="No visitors yet. Put the venue QR code at entrances to start."
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Insight({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
      <span
        className="cat"
        style={{ background: 'var(--c-accent-soft)', width: 28, height: 28 }}
      >
        <Icon name={icon} size={14} color="var(--c-accent)" />
      </span>
      <span>{text}</span>
    </div>
  );
}
