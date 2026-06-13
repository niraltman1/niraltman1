/**
 * LegalDataDictionary — maps Hebrew/English legal terms to Factum-IL table names.
 * Used by SemanticSchemaAnalyzer for confidence-weighted table mapping.
 */

export interface DictionaryEntry {
  /** Factum-IL canonical table name */
  targetTable: string;
  /** Normalized aliases (Hebrew and English) */
  aliases:     string[];
  /** Column name hints that strengthen a match */
  columnHints: string[];
}

export const LEGAL_DICTIONARY: DictionaryEntry[] = [
  {
    targetTable: 'Clients',
    aliases:     ['לקוח', 'לקוחות', 'client', 'clients', 'customer', 'customers', 'מרשים', 'מרשה'],
    columnHints: ['id_number', 'תז', 'passport', 'name', 'phone', 'email', 'address'],
  },
  {
    targetTable: 'Cases',
    aliases:     ['תיק', 'תיקים', 'הליך', 'הליכים', 'case', 'cases', 'proceeding', 'proceedings', 'matter', 'matters'],
    columnHints: ['case_number', 'מספר_תיק', 'court', 'judge', 'status', 'procedure_type'],
  },
  {
    targetTable: 'CourtHearings',
    aliases:     ['דיון', 'דיונים', 'hearing', 'hearings', 'session', 'sessions', 'court_date', 'court_hearing'],
    columnHints: ['date', 'time', 'courtroom', 'judge', 'case_id', 'scheduled_at'],
  },
  {
    targetTable: 'Files',
    aliases:     ['קובץ', 'קבצים', 'מסמך', 'מסמכים', 'file', 'files', 'document', 'documents', 'doc', 'docs'],
    columnHints: ['path', 'filename', 'mime_type', 'size', 'hash', 'uploaded_at'],
  },
  {
    targetTable: 'CommMessages',
    aliases:     ['הודעה', 'הודעות', 'message', 'messages', 'email', 'emails', 'mail', 'communication'],
    columnHints: ['subject', 'body', 'sender', 'recipient', 'direction', 'channel', 'sent_at'],
  },
  {
    targetTable: 'CommConversations',
    aliases:     ['שיחה', 'שיחות', 'conversation', 'conversations', 'thread', 'threads', 'inbox'],
    columnHints: ['channel', 'status', 'client_id', 'case_id', 'last_message_at'],
  },
  {
    targetTable: 'ProceduralChecklist',
    aliases:     ['צ\'קליסט', 'רשימת_משימות', 'checklist', 'tasks', 'procedural', 'obligations', 'steps'],
    columnHints: ['due_date', 'completed', 'case_id', 'rule_id', 'description'],
  },
  {
    targetTable: 'Rules_Engine',
    aliases:     ['חוק', 'חוקים', 'כלל', 'כללים', 'rule', 'rules', 'regulation', 'regulations', 'deadline_rule'],
    columnHints: ['days', 'trigger_event', 'procedure_type', 'court_level', 'description'],
  },
  {
    targetTable: 'EvidenceItems',
    aliases:     ['ראיה', 'ראיות', 'evidence', 'exhibit', 'exhibits', 'artifact', 'artifacts'],
    columnHints: ['hash', 'chain_of_custody', 'admitted', 'case_id', 'file_id'],
  },
  {
    targetTable: 'LegalDrafts',
    aliases:     ['טיוטה', 'טיוטות', 'draft', 'drafts', 'brief', 'briefs', 'motion', 'motions', 'letter', 'letters'],
    columnHints: ['document_type', 'content', 'status', 'case_id', 'client_id', 'word_count'],
  },
  {
    targetTable: 'AgentResults',
    aliases:     ['תוצאת_סוכן', 'agent_result', 'ai_result', 'analysis', 'analyses', 'ai_output'],
    columnHints: ['agent_type', 'summary', 'confidence', 'case_id', 'created_at'],
  },
  {
    targetTable: 'Notifications',
    aliases:     ['התראה', 'התראות', 'notification', 'notifications', 'alert', 'alerts', 'reminder', 'reminders'],
    columnHints: ['severity', 'message', 'resolved', 'case_id', 'created_at'],
  },
  {
    targetTable: 'PipelineLogs',
    aliases:     ['לוג', 'לוגים', 'log', 'logs', 'pipeline_log', 'processing_log', 'job_log'],
    columnHints: ['status', 'file_name', 'error_message', 'timestamp', 'stage'],
  },
  {
    targetTable: 'LegalBrainSessions',
    aliases:     ['session', 'sessions', 'chat', 'chats', 'conversation_ai', 'ai_session'],
    columnHints: ['messages', 'case_id', 'model', 'created_at'],
  },
  {
    targetTable: 'insolvency_filings',
    aliases:     ['פשיטת_רגל', 'חדלות_פירעון', 'insolvency', 'bankruptcy', 'filing', 'filings'],
    columnHints: ['stage', 'filing_date', 'case_id', 'trustee', 'creditor_count'],
  },
];

/** Returns the best-matching Factum-IL table for a source table name, or null. */
export function findBestMatch(sourceName: string): { entry: DictionaryEntry; score: number } | null {
  const lower = sourceName.toLowerCase().replace(/[-_\s]/g, '');
  let best: { entry: DictionaryEntry; score: number } | null = null;

  for (const entry of LEGAL_DICTIONARY) {
    let score = 0;

    // Direct match against target table (normalized)
    if (lower === entry.targetTable.toLowerCase().replace(/[-_\s]/g, '')) {
      score = 1.0;
    } else {
      for (const alias of entry.aliases) {
        const normAlias = alias.toLowerCase().replace(/[-_\s]/g, '');
        if (lower === normAlias) { score = Math.max(score, 0.9); continue; }
        if (lower.includes(normAlias) || normAlias.includes(lower)) {
          score = Math.max(score, 0.6);
        }
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  return best && best.score >= 0.4 ? best : null;
}
