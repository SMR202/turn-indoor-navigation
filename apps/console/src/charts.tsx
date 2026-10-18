import { useMemo, useState } from 'react';

type Series = { key: string; label: string; color: string; area?: boolean };

/** Responsive line/area chart (SVG, no dependencies) with a hover read-out. */
export function TrendChart({
  data,
  series,
  height = 240,
}: {
  data: ({ day: string } & Record<string, number | string>)[];
  series: Series[];
  height?: number;
}) {
  const width = 760;
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const max = useMemo(() => {
    const m = Math.max(
      1,
      ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)),
    );
    const step = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / step) * step;
  }, [data, series]);
  const x = (i: number) =>
    pad.l + (i * (width - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const path = (key: string) =>
    data
      .map(
        (d, i) =>
          `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(Number(d[key]) || 0).toFixed(1)}`,
      )
      .join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const every = Math.max(1, Math.ceil(data.length / 7));
  if (!data.length)
    return <div className="empty">No activity in this period yet.</div>;
  return (
    <div style={{ position: 'relative' }}>
      <svg
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * width;
          setHover(
            Math.max(
              0,
              Math.min(
                data.length - 1,
                Math.round(
                  ((px - pad.l) / (width - pad.l - pad.r)) * (data.length - 1),
                ),
              ),
            ),
          );
        }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`g-${s.key}`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0" stopColor={s.color} stopOpacity="0.22" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        <g className="grid">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
        </g>
        {data.map((d, i) =>
          i % every === 0 ? (
            <text key={d.day} x={x(i)} y={height - 6} textAnchor="middle">
              {new Date(d.day).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
              })}
            </text>
          ) : null,
        )}
        {series.map((s) =>
          s.area ? (
            <path
              key={`a-${s.key}`}
              className="area"
              d={`${path(s.key)}L${x(data.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`}
              fill={`url(#g-${s.key})`}
            />
          ) : null,
        )}
        {series.map((s) => (
          <path
            key={s.key}
            className="line"
            d={path(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.t}
              y2={height - pad.b}
              stroke="var(--c-line-strong)"
              strokeDasharray="3 3"
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={x(hover)}
                cy={y(Number(data[hover]![s.key]) || 0)}
                r={4}
                fill="var(--c-surface)"
                stroke={s.color}
                strokeWidth={2}
              />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="tooltip"
          style={{ left: `${(x(hover) / width) * 100}%`, top: 8 }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {new Date(data[hover]!.day).toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </div>
          {series.map((s) => (
            <div key={s.key}>
              <span className="swatch" style={{ background: s.color }} />
              {s.label}: {data[hover]![s.key]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BarList({
  rows,
  color = 'var(--c-accent)',
}: {
  rows: { label: string; value: number; icon?: React.ReactNode }[];
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="subtle">Nothing yet.</div>;
  return (
    <div className="col" style={{ gap: 12 }}>
      {rows.map((r, i) => (
        <div key={r.label} className="col" style={{ gap: 6 }}>
          <div className="spread">
            <span className="row" style={{ gap: 8, fontWeight: 500 }}>
              {r.icon}
              {r.label}
            </span>
            <span className="mono subtle">{r.value}</span>
          </div>
          <div className="bar">
            <i
              style={{
                width: `${(r.value / max) * 100}%`,
                background: color,
                animationDelay: `${i * 60}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
