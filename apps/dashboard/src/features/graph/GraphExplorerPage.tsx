import { useState } from 'react';
import { CircleNotchIcon, GraphIcon, FunnelIcon } from '@phosphor-icons/react';
import { useEntityGraph } from '@/api/hooks.js';
import { EntityGraph } from '@/features/entities/EntityGraph.js';
import type { EntityGraphNode, EntityGraphEdge } from '@/api/hooks.js';

const KIND_FILTERS = ['Judge', 'Court', 'Case'] as const;
type KindFilter = typeof KIND_FILTERS[number];

const KIND_LABEL: Record<KindFilter, string> = {
  Judge: 'שופטים',
  Court: 'בתי משפט',
  Case:  'תיקים',
};

interface ReasonsPanel {
  node: EntityGraphNode;
  edges: EntityGraphEdge[];
}

export function GraphExplorerPage() {
  const { data, isLoading, isError } = useEntityGraph();
  const [activeFilters, setActiveFilters] = useState<Set<KindFilter>>(new Set(KIND_FILTERS));
  const [selectedPanel, setSelectedPanel] = useState<ReasonsPanel | null>(null);

  const allNodes  = data?.nodes ?? [];
  const allEdges  = data?.edges ?? [];

  const filteredNodes = allNodes.filter((n) => activeFilters.has(n.kind as KindFilter));
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = allEdges.filter(
    (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target),
  );

  function toggleFilter(kind: KindFilter) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size > 1) next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }

  function handleNodeClick(nodeId: number) {
    const node = filteredNodes.find((n) => n.id === nodeId);
    if (!node) return;
    const edges = filteredEdges.filter(
      (e) => e.source === nodeId || e.target === nodeId,
    );
    setSelectedPanel({ node, edges });
  }

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-parchment/10">
        <div className="flex items-center gap-2">
          <GraphIcon size={20} className="text-gold" />
          <h1 className="text-lg font-semibold text-parchment">גרף הידע</h1>
          {!isLoading && (
            <span className="text-xs text-parchment/40 font-mono">
              {filteredNodes.length} ישויות · {filteredEdges.length} קשרים
            </span>
          )}
        </div>

        {/* Kind filters */}
        <div className="flex items-center gap-2">
          <FunnelIcon size={14} className="text-parchment/40" />
          {KIND_FILTERS.map((kind) => (
            <button
              key={kind}
              onClick={() => toggleFilter(kind)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                activeFilters.has(kind)
                  ? 'bg-gold/20 text-gold border border-gold/30'
                  : 'bg-navy-900/30 text-parchment/40 border border-parchment/10'
              }`}
            >
              {KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph canvas */}
        <div className="flex-1 overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center h-full gap-2 text-parchment/30">
              <CircleNotchIcon size={20} className="animate-spin" />
              <span className="text-sm">טוען גרף…</span>
            </div>
          )}

          {isError && (
            <div className="flex items-center justify-center h-full text-red-400 text-sm">
              שגיאה בטעינת הגרף. נסה שוב.
            </div>
          )}

          {!isLoading && !isError && filteredNodes.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-parchment/30">
              <GraphIcon size={40} />
              <p className="text-sm">אין ישויות בגרף עדיין.</p>
              <p className="text-xs text-parchment/20">הפעל את מנוע הישויות כדי לבנות את הגרף.</p>
            </div>
          )}

          {!isLoading && !isError && filteredNodes.length > 0 && (
            <EntityGraph
              nodes={filteredNodes}
              edges={filteredEdges}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>

        {/* Reasons panel */}
        {selectedPanel && (
          <aside
            role="region"
            aria-label="סיבות"
            className="w-72 border-r border-parchment/10 bg-navy-900/30 p-4 space-y-3 overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-parchment/80">{selectedPanel.node.canonical}</h2>
              <button
                onClick={() => setSelectedPanel(null)}
                className="text-parchment/30 hover:text-parchment/60 text-lg leading-none"
                aria-label="סגור פאנל"
              >
                ×
              </button>
            </div>

            <div className="text-xs text-parchment/40 font-mono">{selectedPanel.node.kind}</div>

            {selectedPanel.edges.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-parchment/60">קשרים ({selectedPanel.edges.length})</p>
                {selectedPanel.edges.map((e, i) => (
                  <div key={i} className="text-xs text-parchment/50 px-2 py-1.5 bg-navy-900/40 rounded border border-parchment/5">
                    <span className="font-mono text-gold/60">{e.relation}</span>
                    <span className="text-parchment/30 mx-1">·</span>
                    <span>
                      {e.source === selectedPanel.node.id ? `→ ${e.target}` : `← ${e.source}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-parchment/30">אין קשרים ישירים לישות זו בתצוגה הנוכחית.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
