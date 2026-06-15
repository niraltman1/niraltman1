import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  RobotIcon, BookOpenIcon, ClockIcon, MagnifyingGlassIcon,
  FileTextIcon, ShieldCheckIcon, ScalesIcon, WarningIcon, CalendarIcon, UserPlusIcon,
  NotePencilIcon, EnvelopeSimpleIcon, EyeIcon,
} from '@phosphor-icons/react';
import { AgentOutputPanel } from '../../components/common/AgentOutputPanel.js';
import {
  useCases,
  useAgentSummarize, useAgentTimeline, useAgentResearch,
  useAgentContractReview, useAgentDiscovery,
  useAgentInsolvency, useAgentDeadlineAnalysis, useAgentHearingPrep, useAgentCaseIntake,
  useAgentDraftMotion, useAgentDraftLetter, useAgentEvidenceReview,
  useAgentStream,
} from '../../api/hooks.js';
import type { AgentOutput, CaseIntakeInput, MotionType, RecipientType } from '../../api/hooks.js';

const AGENTS = [
  // Priority A
  { id: 'insolvency',        label: 'חדלות פירעון',        Icon: ScalesIcon,          requiresCase: true,  requiresDoc: false, isResearch: false, isHearingPrep: false, isIntake: false, isDraftMotion: false, isDraftLetter: false },
  { id: 'deadline-analysis', label: 'ניתוח מועדים',         Icon: WarningIcon,         requiresCase: true,  requiresDoc: false, isResearch: false, isHearingPrep: false, isIntake: false, isDraftMotion: false, isDraftLetter: false },
  { id: 'hearing-prep',      label: 'הכנה לדיון',           Icon: CalendarIcon,        requiresCase: true,  requiresDoc: false, isResearch: false, isHearingPrep: true,  isIntake: false, isDraftMotion: false, isDraftLetter: false },
  { id: 'case-intake',       label: 'קליטת תיק חדש',        Icon: UserPlusIcon,        requiresCase: false, requiresDoc: false, isResearch: false, isHearingPrep: false, isIntake: true,  isDraftMotion: false, isDraftLetter: false },
  // Priority B
  { id: 'draft-motion',      label: 'טיוטת בקשה/סיכומים',  Icon: NotePencilIcon,      requiresCase: true,  requiresDoc: false, isResearch: false, isHearingPrep: false, isIntake: false, isDraftMotion: true,  isDraftLetter: false },
  { id: 'draft-letter',      label: 'טיוטת מכתב',           Icon: EnvelopeSimpleIcon,  requiresCase: true,  requiresDoc: false, isResearch: false, isHearingPrep: false, isIntake: false, isDraftMotion: false, isDraftLetter: true  },
  { id: 'evidence-review',   label: 'סקירת ראיות',           Icon: EyeIcon,             requiresCase: true,  requiresDoc: false, isResearch: false, isHearingPrep: false, isIntake: false, isDraftMotion: false, isDraftLetter: false },
  // Existing
  { id: 'summarize',         label: 'סיכום תיק',            Icon: BookOpenIcon,        requiresCase: true,  requiresDoc: false, isResearch: false, isHearingPrep: false, isIntake: false, isDraftMotion: false, isDraftLetter: false },
  { id: 'timeline',          label: 'ציר זמן',               Icon: ClockIcon,           requiresCase: true,  requiresDoc: false, isResearch: false, isHearingPrep: false, isIntake: false, isDraftMotion: false, isDraftLetter: false },
  { id: 'discovery',         label: 'גילוי ראיות',            Icon: ShieldCheckIcon,     requiresCase: true,  requiresDoc: false, isResearch: false, isHearingPrep: false, isIntake: false, isDraftMotion: false, isDraftLetter: false },
  { id: 'contract-review',   label: 'סקירת חוזה',             Icon: FileTextIcon,        requiresCase: false, requiresDoc: true,  isResearch: false, isHearingPrep: false, isIntake: false, isDraftMotion: false, isDraftLetter: false },
  { id: 'research',          label: 'מחקר משפטי',             Icon: MagnifyingGlassIcon, requiresCase: false, requiresDoc: false, isResearch: true,  isHearingPrep: false, isIntake: false, isDraftMotion: false, isDraftLetter: false },
] as const;

type AgentId = typeof AGENTS[number]['id'];

