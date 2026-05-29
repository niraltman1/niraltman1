import { useState } from 'react';
import {
  RobotIcon, BookOpenIcon, ClockIcon, MagnifyingGlassIcon,
  FileTextIcon, ShieldCheckIcon,
} from '@phosphor-icons/react';
import { AgentOutputPanel } from '../../components/common/AgentOutputPanel.js';
import {
  useCases,
  useAgentSummarize, useAgentTimeline, useAgentResearch,
  useAgentContractReview, useAgentDiscovery,
  useAgentStream,
} from '../../api/hooks.js';
import type { AgentOutput } from '../../api/hooks.js';

const AGENTS = [
  { id: 'summarize',       label: 'סיכום תיק',    Icon: BookOpenIcon,        requiresCase: true,  requiresDoc: false, isResearch: false },
  { id: 'timeline',        label: 'ציר זמן',       Icon: ClockIcon,           requiresCase: true,  requiresDoc: false, isResearch: false },
  { id: 'discovery',       label: 'גילוי ראיות',   Icon: ShieldCheckIcon,     requiresCase: true,  requiresDoc: false, isResearch: false },
  { id: 'contract-review', label: 'סקירת חוזה',    Icon: FileTextIcon,        requiresCase: false, requiresDoc: true,  isResearch: false },
  { id: 'research',        label: 'מחקר משפטי',    Icon: MagnifyingGlassIcon, requiresCase: false, requiresDoc: false, isResearch: true  },
] as const;

type AgentId = typeof AGENTS[number]['id'];

