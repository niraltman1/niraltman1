import { useState, useMemo } from 'react';
import type { GraphNode } from '@/api/hooks.js';

interface Props {
  nodes:    GraphNode[];
  courseId: number;
}

// Simple SVG-based mind map — no external deps needed for MVP.
// Positions nodes in concentric circles around a root (parentId=null).
export function MindMapView({ nodes }: Props) {
  const [tooltip, setTooltip] = useState<string | null>(null);

  const layout = useMemo(() => {
    const roots = nodes.filter((n) => !n.parentId);
    const positioned: Array<GraphNode & { x: number; y: number }> = [];

    const cx = 400;
    const cy = 260;

    roots.forEach((root, ri) => {
      const angle = (2 * Math.PI * ri) / Math.max(roots.length, 1) - Math.PI / 2;
      const rx = ri === 0 && roots.length === 1 ? 0 : 160;
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * rx;
      positioned.push({ ...root, x, y });

      const children = nodes.filter((n) => n.parentId === root.id);
      children.forEach((child, ci) => {
        const ca = angle + (ci - (children.length - 1) / 2) * 0.6;
        positioned.push({ ...child, x: x + Math.cos(ca) * 110, y: y + Math.sin(ca) * 110 });
      });
    });

    return positioned;
  }, [nodes]);

  const edges = useMemo(() => {
    return layout.filter((n) => n.parentId).flatMap((n) => {
      const parent = layout.find((p) => p.id === n.parentId);
      if (!parent) return [];
      return [{ x1: parent.x, y1: parent.y, x2: n.x, y2: n.y, key: `${parent.id}-${n.id}` }];
    });
  }, [layout]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-parchment/30 text-sm">
        אין צמתים במפה — הוסף מושגים לקורס
      </div>
    );
  }

  return (
    <svg viewBox="0 0 800 520" className="w-full h-full">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Edges */}
      {edges.map((e) => (
        <line
          key={e.key}
          x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
          stroke="rgba(212,175,55,0.25)" strokeWidth={1.5}
          strokeDasharray="4 2"
        />
      ))}

      {/* Nodes */}
      {layout.map((node) => {
        const isRoot    = !node.parentId;
        const rx        = isRoot ? 42 : 34;
        const ry        = isRoot ? 18 : 15;
        const fill      = isRoot ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)';
        const stroke    = isRoot ? 'rgba(212,175,55,0.6)' : 'rgba(255,255,255,0.12)';
        const textColor = isRoot ? '#D4AF37' : 'rgba(245,245,235,0.7)';
        const fontSize  = isRoot ? 11 : 9;
        const label     = node.labelHe.length > 14 ? node.labelHe.slice(0, 13) + '…' : node.labelHe;
        return (
          <g
            key={node.id}
            onMouseEnter={() => setTooltip(node.labelHe)}
            onMouseLeave={() => setTooltip(null)}
            style={{ cursor: 'pointer' }}
          >
            <ellipse
              cx={node.x} cy={node.y} rx={rx} ry={ry}
              fill={fill} stroke={stroke} strokeWidth={isRoot ? 1.5 : 1}
              filter={isRoot ? 'url(#glow)' : undefined}
            />
            <text
              x={node.x} y={node.y}
              textAnchor="middle" dominantBaseline="middle"
              fill={textColor} fontSize={fontSize}
              fontFamily="sans-serif"
              style={{ userSelect: 'none' }}
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Tooltip bar */}
      {tooltip && (
        <text x={400} y={510} textAnchor="middle" fill="rgba(245,245,235,0.5)" fontSize={10} fontFamily="sans-serif">
          {tooltip}
        </text>
      )}
    </svg>
  );
}