export function AgentsWorkspacePage() {
  const [searchParams] = useSearchParams();
  const initCaseId  = searchParams.get('caseId')  ? Number(searchParams.get('caseId'))  : null;
  const initDocId   = searchParams.get('documentId') ? Number(searchParams.get('documentId')) : null;
  const initAgentId = (searchParams.get('agentId') as AgentId | null) ?? (initDocId ? 'contract-review' : 'summarize');

  const [activeAgent, setActiveAgent]   = useState<AgentId>(initAgentId);
  const [selectedCase, setSelectedCase] = useState<number | null>(initCaseId);
  const [selectedDoc,  setSelectedDoc]  = useState<number | null>(initDocId);
  const [question,     setQuestion]     = useState('');
  const [hearingId,      setHearingId]      = useState<number | null>(null);
  const [intakeFacts,    setIntakeFacts]    = useState('');
  const [intakeName,     setIntakeName]     = useState('');
  const [motionType,     setMotionType]     = useState<MotionType>('general');
  const [recipientType,  setRecipientType]  = useState<RecipientType>('client');
  const [result,       setResult]       = useState<AgentOutput | null>(null);
  const [streamMode,   setStreamMode]   = useState(false);

  const { data: casesData } = useCases(1, 200);
  const cases = casesData?.items ?? [];

  const summarize        = useAgentSummarize();
  const timeline         = useAgentTimeline();
  const discovery        = useAgentDiscovery();
  const contractReview   = useAgentContractReview();
  const research         = useAgentResearch();
  const insolvency       = useAgentInsolvency();
  const deadlineAnalysis = useAgentDeadlineAnalysis();
  const hearingPrep      = useAgentHearingPrep();
  const caseIntake       = useAgentCaseIntake();
  const draftMotion      = useAgentDraftMotion();
  const draftLetter      = useAgentDraftLetter();
  const evidenceReview   = useAgentEvidenceReview();

  const { state: streamState, start: startStream, reset: resetStream } = useAgentStream();

  const activeAgentDef = AGENTS.find((a) => a.id === activeAgent)!;
  const isLoading =
    summarize.isPending || timeline.isPending || discovery.isPending ||
    contractReview.isPending || research.isPending ||
    insolvency.isPending || deadlineAnalysis.isPending || hearingPrep.isPending || caseIntake.isPending ||
    draftMotion.isPending || draftLetter.isPending || evidenceReview.isPending;

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
    } else if (activeAgent === 'insolvency' && selectedCase !== null) {
      insolvency.mutate(selectedCase, { onSuccess, onError });
    } else if (activeAgent === 'deadline-analysis' && selectedCase !== null) {
      deadlineAnalysis.mutate(selectedCase, { onSuccess, onError });
    } else if (activeAgent === 'hearing-prep' && selectedCase !== null && hearingId !== null) {
      hearingPrep.mutate({ caseId: selectedCase, hearingId }, { onSuccess, onError });
    } else if (activeAgent === 'case-intake' && intakeName.trim() && intakeFacts.trim()) {
      const payload: CaseIntakeInput = {
        clientName:     intakeName.trim(),
        factsNarrative: intakeFacts.trim(),
        ...(selectedCase !== null ? { clientId: selectedCase } : {}),
      };
      caseIntake.mutate(payload, { onSuccess, onError });
    } else if (activeAgent === 'draft-motion' && selectedCase !== null) {
      draftMotion.mutate({ caseId: selectedCase, motionType }, { onSuccess, onError });
    } else if (activeAgent === 'draft-letter' && selectedCase !== null) {
      draftLetter.mutate({ caseId: selectedCase, recipientType }, { onSuccess, onError });
    } else if (activeAgent === 'evidence-review' && selectedCase !== null) {
      evidenceReview.mutate(selectedCase, { onSuccess, onError });
    }
  };

  const canRun =
    (activeAgent === 'summarize'         && selectedCase !== null) ||
    (activeAgent === 'timeline'          && selectedCase !== null) ||
    (activeAgent === 'discovery'         && selectedCase !== null) ||
    (activeAgent === 'contract-review'   && selectedDoc  !== null) ||
    (activeAgent === 'research'          && question.trim().length > 0) ||
    (activeAgent === 'insolvency'        && selectedCase !== null) ||
    (activeAgent === 'deadline-analysis' && selectedCase !== null) ||
    (activeAgent === 'hearing-prep'      && selectedCase !== null && hearingId !== null) ||
    (activeAgent === 'case-intake'       && intakeName.trim().length > 0 && intakeFacts.trim().length > 10) ||
    (activeAgent === 'draft-motion'      && selectedCase !== null) ||
    (activeAgent === 'draft-letter'      && selectedCase !== null) ||
    (activeAgent === 'evidence-review'   && selectedCase !== null);

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

            {/* Hearing ID for hearing-prep */}
            {activeAgentDef.isHearingPrep && (
              <div className="flex flex-col gap-1">
                <label className="text-parchment/40 text-xs">מזהה דיון</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="מזהה דיון..."
                  value={hearingId ?? ''}
                  onChange={(e) => setHearingId(e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            )}

            {/* Case intake fields */}
            {activeAgentDef.isIntake && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-parchment/40 text-xs">שם הלקוח</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="שם הלקוח..."
                    value={intakeName}
                    onChange={(e) => setIntakeName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-parchment/40 text-xs">פירוט העובדות</label>
                  <textarea
                    className="form-input resize-none h-28"
                    placeholder="תאר את העובדות והנסיבות..."
                    value={intakeFacts}
                    onChange={(e) => setIntakeFacts(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Motion type for draft-motion */}
            {activeAgentDef.isDraftMotion && (
              <div className="flex flex-col gap-1">
                <label className="text-parchment/40 text-xs">סוג הבקשה</label>
                <select
                  className="form-input"
                  value={motionType}
                  onChange={(e) => setMotionType(e.target.value as MotionType)}
                >
                  <option value="general">כללי</option>
                  <option value="preliminary_injunction">צו מניעה זמני</option>
                  <option value="extension_of_time">הארכת מועד</option>
                  <option value="summary_judgment">פסק דין על הסף</option>
                  <option value="dismissal">מחיקה/דחייה</option>
                  <option value="evidence_exclusion">פסילת ראיה</option>
                </select>
              </div>
            )}

            {/* Recipient type for draft-letter */}
            {activeAgentDef.isDraftLetter && (
              <div className="flex flex-col gap-1">
                <label className="text-parchment/40 text-xs">נמען המכתב</label>
                <select
                  className="form-input"
                  value={recipientType}
                  onChange={(e) => setRecipientType(e.target.value as RecipientType)}
                >
                  <option value="client">ללקוח</option>
                  <option value="court">לבית המשפט</option>
                  <option value="opposing_counsel">לבא כוח הצד השני</option>
                  <option value="authority">לרשות</option>
                </select>
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
                aria-label={streamMode ? 'מצב הזרמה — לחץ לעבור למצב רגיל' : 'מצב רגיל — לחץ לעבור למצב הזרמה'}
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
