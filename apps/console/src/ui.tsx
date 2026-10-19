import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  categoryColors,
  MARK_PATHS,
  placeCategories,
  type PlaceCategory,
} from '@turn/design';
import { ICON_PATHS, UI_ICON_PATHS } from '@turn/map-scene';
import type { VenueSummary } from './api';

export function Icon({
  name,
  size = 18,
  color = 'currentColor',
  stroke = 2,
}: {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
}) {
  const paths = UI_ICON_PATHS[name] ?? ICON_PATHS[name] ?? ICON_PATHS.pin ?? [];
  const filled = name === 'play' || name === 'navigate';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ flex: 'none' }}
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={filled ? color : 'none'}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function Mark({
  size = 28,
  tile = '#0B1220',
  stroke = '#FFFFFF',
  draw = false,
}: {
  size?: number;
  tile?: string;
  stroke?: string;
  draw?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={draw ? 'draw' : undefined}
      style={{ flex: 'none' }}
    >
      <rect width="64" height="64" rx="16" fill={tile} />
      <path
        d={MARK_PATHS.route}
        fill="none"
        stroke={stroke}
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={MARK_PATHS.arrow}
        fill="none"
        stroke={stroke}
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={MARK_PATHS.dot.cx}
        cy={MARK_PATHS.dot.cy}
        r={MARK_PATHS.dot.r}
        fill="#2F5AF2"
        stroke={stroke}
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function CatBadge({
  category,
  size = 30,
}: {
  category: PlaceCategory;
  size?: number;
}) {
  return (
    <span
      className="cat"
      style={{
        width: size,
        height: size,
        background: categoryColors[category],
      }}
    >
      <Icon
        name={placeCategories[category].icon}
        size={Math.round(size * 0.55)}
        color="#fff"
        stroke={2.2}
      />
    </span>
  );
}

export function StatusBadge({
  venue,
}: {
  venue: Pick<VenueSummary, 'status' | 'draftVersion' | 'publishedVersion'>;
}) {
  if (venue.status === 'live')
    return (
      <span className="badge live pulse">
        <span className="dot" />
        Live · v{venue.publishedVersion}
        {venue.draftVersion ? ' · draft pending' : ''}
      </span>
    );
  if (venue.status === 'draft')
    return (
      <span className="badge draft">
        <span className="dot" />
        Draft
      </span>
    );
  return <span className="badge">No map yet</span>;
}

export function Stat({
  label,
  value,
  delta,
  icon,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="card stat">
      <div className="spread">
        <span className="eyebrow">{label}</span>
        {icon && <Icon name={icon} size={16} color="var(--c-text-subtle)" />}
      </div>
      <div className="value">{value}</div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  useEscape(onClose);
  return (
    <div
      className="scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-label={title}>
        <div className="spread" style={{ marginBottom: 16 }}>
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="col" style={{ gap: 14 }}>
          {children}
        </div>
        {footer && (
          <div
            className="row"
            style={{ justifyContent: 'flex-end', marginTop: 20 }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  title,
  subtitle,
  children,
  onClose,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  useEscape(onClose);
  return (
    <>
      <div
        className="scrim"
        style={{ background: 'rgba(11,18,32,0.18)' }}
        onMouseDown={onClose}
      />
      <aside className="drawer" role="dialog">
        <header className="spread">
          <div>
            <h2>{title}</h2>
            {subtitle && (
              <div className="muted" style={{ marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="content">{children}</div>
        {footer && <footer>{footer}</footer>}
      </aside>
    </>
  );
}

function useEscape(fn: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && fn();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [fn]);
}

const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null);
  const show = useCallback(
    (msg: string) => setToast({ msg, id: Date.now() }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" key={toast.id}>
          {toast.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Floor switcher shown above maps when a venue has more than one floor (top floor first). */
export function FloorPicker({
  floors,
  value,
  onChange,
}: {
  floors: { id: string; label: string; level: number }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  if (floors.length < 2) return null;
  return (
    <div className="segmented" role="tablist" aria-label="Floor">
      {[...floors]
        .sort((a, b) => b.level - a.level)
        .map((f) => (
          <button
            key={f.id}
            className={f.id === value ? 'on' : ''}
            onClick={() => onChange(f.id)}
          >
            {f.label}
          </button>
        ))}
    </div>
  );
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} color="var(--c-text-subtle)" stroke={1.6} />
      <h3 style={{ marginTop: 10, color: 'var(--c-text)' }}>{title}</h3>
      {children && <div style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export const fmt = {
  date: (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—',
  time: (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—',
  ago: (iso: string | null | undefined) => {
    if (!iso) return 'never';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
  },
  pct: (v: number | null | undefined) =>
    v == null ? '—' : `${Math.round(v * 100)}%`,
  n: (v: number) => v.toLocaleString(),
};
