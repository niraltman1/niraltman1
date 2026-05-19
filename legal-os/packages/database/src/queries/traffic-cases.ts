import type { DatabaseConnection } from '../connection.js';

export type TrafficLifecycleState =
  | 'request_to_stand_trial'
  | 'police_ingestion'
  | 'summons_issued'
  | 'closed'
  | 'statute_lapsed';

export interface TrafficCase {
  readonly id:                  number;
  readonly caseId:              number;
  readonly lifecycleState:      TrafficLifecycleState;
  readonly requestDate:         string | null;
  readonly ingestionDate:       string | null;
  readonly summonsDate:         string | null;
  readonly closedDate:          string | null;
  readonly statuteDeadline:     string | null;   // computed column from DB
  readonly rejectionDetected:   boolean;
  readonly rejectionKeywords:   string[] | null;
  readonly rejectionExcerpt:    string | null;
  readonly rejectionDocumentId: number | null;
  readonly policeFileNumber:       string | null;
  readonly prosecutionEntity:      string | null;
  readonly offenseDescription:     string | null;
  readonly notes:                  string | null;
  readonly drivingLicenseNumber:   string | null;
  readonly identityNodeType:       'id_number' | 'driving_license' | 'passport';
  readonly createdAt:              string;
  readonly updatedAt:              string;
}

export interface TrafficCaseAlert {
  readonly caseId:           number;
  readonly caseTitleHe:      string;
  readonly caseNumber:       string;
  readonly clientName:       string;
  readonly lifecycleState:   TrafficLifecycleState;
  readonly daysRemaining:    number | null;
  readonly rejectionDetected: boolean;
  readonly rejectionKeywords: string[] | null;
  readonly statuteDeadline:  string | null;
}

export interface CreateTrafficCaseInput {
  caseId:              number;
  requestDate?:        string | null;
  ingestionDate?:      string | null;
  policeFileNumber?:   string | null;
  prosecutionEntity?:  string | null;
  offenseDescription?: string | null;
  notes?:              string | null;
}

const NOW = () => new Date().toISOString();

function mapRow(r: Record<string, unknown>): TrafficCase {
  let rejectionKeywords: string[] | null = null;
  if (r['rejection_keywords']) {
    try { rejectionKeywords = JSON.parse(r['rejection_keywords'] as string) as string[]; }
    catch { rejectionKeywords = null; }
  }
  return {
    id:                  r['id'] as number,
    caseId:              r['case_id'] as number,
    lifecycleState:      r['lifecycle_state'] as TrafficLifecycleState,
    requestDate:         r['request_date'] as string | null,
    ingestionDate:       r['ingestion_date'] as string | null,
    summonsDate:         r['summons_date'] as string | null,
    closedDate:          r['closed_date'] as string | null,
    statuteDeadline:     r['statute_deadline'] as string | null,
    rejectionDetected:   !!(r['rejection_detected'] as number),
    rejectionKeywords,
    rejectionExcerpt:    r['rejection_excerpt'] as string | null,
    rejectionDocumentId: r['rejection_document_id'] as number | null,
    policeFileNumber:      r['police_file_number'] as string | null,
    prosecutionEntity:     r['prosecution_entity'] as string | null,
    offenseDescription:    r['offense_description'] as string | null,
    notes:                 r['notes'] as string | null,
    drivingLicenseNumber:  r['driving_license_number'] as string | null,
    identityNodeType:      (r['identity_node_type'] as 'id_number'|'driving_license'|'passport') ?? 'id_number',
    createdAt:             r['created_at'] as string,
    updatedAt:             r['updated_at'] as string,
  };
}

export class TrafficCasesRepository {
  constructor(private readonly db: DatabaseConnection) {}

