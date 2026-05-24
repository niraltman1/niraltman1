-- Migration 032: Contact Audit Log + Extended Client Fields
-- contact_audit_log: immutable trail of every field change (ripple-update audit)
-- Clients extended: nullable address, secondary phone, company, WhatsApp phone

CREATE TABLE IF NOT EXISTS contact_audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES Contacts(id) ON DELETE CASCADE,
  field_name TEXT    NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  changed_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_cal_contact ON contact_audit_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_cal_changed ON contact_audit_log(changed_at);

-- SQLite supports ADD COLUMN without table recreation (NULL default, no CHECK)
ALTER TABLE Clients ADD COLUMN address_street  TEXT;
ALTER TABLE Clients ADD COLUMN address_city    TEXT;
ALTER TABLE Clients ADD COLUMN address_zip     TEXT;
ALTER TABLE Clients ADD COLUMN phone_secondary TEXT;
ALTER TABLE Clients ADD COLUMN company_name    TEXT;
ALTER TABLE Clients ADD COLUMN whatsapp_phone  TEXT;

INSERT OR IGNORE INTO _migrations (version, name, checksum)
VALUES (32, '032_contact_audit_clients_ext', 'sha256-placeholder-032');
