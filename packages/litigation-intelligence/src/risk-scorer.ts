import type { DbHandle, RiskFactor, RiskScore } from './types.js';
import { getCaseCompleteness } from './completeness.js';

interface HearingRow {
  hearing_date: string;
}

interface CountRow {
  cnt: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sevenDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

export function scoreCase(
  caseId:  number,
  db:      DbHandle,
  opts?:   { agentName?: string; traceId?: string },
): RiskScore {
  const agentName = opts?.agentName ?? 'litigation-intelligence';
  const traceId   = opts?.traceId   ?? `trace-${caseId}-${Date.now()}`;

  // 1. Completeness
  const completeness = getCaseCompleteness(caseId, db);
  const completenessScore = completeness.score; // 0=worst, 1=best → invert for risk

  // 2. Upcoming hearings within 7 days
  const now         = nowIso();
  const weekOut     = sevenDaysFromNow();
  const hearings    = db.prepare(
    `SELECT hearing_date FROM court_hearings
      WHERE case_id = ? AND hearing_date > ? AND hearing_date <= ?`,
  ).all(caseId, now, weekOut) as HearingRow[];
  const upcomingCount = hearings.length;

  // 3. Evidence count
  const evidenceRow = db.prepare(
    `SELECT COUNT(*) AS cnt FROM EvidenceItems WHERE case_id = ?`,
  ).get(caseId) as CountRow | undefined;
  const evidenceCount = evidenceRow?.cnt ?? 0;

  // 4. Unresolved tasks
  const tasksRow = db.prepare(
    `SELECT COUNT(*) AS cnt FROM Tasks WHERE case_id = ? AND status != 'done'`,
  ).get(caseId) as CountRow | undefined;
  const openTaskCount = tasksRow?.cnt ?? 0;

  // Build factors
  const factors: RiskFactor[] = [];

  // Completeness-based risk
  if (completeness.totalSteps > 0) {
    const missingRatio = 1 - completenessScore;
    if (missingRatio >= 0.5) {
      factors.push({
        factor:      'procedural_completeness',
        severity:    'critical',
        description: `${completeness.missingSteps.length + completeness.overdueSteps.length} procedural steps missing or overdue out of ${completeness.totalSteps}`,
      });
    } else if (missingRatio >= 0.25) {
      factors.push({
        factor:      'procedural_completeness',
        severity:    'high',
        description: `${completeness.missingSteps.length + completeness.overdueSteps.length} procedural steps incomplete`,
      });
    } else if (missingRatio > 0) {
      factors.push({
        factor:      'procedural_completeness',
        severity:    'medium',
        description: `Some procedural steps still pending`,
      });
    }
  }

  // Overdue steps
  if (completeness.overdueSteps.length > 0) {
    factors.push({
      factor:      'overdue_steps',
      severity:    'critical',
      description: `${completeness.overdueSteps.length} step(s) overdue`,
    });
  }

  // Upcoming hearings
  if (upcomingCount > 0) {
    factors.push({
      factor:      'upcoming_hearing',
      severity:    'high',
      description: `${upcomingCount} court hearing(s) within the next 7 days`,
    });
  }

  // Evidence presence
  if (evidenceCount === 0) {
    factors.push({
      factor:      'no_evidence',
      severity:    'high',
      description: 'No evidence items found for this case',
    });
  }

  // Task overload
  if (openTaskCount >= 10) {
    factors.push({
      factor:      'task_overload',
      severity:    'medium',
      description: `${openTaskCount} open tasks — high workload`,
    });
  } else if (openTaskCount >= 5) {
    factors.push({
      factor:      'task_overload',
      severity:    'low',
      description: `${openTaskCount} open tasks`,
    });
  }

  // Weighted score (0=no risk, 1=highest risk)
  // completeness 40%: risk = 1 - completenessScore
  // upcoming deadlines 30%: risk = min(1, upcomingCount / 2)
  // evidence presence 20%: risk = evidenceCount === 0 ? 1 : 0
  // task overload 10%: risk = min(1, openTaskCount / 10)
  const completenessRisk  = completeness.totalSteps === 0 ? 0 : 1 - completenessScore;
  const hearingRisk       = Math.min(1, upcomingCount / 2);
  const evidenceRisk      = evidenceCount === 0 ? 1 : 0;
  const taskRisk          = Math.min(1, openTaskCount / 10);

  const score =
    completenessRisk * 0.4 +
    hearingRisk      * 0.3 +
    evidenceRisk     * 0.2 +
    taskRisk         * 0.1;

  return { caseId, score, factors, agentName, traceId };
}

export function persistRiskScore(score: RiskScore, db: DbHandle): number {
  const result = db.prepare(
    `INSERT INTO RiskAssessments (case_id, risk_score, risk_factors, agent_name, trace_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    score.caseId,
    score.score,
    JSON.stringify(score.factors),
    score.agentName,
    score.traceId,
  );

  const id = result.lastInsertRowid;
  return typeof id === 'bigint' ? Number(id) : id;
}
