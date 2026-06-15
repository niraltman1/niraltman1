import { useMemo, useState } from 'react';
import type { EntityGraphNode, EntityGraphEdge } from '@/api/hooks.js';

interface Props {
  nodes:        EntityGraphNode[];
  edges:        EntityGraphEdge[];
  onNodeClick?: (nodeId: number) => void;
}

const KIND_COLOR: Record<string, string> = {
  Judge: '#c9a84c',  // gold
  Court: '#5b8dd9',  // blue
  Case:  '#7ec98f',  // green
};
const KIND_LABEL: Record<string, string> = {
  Judge: 'שופט/ת',
  Court: 'בית משפט',
  Case:  'תיק',
};
const RELATION_LABEL: Record<string, string> = {
  presides_over: 'מנהל/ת',
  hears:         'שומע',
  sits_in:       'יושב/ת ב',
};

const SVG_W = 780;
const SVG_H = 420;
const NODE_R = 16;
const LABEL_MAX = 18;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Assign (x, y) to each node using a 3-column layout by kind. */
function layout(nodes: EntityGraphNode[]): Map<number, { x: number; y: number }> {
  const kinds = ['Judge', 'Court', 'Case'];
  const byKind: Record<string, EntityGraphNode[]> = { Judge: [], Court: [], Case: [] };
  for (const n of nodes) {
    (byKind[n.kind] ??= []).push(n);
  }
  const colX: Record<string, number> = { Judge: 130, Court: 390, Case: 650 };
  const pos = new Map<number, { x: number; y: number }>();
  for (const kind of kinds) {
    const group = byKind[kind] ?? [];
    const step = group.length > 1 ? (SVG_H - 80) / (group.length - 1) : 0;
    const startY = group.length === 1 ? SVG_H / 2 : 40;
    group.forEach((n, i) => {
      pos.set(n.id, { x: colX[kind]!, y: startY + i * step });
    });
  }
  return pos;
}

export function EntityGraph({ nodes, edges, onNodeClick }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const pos = useMemo(() => layout(nodes), [nodes]);

  const activeNodeIds = useMemo((): Set<number> => {
    if (hovered === null) return new Set();
    const s = new Set([hovered]);
    for (const e of edges) {
      if (e.source === hovered) s.add(e.target);
      if (e.target === hovered) s.add(e.source);
    }
    return s;
  }, [hovered, edges]);

  const dimmed = hovered !== null;

  return (
    <div className="rounded-xl overflow-hidden border border-parchment/10 bg-navy-100">
      {/* Legend */}
      <div className="flex gap-4 px-4 py-2 border-b border-parchment/10">
        {Object.entries(KIND_LABEL).map(([kind, label]) => (
          <span key={kind} className="flex items-center gap-1.5 text-xs text-parchment/60">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ background: KIND_COLOR[kind] }}
            />
            {label}
          </span>
        ))}
        <span className="mr-auto text-xs text-parchment/30">{nodes.length} ישויות · {edges.length} קשרים</span>
      </div>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        style={{ display: 'block', minHeight: 320 }}
      >
        {/* Column headers */}
        {(['Judge', 'Court', 'Case'] as const).map((kind) => (
          <text
            key={kind}
            x={kind === 'Judge' ? 130 : kind === 'Court' ? 390 : 650}
            y={16}
            textAnchor="middle"
            fontSize={10}
            fill={KIND_COLOR[kind]}
            opacity={0.8}
            fontFamily="inherit"
          >
            {KIND_LABEL[kind]}
          </text>
        ))}

        {/* Edges */}
        {edges.map((e, i) => {
          const a = pos.get(e.source);
          const b = pos.get(e.target);
          if (!a || !b) return null;
          const active = dimmed ? (activeNodeIds.has(e.source) && activeNodeIds.has(e.target)) : true;
          const cx = (a.x + b.x) / 2;
          const cy = (a.y + b.y) / 2 - 20;
          return (
            <g key={i} opacity={active ? 1 : 0.08}>
              <path
                d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
                fill="none"
                stroke={active ? '#c9a84c' : '#5a5a6a'}
                strokeWidth={active ? 1.5 : 0.8}
                strokeOpacity={active ? 0.55 : 0.3}
                strokeDasharray={e.relation === 'sits_in' ? '4 3' : undefined}
              />
              {active && (
                <text
                  x={cx}
                  y={cy - 4}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#c9a84c"
                  opacity={0.7}
                  fontFamily="inherit"
                >
                  {RELATION_LABEL[e.relation] ?? e.relation}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const isActive = !dimmed || activeNodeIds.has(n.id);
          const isHovered = hovered === n.id;
          const color = KIND_COLOR[n.kind] ?? '#888';
          return (
            <g
              key={n.id}
              transform={`translate(${p.x},${p.y})`}
              opacity={isActive ? 1 : 0.15}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onNodeClick?.(n.id)}
            >
              <circle
                r={NODE_R + (isHovered ? 3 : 0)}
                fill={color}
                fillOpacity={isHovered ? 0.35 : 0.18}
                stroke={color}
                strokeWidth={isHovered ? 2 : 1.2}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={8}
                fill={color}
                fontFamily="inherit"
                fontWeight={isHovered ? 'bold' : 'normal'}
              >
                {truncate(n.canonical, LABEL_MAX)}
              </text>
              {isHovered && (
                <title>{n.canonical} ({n.kind}) — {n.degree} קשרים</title>
              )}
            </g>
          );
        })}
      </svg>

      {nodes.length === 0 && (
        <p className="text-center text-parchment/30 text-sm py-8">
          אין ישויות בגרף. לחץ "מלא גרף" כדי לאכלס מהתובנות הקיימות.
        </p>
      )}
    </div>
  );
}
