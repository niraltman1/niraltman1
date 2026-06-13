-- 080: Performance indexes on hot-query columns
-- Added for B4 production hardening: reduces full-table scans on frequently-filtered columns.

-- Cases: registry_status filter (admin registry views + pagination)
CREATE INDEX IF NOT EXISTS idx_cases_registry_status   ON Cases(registry_status);
-- Cases: case_number exact-match lookup (preflight-agent, DocumentInsights join)
CREATE INDEX IF NOT EXISTS idx_cases_case_number        ON Cases(case_number);
-- Cases: status filter used in dashboard stats and caseTimeline queries
CREATE INDEX IF NOT EXISTS idx_cases_status             ON Cases(status);

-- Documents: ai_enriched=0 scan used by rag-worker on every sweep
CREATE INDEX IF NOT EXISTS idx_documents_ai_enriched    ON Documents(ai_enriched);
-- Documents: case_id lookups for per-case document lists
CREATE INDEX IF NOT EXISTS idx_documents_case_id        ON Documents(case_id);

-- DocumentInsights: verification_state filter (InsightReviewPage)
CREATE INDEX IF NOT EXISTS idx_doc_insights_verif_state ON DocumentInsights(verification_state);
-- DocumentInsights: confidence sort on per-case insights endpoint
CREATE INDEX IF NOT EXISTS idx_doc_insights_confidence  ON DocumentInsights(confidence DESC);

-- Tasks: priority filter used in admin/stats critical-count query
CREATE INDEX IF NOT EXISTS idx_tasks_priority           ON Tasks(priority);
-- Tasks: case_id + status composite for per-case task lists
CREATE INDEX IF NOT EXISTS idx_tasks_case_status        ON Tasks(case_id, status);

-- TrafficCases: days_remaining + status for SLA radar and admin stats
CREATE INDEX IF NOT EXISTS idx_traffic_days_status      ON TrafficCases(days_remaining, status);

-- WorkflowStates: stage + status for orchestrator canProceedToStage check
CREATE INDEX IF NOT EXISTS idx_workflow_doc_stage_status ON WorkflowStates(document_id, stage, status);

-- AgentExecutionEvents: case_id + created_at for journal queries (ordered DESC)
CREATE INDEX IF NOT EXISTS idx_agent_events_case_time   ON AgentExecutionEvents(case_id, created_at DESC);

-- CommMessages: conversation_id + handled for unread/triage queries
CREATE INDEX IF NOT EXISTS idx_comm_msg_conv_handled    ON CommMessages(conversation_id, handled);

-- DocumentChunks: document_id for per-document chunk lookups
CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc_id        ON DocumentChunks(document_id);

-- EvidenceItems: case_id for per-case evidence lists
CREATE INDEX IF NOT EXISTS idx_evidence_case_id         ON EvidenceItems(case_id);
