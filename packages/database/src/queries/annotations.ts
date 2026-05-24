import type { DatabaseConnection } from '../connection.js';

export interface Annotation {
  id:             number;
  documentId:     number;
  pageNumber:     number;
  annotationType: 'highlight' | 'note' | 'redline' | 'bookmark';
  color:          string | null;
  x:              number | null;
  y:              number | null;
  width:          number | null;
  height:         number | null;
  content:        string | null;
  createdBy:      string | null;
  createdAt:      string;
}

export interface AnnotationCreateInput {
  documentId:     number;
  pageNumber?:    number;
  annotationType: 'highlight' | 'note' | 'redline' | 'bookmark';
  color?:         string;
  x?:             number;
  y?:             number;
  width?:         number;
  height?:        number;
  content?:       string;
  createdBy?:     string;
}

export class AnnotationRepository {
  constructor(private readonly db: DatabaseConnection) {}

  create(input: AnnotationCreateInput): Annotation {
    const result = this.db.prepare(`
      INSERT INTO Annotations
        (document_id, page_number, annotation_type, color, x, y, width, height, content, created_by)
      VALUES
        (@documentId, @pageNumber, @annotationType, @color, @x, @y, @width, @height, @content, @createdBy)
    `).run({
      documentId:     input.documentId,
      pageNumber:     input.pageNumber  !== undefined ? input.pageNumber  : 1,
      annotationType: input.annotationType,
      color:          input.color       !== undefined ? input.color       : null,
      x:              input.x           !== undefined ? input.x           : null,
      y:              input.y           !== undefined ? input.y           : null,
      width:          input.width       !== undefined ? input.width       : null,
      height:         input.height      !== undefined ? input.height      : null,
      content:        input.content     !== undefined ? input.content     : null,
      createdBy:      input.createdBy   !== undefined ? input.createdBy   : null,
    }) as { lastInsertRowid: number | bigint };
    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): Annotation | null {
    const row = this.db.prepare(
      `SELECT * FROM Annotations WHERE id = ?`,
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : null;
  }

  findByDocument(documentId: number): Annotation[] {
    return (this.db.prepare(
      `SELECT * FROM Annotations WHERE document_id = ? ORDER BY page_number ASC, id ASC`,
    ).all(documentId) as Record<string, unknown>[]).map((r) => this.mapRow(r));
  }

  findByDocumentAndPage(documentId: number, pageNumber: number): Annotation[] {
    return (this.db.prepare(
      `SELECT * FROM Annotations WHERE document_id = ? AND page_number = ? ORDER BY id ASC`,
    ).all(documentId, pageNumber) as Record<string, unknown>[]).map((r) => this.mapRow(r));
  }

  update(
    id: number,
    updates: Partial<Pick<AnnotationCreateInput, 'content' | 'color' | 'x' | 'y' | 'width' | 'height'>>,
  ): Annotation | null {
    const fieldMap: Record<string, string> = {
      content: 'content',
      color:   'color',
      x:       'x',
      y:       'y',
      width:   'width',
      height:  'height',
    };

    const keys = Object.keys(updates) as Array<keyof typeof updates>;
    if (keys.length === 0) return this.findById(id);

    const setClauses = keys.map((k) => `${fieldMap[k]} = @${k}`).join(', ');
    const params: Record<string, unknown> = { id };
    for (const k of keys) {
      params[k] = updates[k] !== undefined ? updates[k] : null;
    }

    this.db.prepare(`UPDATE Annotations SET ${setClauses} WHERE id = @id`).run(params);
    return this.findById(id);
  }

  delete(id: number): void {
    this.db.prepare(`DELETE FROM Annotations WHERE id = ?`).run(id);
  }

  private mapRow(row: Record<string, unknown>): Annotation {
    return {
      id:             Number(row['id']),
      documentId:     Number(row['document_id']),
      pageNumber:     Number(row['page_number'] ?? 1),
      annotationType: row['annotation_type'] as Annotation['annotationType'],
      color:          row['color']      != null ? String(row['color'])      : null,
      x:              row['x']          != null ? Number(row['x'])          : null,
      y:              row['y']          != null ? Number(row['y'])          : null,
      width:          row['width']      != null ? Number(row['width'])      : null,
      height:         row['height']     != null ? Number(row['height'])     : null,
      content:        row['content']    != null ? String(row['content'])    : null,
      createdBy:      row['created_by'] != null ? String(row['created_by']) : null,
      createdAt:      String(row['created_at'] ?? ''),
    };
  }
}
