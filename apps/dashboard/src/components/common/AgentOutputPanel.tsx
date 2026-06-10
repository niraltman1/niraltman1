import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RobotIcon, WarningIcon, CaretDownIcon, CaretUpIcon, WrenchIcon, PlusCircleIcon } from '@phosphor-icons/react';
import { useAddToShelf, useCreateDraft } from '@/api/hooks.js';
import { useUIStore } from '@/store/index.js';

interface ToolResult {
  toolName:  string;
  durationMs: number;
  error?:    string;
}

interface AgentOutput {
  result:          string;
  confidence:      number;
  toolResults:     ToolResult[];
  flagForReview:   boolean;
  durationMs:      number;
  ollamaAvailable: boolean;
  traceId:         string;
  agentName:       string;
}

interface Props {
  output:     AgentOutput | null;
  loading:    boolean;
  agentLabel: string;
}

function ResultBody({ result }: { result: string }) {
  try {
    const parsed = JSON.parse(result);
    return (
      <pre className="text-parchment/80 text-xs whitespace-pre-wrap font-mono leading-relaxed overflow-auto max-h-96 rounded p-3"
        style={{ background: 'rgba(10,18,38,0.4)' }}>
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  } catch {
    return <p className="text-parchment/80 text-sm leading-relaxed whitespace-pre-wrap">{result}</p>;
  }
}

function ConfBar({ value }: { value: number }) {
  const pct  = Math.round(value * 100);
  const cls  = value >= 0.8 ? 'ok' : value >= 0.5 ? 'warn' : 'err';
  return (
    <div className="conf-bar w-full">
      <div className="track flex-1">
        <div className={`fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-parchment/60 text-xs font-mono">{pct}%</span>
    </div>
  );
}

export function AgentOutputPanel({ output, loading, agentLabel }: Props) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const navigate    = useNavigate();
  const addToShelf  = useAddToShelf();
  const createDraft = useCreateDraft();
  const { selectedDraftId, selectDraft } = useUIStore();

  const handleSendToShelf = () => {
    if (!output) return;
    const doSend = (draftId: number) => {
      addToShelf.mutate({
        draftId,
        shelfType: 'ai_output',
        title:     `${agentLabel} — פלט AI`,
        contentHe: output.result.slice(0, 2000),
      });
    };
    if (selectedDraftId) {
      doSend(selectedDraftId);
    } else {
      createDraft.mutate({ title: 'טיוטה חדשה' }, {
        onSuccess: (d) => { selectDraft(d.id); doSend(d.id); navigate(`/drafting/${d.id}`); },
      });
    }
  };

  if (loading) {
    return (
      <div className="cyber-panel p-6 flex items-center gap-3" dir="rtl">
        <RobotIcon size={20} weight="duotone" className="text-gold animate-pulse" />
        <span className="text-parchment/60">מעבד — {agentLabel}...</span>
      </div>
    );
  }

  if (!output) return null;

  return (
    <div className="cyber-panel flex flex-col gap-4" dir="rtl">
      <div className="cyber-panel-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RobotIcon size={16} weight="duotone" className="text-gold" />
          <span className="text-parchment font-bold text-sm">{agentLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {!output.ollamaAvailable && (
            <span className="badge badge-warning text-[10px]">Ollama לא זמין</span>
          )}
          {output.flagForReview && (
            <span className="badge badge-error text-[10px] flex items-center gap-1">
              <WarningIcon size={10} />
              נדרשת אימות עורך דין
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pb-2 flex flex-col gap-3">
        {/* Confidence */}
        <div className="flex flex-col gap-1">
          <span className="text-parchment/40 text-xs">ביטחון</span>
          <ConfBar value={output.confidence} />
        </div>

        {/* Result */}
        <div className="flex flex-col gap-1">
          <span className="text-parchment/40 text-xs">תוצאה</span>
          <ResultBody result={output.result} />
        </div>

        {/* Tools accordion */}
        {output.toolResults.length > 0 && (
          <div>
            <button
              className="flex items-center gap-2 text-parchment/40 text-xs hover:text-parchment/60"
              onClick={() => setToolsOpen((o) => !o)}
            >
              <WrenchIcon size={12} />
              {output.toolResults.length} כלים בוצעו
              {toolsOpen ? <CaretUpIcon size={12} /> : <CaretDownIcon size={12} />}
            </button>
            {toolsOpen && (
              <div className="mt-2 flex flex-col gap-1">
                {output.toolResults.map((tr, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded px-3 py-1.5"
                    style={{ background: 'rgba(10,18,38,0.4)' }}
                  >
                    <span className="text-parchment/70 text-xs font-mono">{tr.toolName}</span>
                    <div className="flex items-center gap-2">
                      {tr.error && <span className="text-[10px]" style={{ color: 'var(--danger)' }}>שגיאה</span>}
                      <span className="text-parchment/40 text-[10px]">{tr.durationMs}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-parchment/10">
          <span className="text-parchment/30 text-[10px] font-mono">
            {output.durationMs}ms · {output.traceId.slice(0, 8)}
          </span>
          <button
            onClick={handleSendToShelf}
            className="flex items-center gap-1 text-[11px] px-2 py-1 text-gold bg-gold/10 border border-gold/20 rounded hover:bg-gold/20 transition-colors"
          >
            <PlusCircleIcon size={11} />
            שלח למדף
          </button>
        </div>
      </div>
    </div>
  );
}