export function AgentsWorkspacePage() {
  const [activeAgent, setActiveAgent]   = useState<AgentId>('summarize');
  const [selectedCase, setSelectedCase] = useState<number | null>(null);
  const [selectedDoc,  setSelectedDoc]  = useState<number | null>(null);
  const [question,     setQuestion]     = useState('');
  const [result,       setResult]       = useState<AgentOutput | null>(null);
  const [streamMode,   setStreamMode]   = useState(false);

  const { data: casesData } = useCases(1, 200);
  const cases = casesData?.items ?? [];

  const summarize      = useAgentSummarize();
  const timeline       = useAgentTimeline();
  const discovery      = useAgentDiscovery();
  const contractReview = useAgentContractReview();
  const research       = useAgentResearch();

  const { state: streamState, start: startStream, reset: resetStream } = useAgentStream();

  const activeAgentDef = AGENTS.find((a) => a.id === activeAgent)!;
  const isLoading =
    summarize.isPending || timeline.isPending || discovery.isPending ||
    contractReview.isPending || research.isPending;

  const handleRun = () => {
    if (streamMode) {
      if (activeAgent === 'summarize' && selectedCase !== null) {
        startStream('summarize', { caseId: selectedCase });
      } else if (activeAgent === 'timeline' && selectedCase !== null) {
        startStream('timeline', { caseId: selectedCase });
      } else if (activeAgent === 'discovery' && selectedCase !== null) {
        startStream('discovery', { caseId: selectedCase });
      } else if (activeAgent === 'contract-review' && selectedDoc !== null) {
        startStream('contract-review', { documentId: selectedDoc });
      } else if (activeAgent === 'research' && question.trim()) {
        startStream('research', {
          question: question.trim(),
          ...(selectedCase !== null ? { caseId: selectedCase } : {}),
        });
      }
      return;
    }

    const onSuccess = (data: AgentOutput) => setResult(data);
    const onError   = () => { /* errors visible via mutation state */ };

    if (activeAgent === 'summarize' && selectedCase !== null) {
      summarize.mutate(selectedCase, { onSuccess, onError });
    } else if (activeAgent === 'timeline' && selectedCase !== null) {
      timeline.mutate(selectedCase, { onSuccess, onError });
    } else if (activeAgent === 'discovery' && selectedCase !== null) {
      discovery.mutate(selectedCase, { onSuccess, onError });
    } else if (activeAgent === 'contract-review' && selectedDoc !== null) {
      contractReview.mutate(selectedDoc, { onSuccess, onError });
    } else if (activeAgent === 'research' && question.trim()) {
      research.mutate(
        { question: question.trim(), ...(selectedCase !== null ? { caseId: selectedCase } : {}) },
        { onSuccess, onError },
      );
    }
  };

  const canRun =
    (activeAgent === 'summarize'       && selectedCase !== null) ||
    (activeAgent === 'timeline'        && selectedCase !== null) ||
    (activeAgent === 'discovery'       && selectedCase !== null) ||
    (activeAgent === 'contract-review' && selectedDoc  !== null) ||
    (activeAgent === 'research'        && question.trim().length > 0);

  const effectiveResult = streamMode ? streamState.result : result;
  const effectiveLoading = streamMode ? streamState.isStreaming : isLoading;

  return (
    <div className="flex flex-col gap-6 p-6" dir="rtl">
      <div className="flex items-center gap-3">
        <RobotIcon size={24} weight="duotone" className="text-gold" />
        <div>
          <h1 className="text-parchment font-bold text-xl font-serif">סוכני AI</h1>
          <p className="text-parchment/40 text-sm">כלי בינה מלאכותית לניתוח משפטי — מקומי · law-il-E2B</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 items-start">
        {/* Left: Controls */}
        <div className="cyber-panel flex flex-col gap-4">
          <div className="cyber-panel-header">
            <span className="text-parchment/60 text-xs">בחר סוכן</span>
          </div>

          {/* Agent tabs */}
          <div className="px-4 flex flex-col gap-1">
            {AGENTS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => { setActiveAgent(id); setResult(null); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors border ${
                  activeAgent === id
                    ? 'border-gold/30 text-gold'
                    : 'border-transparent text-parchment/60 hover:text-parchment hover:bg-white/5'
                }`}
                style={activeAgent === id ? { background: 'rgba(91,224,212,0.10)' } : undefined}
              >
                <Icon size={16} weight="duotone" />
                {label}
              </button>
            ))}
          </div>

          <div className="px-4 pb-4 flex flex-col gap-3">
            {/* Case selector */}
            {(activeAgentDef.requiresCase || activeAgent === 'research') && (
              <div className="flex flex-col gap-1">
                <label className="text-parchment/40 text-xs">תיק</label>
                <select
                  className="form-input"
                  value={selectedCase ?? ''}
                  onChange={(e) => setSelectedCase(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">-- בחר תיק --</option>
                  {(cases as Array<{ id: number; titleHe?: string; caseNumber?: string }>).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.caseNumber ?? ''} {c.titleHe ?? ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Document selector for contract review */}
            {activeAgentDef.requiresDoc && (
              <div className="flex flex-col gap-1">
                <label className="text-parchment/40 text-xs">מסמך (ID)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="מזהה מסמך..."
                  value={selectedDoc ?? ''}
                  onChange={(e) => setSelectedDoc(e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            )}

            {/* Research question */}
            {activeAgent === 'research' && (
              <div className="flex flex-col gap-1">
                <label className="text-parchment/40 text-xs">שאלה משפטית</label>
                <textarea
                  className="form-input resize-none h-28"
                  placeholder="הזן שאלה משפטית..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                className="btn-primary flex-1 flex items-center justify-center gap-2"
                disabled={!canRun || effectiveLoading}
                onClick={handleRun}
              >
                <RobotIcon size={16} weight="duotone" />
                {effectiveLoading ? 'מעבד...' : 'הפעל סוכן'}
              </button>
              <button
                onClick={() => { setStreamMode(m => !m); resetStream(); setResult(null); }}
                className="px-2 py-1 text-xs rounded border border-parchment/20 text-parchment/50 hover:text-parchment/80"
              >
                {streamMode ? '📡 Streaming' : '⚡ Standard'}
              </button>
            </div>

            {streamMode && streamState.isStreaming && (
              <div className="space-y-1">
                <p className="text-xs text-parchment/60">{streamState.progress?.message ?? 'מתחבר…'}</p>
                <div className="h-1 bg-navy-100 rounded overflow-hidden">
                  <div className="h-full bg-gold transition-all" style={{ width: `${streamState.progress?.pct ?? 0}%` }} />
                </div>
              </div>
            )}

            {streamMode && streamState.error && (
              <p className="text-xs text-red-400">{streamState.error}</p>
            )}
          </div>
        </div>

        {/* Right: Output */}
        <div>
          {(effectiveLoading || effectiveResult) ? (
            <AgentOutputPanel
              output={effectiveResult}
              loading={effectiveLoading}
              agentLabel={activeAgentDef.label}
            />
          ) : (
            <div className="cyber-panel p-10 flex flex-col items-center gap-3 text-center">
              <RobotIcon size={40} weight="duotone" className="text-parchment/20" />
              <p className="text-parchment/30 text-sm">בחר סוכן ומלא את הפרמטרים להפעלה</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
