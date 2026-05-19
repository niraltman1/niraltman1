-- Migration 034: Traffic Module — Driving License as Valid Identity Node
-- Adds driving_license_number and identity_node_type to TrafficCases,
-- enabling driving license as a complete identity anchor (checklist-satisfying).

ALTER TABLE TrafficCases ADD COLUMN driving_license_number TEXT;
ALTER TABLE TrafficCases ADD COLUMN identity_node_type TEXT NOT NULL DEFAULT 'id_number'
  CHECK (identity_node_type IN ('id_number','driving_license','passport'));

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (34, '034_traffic_driving_license', 'sha256-placeholder-034');
