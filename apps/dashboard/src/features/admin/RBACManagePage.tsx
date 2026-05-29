import { useState, useCallback, useEffect } from 'react';
import {
  CircleNotchIcon, ArrowsClockwiseIcon, UserPlusIcon,
  ProhibitIcon, ShieldCheckIcon,
} from '@phosphor-icons/react';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

type SystemMode = 'single' | 'multi';

interface Assignment {
  id:         number;
  caseId:     number;
  userId:     number;
  username:   string;
  role:       string;
  assignedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  API helpers (plain fetch — same pattern as JournalPage)
// ─────────────────────────────────────────────────────────────────────────────

async function apiGet<T>(path: string): Promise<T> {
  const res  = await fetch(path);
  const body = await res.json() as { success: boolean; data: T; error?: { message: string } };
  if (!body.success) throw new Error(body.error?.message ?? 'שגיאת שרת');
  return body.data;
}

async function apiPost<T>(path: string, payload?: unknown): Promise<T> {
  const res = await fetch(path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload ?? {}),
  });
  const body = await res.json() as { success: boolean; data: T; error?: { message: string } };
  if (!body.success) throw new Error(body.error?.message ?? 'שגיאת שרת');
  return body.data;
}

async function apiDelete<T>(path: string): Promise<T> {
  const res  = await fetch(path, { method: 'DELETE' });
  const body = await res.json() as { success: boolean; data: T; error?: { message: string } };
  if (!body.success) throw new Error(body.error?.message ?? 'שגיאת שרת');
  return body.data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  System Mode panel
// ─────────────────────────────────────────────────────────────────────────────

function SystemModePanel() {
  const [mode,    setMode]    = useState<SystemMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const fetchMode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ mode: SystemMode }>('/api/admin/system-mode');
      setMode(data.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchMode(); }, [fetchMode]);

  const toggle = async () => {
    if (!mode) return;
    const next: SystemMode = mode === 'single' ? 'multi' : 'single';
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost<{ mode: SystemMode }>('/api/admin/system-mode', { mode: next });
      setMode(data.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded px-3 py-2 text-red-400 text-xs">
          {error}
        </div>
      )}

      {loading && !mode && (
        <div className="flex items-center gap-2 text-parchment/40 text-sm py-4 justify-center">
          <CircleNotchIcon size={14} className="animate-spin" />
          טוען…
        </div>
      )}

      {mode && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              mode === 'single'
                ? 'bg-gold/20 text-gold'
                : 'bg-blue-400/20 text-blue-300'
            }`}>
              <ShieldCheckIcon size={12} weight="duotone" />
              {mode === 'single' ? 'מצב יחיד (single)' : 'מצב רב-משתמשים (multi)'}
            </span>
            <button
              onClick={() => void toggle()}
              disabled={loading}
              className="px-3 py-1.5 bg-parchment/10 hover:bg-parchment/20 text-parchment/70
                         text-xs rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? <CircleNotchIcon size={12} className="animate-spin" /> : <ArrowsClockwiseIcon size={12} />}
              {mode === 'single' ? 'עבור למצב רב-משתמשים' : 'עבור למצב יחיד'}
            </button>
          </div>

          {mode === 'single' && (
            <div className="flex items-start gap-2 bg-gold/10 border border-gold/20 rounded px-3 py-2 text-gold text-xs">
              <ShieldCheckIcon size={14} className="shrink-0 mt-0.5" weight="duotone" />
              <span>המערכת פועלת במצב משתמש יחיד — כל עורך דין מורשה לגשת לכל תיק</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Case Assignments panel
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_OPTIONS = ['viewer', 'editor', 'owner', 'admin'];

function CaseAssignmentsPanel() {
  const [caseIdInput, setCaseIdInput] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [searched,    setSearched]    = useState(false);

  // Add form state
  const [addUserId, setAddUserId] = useState('');
  const [addRole,   setAddRole]   = useState('viewer');
  const [addLoading, setAddLoading] = useState(false);
  const [addError,   setAddError]   = useState<string | null>(null);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (caseIdInput.trim()) params.set('caseId', caseIdInput.trim());
      const data = await apiGet<{ assignments: Assignment[] }>(
        `/api/admin/case-assignments?${params.toString()}`,
      );
      setAssignments(data.assignments);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [caseIdInput]);

  const revoke = async (id: number) => {
    try {
      await apiDelete(`/api/admin/case-assignments/${id}`);
      setAssignments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const addAssignment = async () => {
    const caseId = parseInt(caseIdInput.trim(), 10);
    const userId = parseInt(addUserId.trim(), 10);
    if (isNaN(caseId) || isNaN(userId)) {
      setAddError('יש להזין מספר תיק ומזהה משתמש תקינים');
      return;
    }
    setAddLoading(true);
    setAddError(null);
    try {
      await apiPost('/api/admin/case-assignments', { caseId, userId, role: addRole });
      setAddUserId('');
      await fetchAssignments();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-parchment/40">מספר תיק</label>
          <input
            type="number"
            value={caseIdInput}
            onChange={(e) => setCaseIdInput(e.target.value)}
            placeholder="הכל"
            dir="ltr"
            className="bg-navy-900/50 border border-parchment/10 rounded px-2 py-1.5
                       text-parchment text-xs placeholder:text-parchment/30 outline-none
                       focus:border-gold/40 w-28"
          />
        </div>
        <button
          onClick={() => void fetchAssignments()}
          disabled={loading}
          className="px-3 py-1.5 bg-gold/20 hover:bg-gold/30 text-gold text-xs rounded
                     transition-colors disabled:opacity-50 flex items-center gap-1.5
                     border border-gold/30"
        >
          {loading ? <CircleNotchIcon size={12} className="animate-spin" /> : <ArrowsClockwiseIcon size={12} />}
          טען שיוכים
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded px-3 py-2 text-red-400 text-xs">
          {error}
        </div>
      )}

      {/* Assignments table */}
      {searched && (
        <>
          {assignments.length === 0
            ? (
              <div className="text-center py-8 text-parchment/30 text-sm">
                אין שיוכים פעילים
              </div>
            )
            : (
              <div className="overflow-x-auto rounded border border-parchment/10">
                <table className="w-full text-right">
                  <thead>
                    <tr className="border-b border-parchment/10 bg-navy-900/20">
                      <th className="px-3 py-2 text-xs font-medium text-parchment/40">שם משתמש</th>
                      <th className="px-3 py-2 text-xs font-medium text-parchment/40">תיק</th>
                      <th className="px-3 py-2 text-xs font-medium text-parchment/40">תפקיד</th>
                      <th className="px-3 py-2 text-xs font-medium text-parchment/40">תאריך שיוך</th>
                      <th className="px-3 py-2 text-xs font-medium text-parchment/40">פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id} className="border-b border-parchment/5 hover:bg-parchment/5 transition-colors">
                        <td className="px-3 py-2 text-xs text-parchment/80 font-mono">{a.username}</td>
                        <td className="px-3 py-2 text-xs text-parchment/60 font-mono">{a.caseId}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px]
                                           bg-blue-400/10 text-blue-300 border border-blue-400/20">
                            {a.role}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-parchment/40">
                          {new Date(a.assignedAt).toLocaleDateString('he-IL')}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => void revoke(a.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px]
                                       text-red-400 hover:text-red-300 transition-colors"
                          >
                            <ProhibitIcon size={10} />
                            ביטול גישה
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          {/* Add assignment form (only in multi mode when caseId is set) */}
          {caseIdInput.trim() && (
            <div className="bg-navy-900/30 border border-parchment/10 rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-semibold text-parchment/60 flex items-center gap-1.5">
                <UserPlusIcon size={12} className="text-gold" />
                הוספת שיוך לתיק {caseIdInput}
              </h3>
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-parchment/40">מזהה משתמש</label>
                  <input
                    type="number"
                    value={addUserId}
                    onChange={(e) => setAddUserId(e.target.value)}
                    placeholder="User ID"
                    dir="ltr"
                    className="bg-navy-900/50 border border-parchment/10 rounded px-2 py-1.5
                               text-parchment text-xs placeholder:text-parchment/30 outline-none
                               focus:border-gold/40 w-28"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-parchment/40">תפקיד</label>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value)}
                    dir="ltr"
                    className="bg-navy-900/50 border border-parchment/10 rounded px-2 py-1.5
                               text-parchment text-xs outline-none focus:border-gold/40"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => void addAssignment()}
                  disabled={addLoading || !addUserId.trim()}
                  className="px-3 py-1.5 bg-gold/20 hover:bg-gold/30 text-gold text-xs rounded
                             transition-colors disabled:opacity-50 flex items-center gap-1.5
                             border border-gold/30"
                >
                  {addLoading ? <CircleNotchIcon size={12} className="animate-spin" /> : <UserPlusIcon size={12} />}
                  הוסף
                </button>
              </div>
              {addError && (
                <div className="bg-red-900/20 border border-red-700/30 rounded px-3 py-2 text-red-400 text-xs">
                  {addError}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Section wrapper (same as DiagnosticsPage)
// ─────────────────────────────────────────────────────────────────────────────

function Section({ icon, title, children }: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-navy-100 border border-parchment/10 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-parchment/10">
        <span className="text-gold">{icon}</span>
        <h2 className="text-sm font-semibold text-parchment">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────────────────────────────

export function RBACManagePage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-serif font-bold text-parchment">ניהול גישה והרשאות</h1>
        <p className="text-parchment/50 text-sm mt-1">
          מצב מערכת, שיוך תיקים למשתמשים וביטול הרשאות
        </p>
      </div>

      <Section icon={<ShieldCheckIcon size={16} weight="duotone" />} title="מצב מערכת">
        <SystemModePanel />
      </Section>

      <Section icon={<UserPlusIcon size={16} weight="duotone" />} title="שיוכי תיקים">
        <CaseAssignmentsPanel />
      </Section>
    </div>
  );
}