  findByCaseId(caseId: number): TrafficCase | null {
    const row = this.db
      .prepare('SELECT * FROM TrafficCases WHERE case_id = ?')
      .get(caseId) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  findById(id: number): TrafficCase | null {
    const row = this.db
      .prepare('SELECT * FROM TrafficCases WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  }

  create(input: CreateTrafficCaseInput): TrafficCase {
    const now = NOW();
    const res = this.db.prepare(`
      INSERT INTO TrafficCases
        (case_id, request_date, ingestion_date, police_file_number,
         prosecution_entity, offense_description, notes,
         created_at, updated_at)
      VALUES
        (@caseId, @requestDate, @ingestionDate, @policeFileNumber,
         @prosecutionEntity, @offenseDescription, @notes,
         @now, @now)
    `).run({
      caseId:             input.caseId,
      requestDate:        input.requestDate        ?? null,
      ingestionDate:      input.ingestionDate      ?? null,
      policeFileNumber:   input.policeFileNumber   ?? null,
      prosecutionEntity:  input.prosecutionEntity  ?? null,
      offenseDescription: input.offenseDescription ?? null,
      notes:              input.notes              ?? null,
      now,
    }) as { lastInsertRowid: number | bigint };
    return this.findById(Number(res.lastInsertRowid))!;
  }

  /**
   * Advance the state machine. Automatically sets the relevant date field
   * and updates statute_deadline if ingestion_date is being set.
   */
  transitionState(
    caseId: number,
    newState: TrafficLifecycleState,
    stateDate?: string | null,
  ): TrafficCase | null {
    const now = NOW();
    const date = stateDate ?? now.slice(0, 10);

    const dateField: Record<TrafficLifecycleState, string | null> = {
      request_to_stand_trial: 'request_date',
      police_ingestion:       'ingestion_date',
      summons_issued:         'summons_date',
      closed:                 'closed_date',
      statute_lapsed:         null,
    };

    const field = dateField[newState];
    if (field) {
      this.db.prepare(`
        UPDATE TrafficCases
           SET lifecycle_state = @state, ${field} = @date, updated_at = @now
         WHERE case_id = @caseId
      `).run({ state: newState, date, now, caseId });
    } else {
      this.db.prepare(`
        UPDATE TrafficCases
           SET lifecycle_state = @state, updated_at = @now
         WHERE case_id = @caseId
      `).run({ state: newState, now, caseId });
    }
    return this.findByCaseId(caseId);
  }

  markRejection(
    caseId:     number,
    keywords:   string[],
    excerpt:    string,
    documentId: number | null,
  ): void {
    const now = NOW();
    this.db.prepare(`
      UPDATE TrafficCases
         SET rejection_detected = 1,
             rejection_keywords = @keywords,
             rejection_excerpt  = @excerpt,
             rejection_document_id = @docId,
             updated_at = @now
       WHERE case_id = @caseId
    `).run({
      keywords:  JSON.stringify(keywords),
      excerpt:   excerpt.slice(0, 1000),
      docId:     documentId,
      now,
      caseId,
    });
  }

  clearRejection(caseId: number): void {
    const now = NOW();
    this.db.prepare(`
      UPDATE TrafficCases
         SET rejection_detected = 0, rejection_keywords = NULL,
             rejection_excerpt = NULL, rejection_document_id = NULL,
             updated_at = ?
       WHERE case_id = ?
    `).run(now, caseId);
  }

  /**
   * Returns all cases that are:
   *   a) Active (not closed/lapsed) + within `daysWarning` of statute deadline, OR
   *   b) Have a rejection detected
   */
  getAlerts(daysWarning = 90): TrafficCaseAlert[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysWarning);
    const cutoffStr = cutoff.toISOString();
    const nowStr    = new Date().toISOString();

    type Row = Record<string, unknown>;
    const rows = this.db.prepare(`
      SELECT
        tc.*,
        c.title_he   AS case_title_he,
        c.case_number,
        cl.name_he   AS client_name,
        CASE
          WHEN tc.statute_deadline IS NOT NULL
          THEN CAST(
            (julianday(tc.statute_deadline) - julianday(@now))
            AS INTEGER
          )
          ELSE NULL
        END AS days_remaining
      FROM TrafficCases tc
      JOIN Cases   c  ON c.id  = tc.case_id
      JOIN Clients cl ON cl.id = c.client_id
      WHERE tc.lifecycle_state NOT IN ('closed','statute_lapsed')
        AND (
          tc.rejection_detected = 1
          OR (tc.statute_deadline IS NOT NULL AND tc.statute_deadline <= @cutoff)
        )
      ORDER BY tc.statute_deadline ASC NULLS LAST
    `).all({ now: nowStr, cutoff: cutoffStr }) as Row[];

    return rows.map((r): TrafficCaseAlert => {
      let rejKw: string[] | null = null;
      if (r['rejection_keywords']) {
        try { rejKw = JSON.parse(r['rejection_keywords'] as string) as string[]; }
        catch { rejKw = null; }
      }
      return {
        caseId:            r['case_id'] as number,
        caseTitleHe:       r['case_title_he'] as string,
        caseNumber:        r['case_number'] as string,
        clientName:        r['client_name'] as string,
        lifecycleState:    r['lifecycle_state'] as TrafficLifecycleState,
        daysRemaining:     r['days_remaining'] as number | null,
        rejectionDetected: !!(r['rejection_detected'] as number),
        rejectionKeywords: rejKw,
        statuteDeadline:   r['statute_deadline'] as string | null,
      };
    });
  }

  /** Auto-advance any 'police_ingestion' cases past their deadline to 'statute_lapsed'. */
  checkAndLapseExpired(): number {
    const now = NOW();
    const result = this.db.prepare(`
      UPDATE TrafficCases
         SET lifecycle_state = 'statute_lapsed', updated_at = @now
       WHERE lifecycle_state = 'police_ingestion'
         AND statute_deadline IS NOT NULL
         AND statute_deadline < @now
    `).run({ now }) as { changes: number };
    return result.changes;
  }

  updateMetadata(caseId: number, patch: {
    policeFileNumber?:    string | null;
    prosecutionEntity?:  string | null;
    offenseDescription?: string | null;
    notes?:              string | null;
  }): void {
    const now = NOW();
    this.db.prepare(`
      UPDATE TrafficCases
         SET police_file_number   = COALESCE(@policeFileNumber,   police_file_number),
             prosecution_entity   = COALESCE(@prosecutionEntity,  prosecution_entity),
             offense_description  = COALESCE(@offenseDescription, offense_description),
             notes                = COALESCE(@notes, notes),
             updated_at           = @now
       WHERE case_id = @caseId
    `).run({
      policeFileNumber:   patch.policeFileNumber   ?? null,
      prosecutionEntity:  patch.prosecutionEntity  ?? null,
      offenseDescription: patch.offenseDescription ?? null,
      notes:              patch.notes              ?? null,
      now,
      caseId,
    });
  }
}
