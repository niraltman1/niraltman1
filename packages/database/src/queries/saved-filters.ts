import type { DatabaseConnection } from '../connection.js';

export interface SavedFilter {
  id:         number;
  nameHe:     string;
  filterJson: string;
  createdAt:  string;
}

export interface SavedFilterCreateInput {
  nameHe:     string;
  filterJson: string;
}

function mapRow(r: Record<string, unknown>): SavedFilter {
  return {
    id:         r['id']          as number,
    nameHe:     r['name_he']     as string,
    filterJson: r['filter_json'] as string,
    createdAt:  r['created_at']  as string,
  };
}

export class SavedFiltersRepository {
  constructor(private readonly db: DatabaseConnection) {}

  list(): SavedFilter[] {
    return (this.db.prepare('SELECT * FROM SavedFilters ORDER BY created_at DESC').all() as Record<string, unknown>[]).map(mapRow);
  }

  create(input: SavedFilterCreateInput): SavedFilter {
    const result = this.db.prepare(
      'INSERT INTO SavedFilters (name_he, filter_json) VALUES (?, ?) RETURNING *',
    ).get(input.nameHe, input.filterJson) as Record<string, unknown>;
    return mapRow(result);
  }

  delete(id: number): boolean {
    const r = this.db.prepare('DELETE FROM SavedFilters WHERE id = ?').run(id) as { changes: number };
    return r.changes > 0;
  }
}
