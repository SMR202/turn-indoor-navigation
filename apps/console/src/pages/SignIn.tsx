import { useState } from 'react';
import { api, ApiError } from '../api';
import { Icon, Mark } from '../ui';

const accounts = [
  {
    email: 'owner@harbour.demo',
    name: 'Amira Khan',
    role: 'Venue owner · Harbour Group (demo)',
  },
  {
    email: 'editor@harbour.demo',
    name: 'Leo Park',
    role: 'Editor · Harbour Group (demo)',
  },
  {
    email: 'home@turn.local',
    name: 'Home owner',
    role: 'Owner · private home venue (if loaded)',
  },
  {
    email: 'ops@turn.local',
    name: 'TURN Operations',
    role: 'TURN staff · all organisations',
  },
];

export function SignIn({
  onSignedIn,
}: {
  onSignedIn: (token: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signIn = async (address: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>('/auth/dev-login', {
        body: { email: address },
      });
      onSignedIn(r.token);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="signin">
      <section className="brand-panel">
        <div className="grid-bg" />
        <div className="row" style={{ position: 'relative', gap: 12 }}>
          <Mark size={34} tile="#1C2433" />
          <b style={{ letterSpacing: '0.24em' }}>TURN</b>
        </div>
        <div style={{ marginTop: 'auto', position: 'relative', maxWidth: 520 }}>
          <svg
            width="160"
            height="160"
            viewBox="0 0 64 64"
            className="draw"
            style={{ marginBottom: 28 }}
          >
            <path
              d="M22 47 V31 Q22 23 30 23 H43"
              fill="none"
              stroke="#F2F1EE"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M37 16 L44 23 L37 30"
              fill="none"
              stroke="#F2F1EE"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx="22"
              cy="47"
              r="4.6"
              fill="#4064F0"
              stroke="#F2F1EE"
              strokeWidth="2"
            />
          </svg>
          <h1
            style={{ fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.03em' }}
          >
            Indoor navigation, managed.
          </h1>
          <p
            style={{
              color: '#B9BFCA',
              fontSize: 16,
              marginTop: 14,
              lineHeight: 1.55,
            }}
          >
            Import floor plans, describe every place, plan beacons and publish a
            venue visitors can navigate — then see how they use it.
          </p>
          <div
            className="col"
            style={{ marginTop: 28, gap: 12, color: '#B9BFCA' }}
          >
            {[
              [
                'layers',
                'Floor plans in, routable maps out — validated before they go live',
              ],
              [
                'beacon',
                'Beacon layouts simulated for coverage before anything is mounted',
              ],
              [
                'walk',
                'Anonymous visitor analytics: searches, routes and arrivals',
              ],
            ].map(([icon, text]) => (
              <div className="row" key={text} style={{ gap: 12 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: '#1C2433',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Icon name={icon!} size={16} color="#F2F1EE" />
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>
        <p
          style={{
            position: 'relative',
            color: '#7A8394',
            marginTop: 40,
            fontSize: 12.5,
          }}
        >
          TURN Studio for venues · TURN Ops for the TURN team
        </p>
      </section>
      <section className="form">
        <div>
          <h1>Sign in</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Use your work email. This development server signs you in without a
            password; production will use single sign-on.
          </p>
          <form
            className="col"
            style={{ marginTop: 24, gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              void signIn(email.trim());
            }}
          >
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button
              className="btn primary lg"
              disabled={busy || !email.includes('@')}
            >
              Continue
            </button>
            {error && (
              <div
                className="banner"
                style={{
                  margin: 0,
                  background: 'var(--c-danger-soft)',
                  color: 'var(--c-danger)',
                }}
              >
                {error}
              </div>
            )}
          </form>
          <div className="eyebrow" style={{ margin: '28px 0 10px' }}>
            Development accounts
          </div>
          <div className="col" style={{ gap: 8 }}>
            {accounts.map((a) => (
              <button
                key={a.email}
                className="account"
                onClick={() => void signIn(a.email)}
                disabled={busy}
              >
                <div className="avatar">
                  {a.name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div className="subtle" style={{ fontSize: 12.5 }}>
                    {a.role}
                  </div>
                </div>
                <Icon name="forward" size={16} color="var(--c-text-subtle)" />
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
