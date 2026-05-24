interface DbHandle {
  prepare(sql: string): {
    run(...args: unknown[]): void;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

interface PrefRow { pref_key: string; pref_value: string; }

export function setPreference(userId: string, key: string, value: string, db: DbHandle): void {
  db.prepare(`
    INSERT INTO UserPreferences (user_id, pref_key, pref_value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, pref_key) DO UPDATE SET
      pref_value = excluded.pref_value,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).run(userId, key, value);
}

export function getPreference(userId: string, key: string, db: DbHandle): string | null {
  const row = db.prepare(
    `SELECT pref_value FROM UserPreferences WHERE user_id = ? AND pref_key = ?`,
  ).get(userId, key) as { pref_value: string } | undefined;
  return row?.pref_value ?? null;
}

export function getAllPreferences(userId: string, db: DbHandle): Record<string, string> {
  const rows = db.prepare(
    `SELECT pref_key, pref_value FROM UserPreferences WHERE user_id = ?`,
  ).all(userId) as PrefRow[];
  return Object.fromEntries(rows.map(r => [r.pref_key, r.pref_value]));
}
