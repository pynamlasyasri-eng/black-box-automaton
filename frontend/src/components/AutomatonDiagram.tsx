import { useId } from 'react';
import type { DfaModel } from '../types';

const R = 26; // node radius

interface Pt { x: number; y: number; angle: number }
interface Group { from: string; to: string; symbols: string[] }
export interface ActiveEdge { from: string; to: string; symbol: string }

interface Props {
  dfa: DfaModel;
  activeState?: string | null;
  activeEdge?: ActiveEdge | null;
  caption?: string;
}

const STROKE = '#4338ca';
const ACTIVE = '#06b6d4';

export default function AutomatonDiagram({ dfa, activeState, activeEdge, caption }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const n = dfa.states.length;
  const ringRadius = n === 1 ? 0 : Math.max(95, 36 * n);
  const size = 2 * (ringRadius + R + 95);
  const c = size / 2;

  const pos: Record<string, Pt> = {};
  dfa.states.forEach((s, i) => {
    const angle = Math.PI + (2 * Math.PI * i) / n;
    pos[s] = { x: c + ringRadius * Math.cos(angle), y: c + ringRadius * Math.sin(angle), angle };
  });

  // Merge parallel transitions into one labelled arrow: "0,1".
  const groups = new Map<string, Group>();
  for (const s of dfa.states) {
    for (const a of dfa.alphabet) {
      const t = dfa.transitions[s][a];
      const key = `${s}\u2192${t}`;
      const g = groups.get(key);
      if (g) g.symbols.push(a);
      else groups.set(key, { from: s, to: t, symbols: [a] });
    }
  }

  const accepting = new Set(dfa.accepting);
  const isActiveEdge = (g: Group) =>
    !!activeEdge && activeEdge.from === g.from && activeEdge.to === g.to && g.symbols.includes(activeEdge.symbol);

  const renderEdge = (g: Group) => {
    const active = isActiveEdge(g);
    const color = active ? ACTIVE : '#64748b';
    const marker = `url(#${uid}${active ? 'a' : 'n'})`;
    const label = g.symbols.join(',');
    const common = { fill: 'none', stroke: color, strokeWidth: active ? 3.2 : 1.8, markerEnd: marker } as const;
    let d: string;
    let lx: number;
    let ly: number;
    const p = pos[g.from];

    if (g.from === g.to) {
      let theta = n === 1 ? -Math.PI / 2 : p.angle;
      if (g.from === dfa.initial && n > 1) theta += 1.0; // keep clear of the start arrow
      const pt = (ang: number, r: number) => [p.x + r * Math.cos(ang), p.y + r * Math.sin(ang)];
      const [sx, sy] = pt(theta - 0.45, R);
      const [ex, ey] = pt(theta + 0.45, R + 3);
      const [c1x, c1y] = pt(theta - 0.7, R + 46);
      const [c2x, c2y] = pt(theta + 0.7, R + 46);
      d = `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${ex},${ey}`;
      [lx, ly] = pt(theta, R + 34);
    } else {
      const q = pos[g.to];
      const hasReverse = groups.has(`${g.to}\u2192${g.from}`);
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = -dy / dist;
      const ny = dx / dist;
      const bend = hasReverse ? 38 : 0;
      const mx = (p.x + q.x) / 2 + nx * bend;
      const my = (p.y + q.y) / 2 + ny * bend;
      const l1 = Math.hypot(mx - p.x, my - p.y) || 1;
      const l2 = Math.hypot(mx - q.x, my - q.y) || 1;
      const sx = p.x + ((mx - p.x) / l1) * R;
      const sy = p.y + ((my - p.y) / l1) * R;
      const ex = q.x + ((mx - q.x) / l2) * (R + 3);
      const ey = q.y + ((my - q.y) / l2) * (R + 3);
      d = `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;
      lx = 0.25 * sx + 0.5 * mx + 0.25 * ex + nx * 13;
      ly = 0.25 * sy + 0.5 * my + 0.25 * ey + ny * 13;
    }
    return (
      <g key={`${g.from}-${g.to}`}>
        <path d={d} {...common} />
        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="15" fontWeight="700"
          fill={active ? '#0e7490' : '#1e293b'} stroke="#ffffff" strokeWidth="4" paintOrder="stroke">
          {label}
        </text>
      </g>
    );
  };

  const init = pos[dfa.initial];
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto max-h-[560px] w-full"
        role="img" aria-label={`State diagram with ${n} states`}>
        <defs>
          {([['n', '#64748b'], ['a', ACTIVE], ['s', STROKE]] as const).map(([suffix, fill]) => (
            <marker key={suffix} id={`${uid}${suffix}`} viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={fill} />
            </marker>
          ))}
        </defs>

        {/* initial-state arrow */}
        <line x1={init.x - R - 46} y1={init.y} x2={init.x - R - 3} y2={init.y}
          stroke={STROKE} strokeWidth="2.2" markerEnd={`url(#${uid}s)`} />
        <text x={init.x - R - 46} y={init.y - 10} fontSize="11" fill="#475569" fontWeight="600">start</text>

        {Array.from(groups.values()).map(renderEdge)}

        {dfa.states.map((s) => {
          const { x, y } = pos[s];
          const active = activeState === s;
          return (
            <g key={s}>
              {active && <circle cx={x} cy={y} r={R + 7} fill={ACTIVE} opacity="0.25" className="animate-pulseRing" />}
              <circle cx={x} cy={y} r={R} fill={active ? '#cffafe' : '#ffffff'}
                stroke={active ? ACTIVE : STROKE} strokeWidth={active ? 3.5 : 2.2} />
              {accepting.has(s) && (
                <circle cx={x} cy={y} r={R - 5} fill="none" stroke={active ? ACTIVE : STROKE} strokeWidth={active ? 3 : 2} />
              )}
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill="#0e1747">
                {s}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-center text-xs text-slate-500">
        {caption ?? 'Double circle = accepting state · arrow from “start” = initial state'}
      </figcaption>
    </figure>
  );
}
