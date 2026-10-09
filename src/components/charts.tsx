import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Single-series cumulative probability curve with a crosshair tooltip and a
 * marker for "pulls you have". Single series → the card title names it; no legend.
 */
export function ProbabilityCurve({
  curve,
  marker,
  label,
  tip,
}: {
  curve: number[];
  marker: number;
  label: string;
  tip: (pulls: number, p: number) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  // Match the viewBox to the rendered width so tick labels keep their real size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width) || 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(260, width);
  const H = W < 420 ? 180 : 200;
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxX = Math.max(1, curve.length - 1);
  const x = (i: number) => pad.l + (i / maxX) * iw;
  const y = (p: number) => pad.t + (1 - p) * ih;
  const gid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  // Downsample for long curves to keep the path light.
  const stepN = Math.max(1, Math.floor(curve.length / 240));
  let line = '';
  for (let i = 0; i < curve.length; i += stepN) line += `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(curve[i]).toFixed(1)}`;
  line += `L${x(maxX).toFixed(1)},${y(curve[maxX]).toFixed(1)}`;
  const area = `${line}L${x(maxX)},${y(0)}L${x(0)},${y(0)}Z`;

  const ticks = niceTicks(maxX);
  const m = Math.min(marker, maxX);
  const active = hover ?? null;

  const onMove = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((sx - pad.l) / iw) * maxX);
    setHover(Math.max(0, Math.min(maxX, i)));
  };

  return (
    <figure className="viz">
      <div className="viz-plot" ref={wrapRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${label}. ${tip(m, curve[m])}`}
          onPointerMove={(e) => onMove(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => onMove(e.clientX)}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--series-1)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--series-1)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <g key={p}>
              <line x1={pad.l} x2={W - pad.r} y1={y(p)} y2={y(p)} className={p === 0 ? 'viz-axis' : 'viz-grid'} />
              <text x={pad.l - 8} y={y(p) + 4} className="viz-tick" textAnchor="end">
                {Math.round(p * 100)}%
              </text>
            </g>
          ))}
          {ticks.map((tk) => (
            <text key={tk} x={x(tk)} y={H - 6} className="viz-tick" textAnchor="middle">
              {tk}
            </text>
          ))}
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" />
          {marker > 0 && (
            <g className="viz-marker">
              <line x1={x(m)} x2={x(m)} y1={pad.t} y2={y(0)} />
              <circle cx={x(m)} cy={y(curve[m])} r={5} />
            </g>
          )}
          {active != null && (
            <g className="viz-cross" pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={pad.t} y2={y(0)} />
              <circle cx={x(active)} cy={y(curve[active])} r={4.5} />
            </g>
          )}
          <rect x={pad.l} y={pad.t} width={iw} height={ih} fill="transparent" />
        </svg>
        {active != null && (
          <div
            className="viz-tip"
            style={{
              left: `${(x(active) / W) * 100}%`,
              top: `${(y(curve[active]) / H) * 100}%`,
            }}
          >
            {tip(active, curve[active])}
          </div>
        )}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

function niceTicks(max: number): number[] {
  const raw = max / 5;
  const pow = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  const step = [1, 2, 5, 10].map((s) => s * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

export interface Datum {
  key: string;
  label: string;
  value: number;
  color?: string;
}

/** Horizontal bars, one hue; values labelled in text ink. */
export function HBars({ data, format, label }: { data: Datum[]; format: (v: number) => string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState<string | null>(null);
  return (
    <ul className="hbars" aria-label={label}>
      {data.map((d) => (
        <li
          key={d.key}
          className={hover && hover !== d.key ? 'is-dim' : ''}
          onPointerEnter={() => setHover(d.key)}
          onPointerLeave={() => setHover(null)}
        >
          <span className="hbar-label">{d.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(d.value / max) * 100}%`, background: d.color }} />
          </span>
          <span className="hbar-value num">{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Vertical columns with a hover tooltip (scores 1–10). */
export function Columns({ data, label, tip }: { data: Datum[]; label: string; tip: (d: Datum) => ReactNode }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="columns" role="img" aria-label={label}>
      {data.map((d) => (
        <div
          key={d.key}
          className={`col ${hover && hover !== d.key ? 'is-dim' : ''}`}
          onPointerEnter={() => setHover(d.key)}
          onPointerLeave={() => setHover(null)}
        >
          <div className="col-track">
            {hover === d.key && <div className="viz-tip col-tip">{tip(d)}</div>}
            <div className="col-fill" style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="col-label num">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** 100% stacked bar with a legend that also carries the values. */
export function StackedBar({ data, label, format }: { data: Datum[]; label: string; format: (d: Datum, share: number) => string }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="stacked">
      <div className="stacked-bar" role="img" aria-label={label}>
        {data
          .filter((d) => d.value > 0)
          .map((d) => (
            <span
              key={d.key}
              className={hover && hover !== d.key ? 'is-dim' : ''}
              style={{ flexGrow: d.value, background: d.color }}
              title={format(d, d.value / total)}
              onPointerEnter={() => setHover(d.key)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
      </div>
      <ul className="legend">
        {data.map((d) => (
          <li
            key={d.key}
            className={hover && hover !== d.key ? 'is-dim' : ''}
            onPointerEnter={() => setHover(d.key)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="swatch" style={{ background: d.color }} aria-hidden />
            <span>{d.label}</span>
            <span className="num muted">{format(d, d.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
