import { useState } from 'react';
import { api, ApiError, useApi } from '../api';
import { isStaff, useSession } from '../session';
import { fmt, Icon, Modal, useToast } from '../ui';

type Member = {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'editor' | 'staff';
  created_at: string;
};

/** People in an organisation. Owners add editors and owners; editors can see the list. */
export function TeamPage() {
  const { user, orgs } = useSession();
  const staff = isStaff(user);
  const [orgId, setOrgId] = useState(user.org_id ?? orgs[0]?.id ?? '');
  const members = useApi<Member[]>(orgId ? `/orgs/${orgId}/users` : null);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const canManage = staff || user.role === 'owner';
  const remove = async (m: Member) => {
    if (
      !window.confirm(`Remove ${m.name} (${m.email}) from this organisation?`)
    )
      return;
    try {
      await api(`/orgs/${orgId}/users/${m.id}`, { method: 'DELETE' });
      toast(`${m.name} removed`);
      members.reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not remove');
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p className="muted">
            Owners publish and manage people; editors prepare maps, places and
            beacons.
          </p>
        </div>
        <div className="row">
          {staff && (
            <select
              className="select"
              style={{ width: 240 }}
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {canManage && (
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Add person
            </button>
          )}
        </div>
      </div>
      <div className="card flush">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Since</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(members.data ?? []).map((m) => (
              <tr key={m.id}>
                <td>
                  <div className="row">
                    <div
                      className="avatar"
                      style={{ width: 28, height: 28, fontSize: 11 }}
                    >
                      {m.name
                        .split(' ')
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')}
                    </div>
                    <b>{m.name}</b>
                    {m.id === user.id && <span className="badge">You</span>}
                  </div>
                </td>
                <td className="muted">{m.email}</td>
                <td>
                  <span
                    className={`badge ${m.role === 'owner' ? 'accent' : ''}`}
                  >
                    {m.role}
                  </span>
                </td>
                <td className="muted">{fmt.date(m.created_at)}</td>
                <td style={{ textAlign: 'right' }}>
                  {canManage && m.id !== user.id && (
                    <button
                      className="btn ghost sm danger"
                      onClick={() => void remove(m)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.data && members.data.length === 0 && (
          <div className="empty">Nobody here yet.</div>
        )}
      </div>
      <p className="subtle" style={{ marginTop: 12, fontSize: 12.5 }}>
        Development server: new people sign in with their email on the sign-in
        page. Production will send an invitation through single sign-on.
      </p>
      {adding && (
        <AddPerson
          orgId={orgId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            members.reload();
          }}
        />
      )}
    </div>
  );
}

function AddPerson({
  orgId,
  onClose,
  onAdded,
}: {
  orgId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'editor' | 'owner'>('editor');
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    try {
      await api(`/orgs/${orgId}/users`, { body: { email, name, role } });
      toast(`${name} added`);
      onAdded();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add');
    }
  };
  return (
    <Modal
      title="Add a person"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!email.includes('@') || !name.trim()}
            onClick={() => void add()}
          >
            Add
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
        <label>Work email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Role</label>
        <div className="segmented">
          <button
            className={role === 'editor' ? 'on' : ''}
            onClick={() => setRole('editor')}
          >
            Editor — prepares changes
          </button>
          <button
            className={role === 'owner' ? 'on' : ''}
            onClick={() => setRole('owner')}
          >
            Owner — publishes and manages people
          </button>
        </div>
      </div>
      {error && <div className="banner">{error}</div>}
    </Modal>
  );
}
