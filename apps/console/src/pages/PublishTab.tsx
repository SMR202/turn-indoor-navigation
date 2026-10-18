import { useEffect, useState } from 'react';
import { toString as qrSvg } from 'qrcode';
import { anchorPayload } from '@turn/positioning-core';
import { api, ApiError, lanHost, useApi, type Version } from '../api';
import { canPublish, useSession } from '../session';
import { fmt, Icon, useToast } from '../ui';
import type { VenueCtx } from './Venue';

/** TURN Lite (web app) link for a venue, served by the visitor app's web build on this host. */
export const visitorLink = (venueId: string) =>
  ((import.meta.env.VITE_TURN_VISITOR as string | undefined) ??
    `http://${lanHost ?? location.hostname}:8082`) + `/venue/${venueId}`;

export function QR({ text, size = 140 }: { text: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    void qrSvg(text, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1220', light: '#FFFFFF' },
    }).then(setSvg);
  }, [text]);
  return (
    <div
      className="qr"
      style={{ width: size + 24, height: size + 24 }}
      dangerouslySetInnerHTML={{
        __html: svg.replace('<svg', `<svg width="${size}" height="${size}"`),
      }}
    />
  );
}

export function PublishTab({ venue, pkg, reload }: VenueCtx) {
  const { user } = useSession();
  const toast = useToast();
  const versions = useApi<Version[]>(`/venues/${venue.id}/versions`);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = versions.data?.find((v) => v.status === 'draft');
  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ published: number }>(
        `/venues/${venue.id}/publish`,
        { body: { notes } },
      );
      toast(`Version ${r.published} is live`);
      setNotes('');
      reload();
      versions.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };
  const validation = pkg?.validation;
  return (
    <div className="split">
      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h2>
                {draft
                  ? `Draft v${draft.number}`
                  : venue.status === 'live'
                    ? 'Everything is live'
                    : 'Nothing to publish yet'}
              </h2>
              <p className="subtle" style={{ marginTop: 2 }}>
                {draft
                  ? `${draft.rooms} rooms · ${draft.places} places · saved ${fmt.ago(draft.created_at)}`
                  : venue.status === 'live'
                    ? `v${venue.publishedVersion} published ${fmt.date(venue.publishedAt)}. Place edits since then publish as a new version.`
                    : 'Import a floor plan to create the first draft.'}
              </p>
            </div>
            {validation && (
              <span className={`badge ${validation.ok ? 'live' : 'danger'}`}>
                <span className="dot" />
                {validation.ok ? 'Validation passed' : 'Validation failed'}
              </span>
            )}
          </div>
          {validation && !validation.ok && (
            <div className="col" style={{ gap: 6, marginBottom: 14 }}>
              {validation.errors.map((e) => (
                <div
                  key={e}
                  className="row"
                  style={{ color: 'var(--c-danger)' }}
                >
                  <Icon name="close" size={14} /> {e}
                </div>
              ))}
            </div>
          )}
          <div className="field">
            <label>Release notes</label>
            <textarea
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What changed — for your team's history"
              maxLength={400}
            />
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="btn primary lg"
              disabled={
                busy ||
                !canPublish(user) ||
                (validation ? !validation.ok : true)
              }
              onClick={() => void publish()}
            >
              <Icon name="share" size={16} /> Publish to visitors
            </button>
            {!canPublish(user) && (
              <span className="subtle">
                Editors prepare changes; an owner publishes.
              </span>
            )}
          </div>
          {error && (
            <div className="banner" style={{ marginTop: 12, marginBottom: 0 }}>
              {error}
            </div>
          )}
        </div>
        <div className="card">
          <h2>History</h2>
          <div style={{ marginTop: 8 }}>
            {(versions.data ?? []).map((v) => (
              <div className="list-row" key={v.number}>
                <span
                  className={`badge ${v.status === 'published' ? 'live' : v.status === 'draft' ? 'draft' : ''}`}
                  style={{ minWidth: 74, justifyContent: 'center' }}
                >
                  v{v.number} · {v.status}
                </span>
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>
                    {v.notes ||
                      (v.status === 'draft'
                        ? 'Unpublished changes'
                        : 'No notes')}
                  </div>
                  <div className="subtle" style={{ fontSize: 12.5 }}>
                    {v.rooms} rooms · {v.places} places ·{' '}
                    {v.published_at
                      ? `published ${fmt.time(v.published_at)}`
                      : `saved ${fmt.time(v.created_at)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="spread">
            <h2>QR codes</h2>
            <button className="btn sm no-print" onClick={() => window.print()}>
              <Icon name="share" size={14} /> Print
            </button>
          </div>
          <p className="subtle" style={{ marginTop: 4 }}>
            The venue link opens TURN Lite in the browser. Entry markers also
            set where the visitor stands.
          </p>
          <div className="col" style={{ marginTop: 14, gap: 16 }}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
              <QR text={visitorLink(venue.id)} size={104} />
              <div>
                <div style={{ fontWeight: 600 }}>Venue link</div>
                <div
                  className="subtle mono"
                  style={{ wordBreak: 'break-all', fontSize: 11.5 }}
                >
                  {visitorLink(venue.id)}
                </div>
              </div>
            </div>
            {pkg?.package.anchors.map((a) => (
              <div
                className="row"
                key={a.id}
                style={{ alignItems: 'flex-start', gap: 14 }}
              >
                <QR text={anchorPayload(pkg.package, a.id)} size={104} />
                <div>
                  <div style={{ fontWeight: 600 }}>{a.label}</div>
                  <div className="subtle" style={{ fontSize: 12 }}>
                    Entry marker · scan inside the TURN app
                  </div>
                  <div className="subtle mono" style={{ fontSize: 11 }}>
                    rev {pkg.package.revision}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {pkg?.status === 'draft' && pkg.package.anchors.length > 0 && (
            <div className="banner" style={{ marginTop: 14, marginBottom: 0 }}>
              Marker codes include the map revision: print them after publishing
              this draft.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
