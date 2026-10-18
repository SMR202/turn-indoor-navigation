import { useState } from 'react';
import { api, ApiError, useApi, type Org, type OpsOverview } from '../api';
import { go, href } from '../router';
import { fmt, Icon, Modal, Stat, useToast } from '../ui';

const lanes = [
  { stage: 'created', title: 'Created', hint: 'Waiting for a floor plan' },
  { stage: 'map', title: 'Map imported', hint: 'Fix validation, add places' },
  { stage: 'content', title: 'Content ready', hint: 'Ready to publish' },
  { stage: 'live', title: 'Live', hint: 'Needs an accuracy walk' },
  { stage: 'measured', title: 'Measured', hint: 'Accuracy recorded' },
] as const;

export function OpsPage() {
  const o = useApi<OpsOverview>('/ops/overview');
  const [evaluating, setEvaluating] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const d = o.data;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <p className="muted">
            Every customer venue from first floor plan to measured accuracy.
          </p>
        </div>
      </div>
      <div className="grid g4" style={{ marginBottom: 20 }}>
        <Stat label="Organisations" value={d?.orgs ?? '—'} icon="users" />
        <Stat label="Venues" value={d?.venues ?? '—'} icon="building" />
        <Stat
          label="Live"
          value={d?.live ?? '—'}
          delta={d ? `${d.venues - d.live} in onboarding` : undefined}
          icon="check"
        />
        <Stat
          label="Visitors · 7 days"
          value={d ? fmt.n(d.sessions7d) : '—'}
          icon="walk"
        />
      </div>
      <div className="kanban">
        {lanes.map((l) => {
          const items = d?.pipeline.filter((v) => v.stage === l.stage) ?? [];
          return (
            <div className="lane" key={l.stage}>
              <div className="lane-head">
                <span>{l.title}</span>
                <span className="subtle">{items.length}</span>
              </div>
              {items.map((v, i) => (
                <div
                  className="card"
                  key={v.id}
                  onClick={() => go(href.venue(v.id))}
                  style={{
                    animation: `rise 300ms var(--ease) ${i * 50}ms both`,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{v.name}</div>
                  <div className="subtle" style={{ fontSize: 12.5 }}>
                    {v.orgName}
                  </div>
                  <div
                    className="row"
                    style={{
                      marginTop: 10,
                      gap: 10,
                      fontSize: 12,
                      color: 'var(--c-text-muted)',
                    }}
                  >
                    <span>{v.places} places</span>
                    <span>{v.beacons} beacons</span>
                    {v.visibility === 'private-lan' && (
                      <Icon name="lock" size={12} />
                    )}
                  </div>
                  {v.quality && (
                    <div className="badge live" style={{ marginTop: 10 }}>
                      {v.quality.medianErrorM ?? '—'} m median ·{' '}
                      {v.quality.walks} walks
                    </div>
                  )}
                  {(l.stage === 'live' || l.stage === 'measured') && (
                    <button
                      className="btn sm"
                      style={{ marginTop: 10, width: '100%' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEvaluating({ id: v.id, name: v.name });
                      }}
                    >
                      Record accuracy walk
                    </button>
                  )}
                </div>
              ))}
              {!items.length && (
                <div
                  className="subtle"
                  style={{ fontSize: 12, padding: '4px 6px' }}
                >
                  {l.hint}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {evaluating && (
        <EvalModal
          venue={evaluating}
          onClose={() => setEvaluating(null)}
          onSaved={() => {
            setEvaluating(null);
            o.reload();
          }}
        />
      )}
    </div>
  );
}

function EvalModal({
  venue,
  onClose,
  onSaved,
}: {
  venue: { id: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [walks, setWalks] = useState('10');
  const [median, setMedian] = useState('');
  const [drift, setDrift] = useState('');
  const [note, setNote] = useState('');
  const save = async () => {
    await api(`/ops/venues/${venue.id}/eval`, {
      body: {
        walks: Number(walks),
        medianErrorM: median ? Number(median) : null,
        standingDriftM: drift ? Number(drift) : null,
        note,
      },
    });
    toast('Accuracy recorded');
    onSaved();
  };
  return (
    <Modal
      title={`Accuracy · ${venue.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!Number(walks)}
            onClick={() => void save()}
          >
            Save result
          </button>
        </>
      }
    >
      <div className="banner info" style={{ marginBottom: 0 }}>
        Enter results from real walks with landmark marks only (npm run
        analyze:ble). Simulations never count as venue accuracy.
      </div>
      <div className="grid g3" style={{ gap: 12 }}>
        <div className="field">
          <label>Walks</label>
          <input
            className="input"
            type="number"
            min={1}
            value={walks}
            onChange={(e) => setWalks(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Median error (m)</label>
          <input
            className="input"
            type="number"
            step="0.1"
            value={median}
            onChange={(e) => setMedian(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Standing drift (m)</label>
          <input
            className="input"
            type="number"
            step="0.1"
            value={drift}
            onChange={(e) => setDrift(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label>Note</label>
        <input
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Phones, beacons, conditions"
        />
      </div>
    </Modal>
  );
}

export function OrgsPage() {
  const orgs = useApi<Org[]>('/orgs');
  const ops = useApi<OpsOverview>('/ops/overview');
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('pilot');
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    try {
      await api('/orgs', { body: { name, plan } });
      toast(`${name} added`);
      setCreating(false);
      setName('');
      orgs.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed');
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Organisations</h1>
          <p className="muted">Customers and their venues.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> New organisation
        </button>
      </div>
      <div className="card flush">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Plan</th>
              <th>Venues</th>
              <th>Live</th>
              <th>Since</th>
            </tr>
          </thead>
          <tbody>
            {(orgs.data ?? []).map((o) => {
              const vs =
                ops.data?.pipeline.filter((v) => v.orgId === o.id) ?? [];
              return (
                <tr key={o.id}>
                  <td>
                    <b>{o.name}</b>
                  </td>
                  <td>
                    <span className="badge">{o.plan}</span>
                  </td>
                  <td>{vs.length}</td>
                  <td>{vs.filter((v) => v.status === 'live').length}</td>
                  <td className="muted">{fmt.date(o.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {creating && (
        <Modal
          title="New organisation"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={name.trim().length < 2}
                onClick={() => void create()}
              >
                Create
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
            />
          </div>
          <div className="field">
            <label>Plan</label>
            <select
              className="select"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="pilot">Pilot</option>
              <option value="standard">Standard</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          {error && <div className="banner">{error}</div>}
        </Modal>
      )}
    </div>
  );
}
