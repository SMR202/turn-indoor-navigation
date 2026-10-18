import { useEffect, useRef, useState } from 'react';
import {
  api,
  hasToken,
  loadServerInfo,
  setToken,
  useApi,
  type Org,
  type User,
  type VenueSummary,
} from './api';
import { HomePage } from './pages/Home';
import { OpsPage, OrgsPage } from './pages/Ops';
import { SignIn } from './pages/SignIn';
import { VenuePage } from './pages/Venue';
import { href, useRoute, type VenueTab } from './router';
import { SessionCtx, isStaff, useSession, type Session } from './session';
import { Icon, Mark, ToastProvider } from './ui';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(hasToken());
  const signOut = () => {
    setToken(null);
    setSession(null);
  };
  const load = () =>
    loadServerInfo()
      .then(() => api<{ user: User; orgs: Org[] }>('/me'))
      .then((me) => setSession({ ...me, signOut }))
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  useEffect(() => {
    if (hasToken()) void load();
  }, []);
  if (checking) return <div className="empty">Loading…</div>;
  return (
    <ToastProvider>
      {session ? (
        <SessionCtx.Provider value={session}>
          <Shell />
        </SessionCtx.Provider>
      ) : (
        <SignIn
          onSignedIn={(token) => {
            setToken(token);
            void load();
          }}
        />
      )}
    </ToastProvider>
  );
}

const venueTabs: { tab: VenueTab; label: string; icon: string }[] = [
  { tab: 'overview', label: 'Overview', icon: 'building' },
  { tab: 'map', label: 'Map', icon: 'layers' },
  { tab: 'places', label: 'Places', icon: 'pin' },
  { tab: 'beacons', label: 'Beacons', icon: 'beacon' },
  { tab: 'publish', label: 'Publish', icon: 'share' },
  { tab: 'analytics', label: 'Analytics', icon: 'walk' },
];

function Shell() {
  const route = useRoute();
  const session = useSession();
  const venues = useApi<VenueSummary[]>('/venues');
  const main = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [route.name, route.name === 'venue' ? route.id : '']);
  const staff = isStaff(session.user);
  const current =
    route.name === 'venue' ? venues.data?.find((v) => v.id === route.id) : null;
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Mark size={28} />
          <b>TURN</b>
          <span>{staff ? 'Ops' : 'Studio'}</span>
        </div>
        <nav className="nav">
          <div className="eyebrow nav-group">Studio</div>
          <a href={href.home} className={route.name === 'home' ? 'active' : ''}>
            <Icon name="building" size={17} /> Venues
            <span className="count">{venues.data?.length ?? ''}</span>
          </a>
          {(venues.data ?? []).map((v) => (
            <div key={v.id}>
              <a
                href={href.venue(v.id)}
                className={
                  route.name === 'venue' &&
                  route.id === v.id &&
                  route.tab === 'overview'
                    ? 'active'
                    : ''
                }
                style={{ paddingLeft: 18 }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background:
                      v.status === 'live'
                        ? 'var(--c-success)'
                        : v.status === 'draft'
                          ? 'var(--c-warning)'
                          : 'var(--c-line-strong)',
                  }}
                />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {v.name}
                </span>
              </a>
              {route.name === 'venue' && route.id === v.id && (
                <div className="nav-venue">
                  {venueTabs.slice(1).map((t) => (
                    <a
                      key={t.tab}
                      href={href.venue(v.id, t.tab)}
                      className={route.tab === t.tab ? 'active' : ''}
                    >
                      <Icon name={t.icon} size={15} /> {t.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {staff && (
            <>
              <div className="eyebrow nav-group">TURN Ops</div>
              <a
                href={href.ops}
                className={route.name === 'ops' ? 'active' : ''}
              >
                <Icon name="layers" size={17} /> Pipeline
              </a>
              <a
                href={href.orgs}
                className={route.name === 'orgs' ? 'active' : ''}
              >
                <Icon name="users" size={17} /> Organisations
              </a>
            </>
          )}
        </nav>
        <div className="user-card">
          <div className="avatar">
            {session.user.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="grow">
            <div
              style={{
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {session.user.name}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              {session.user.role === 'staff'
                ? 'TURN staff'
                : `${session.orgs[0]?.name ?? ''} · ${session.user.role}`}
            </div>
          </div>
          <button
            className="btn ghost sm"
            onClick={session.signOut}
            title="Sign out"
          >
            <Icon name="back" size={15} />
          </button>
        </div>
      </aside>
      <main
        className="main"
        ref={main}
        onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 4)}
      >
        <div className={`topbar ${scrolled ? 'scrolled' : ''}`}>
          <div className="crumbs">
            <a href={href.home}>
              {staff
                ? 'All organisations'
                : (session.orgs[0]?.name ?? 'Studio')}
            </a>
            {route.name === 'venue' && (
              <>
                <span>/</span>
                <a href={href.venue(route.id)}>{current?.name ?? '…'}</a>
                {route.tab !== 'overview' && (
                  <>
                    <span>/</span>
                    <b>{venueTabs.find((t) => t.tab === route.tab)?.label}</b>
                  </>
                )}
              </>
            )}
            {route.name === 'ops' && (
              <>
                <span>/</span>
                <b>Pipeline</b>
              </>
            )}
            {route.name === 'orgs' && (
              <>
                <span>/</span>
                <b>Organisations</b>
              </>
            )}
          </div>
          <div style={{ marginLeft: 'auto' }} className="row">
            <span className="badge">
              <Icon name="lock" size={12} /> Development sign-in
            </span>
          </div>
        </div>
        {route.name === 'home' && (
          <HomePage venues={venues.data} onChanged={venues.reload} />
        )}
        {route.name === 'venue' && (
          <VenuePage
            key={route.id}
            id={route.id}
            tab={route.tab}
            onChanged={venues.reload}
            tabs={venueTabs}
          />
        )}
        {route.name === 'ops' && staff && <OpsPage />}
        {route.name === 'orgs' && staff && <OrgsPage />}
      </main>
    </div>
  );
}
