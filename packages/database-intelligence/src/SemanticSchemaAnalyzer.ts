/**
 * SemanticSchemaAnalyzer — infers Factum-IL table mappings from a schema snapshot.
 * Uses name-similarity and column-pattern matching via LegalDataDictionary.
 */

import { findBestMatch } from './LegalDataDictionary.js';
import type { DatabaseSchemaSnapshot, TableInfo, TableMapping, MappingTransform } from './types.js';

export interface AnalysisResult {
  snapshot:       DatabaseSchemaSnapshot;
  mappings:       TableMapping[];
  unmappedTables: string[];
  warnings:       string[];
}

export class SemanticSchemaAnalyzer {
  analyze(snapshot: DatabaseSchemaSnapshot): AnalysisResult {
    const mappings:        TableMapping[] = [];
    const unmappedTables:  string[]       = [];
    const warnings:        string[]       = [];

    for (const table of snapshot.tables) {
      const mapping = this.analyzeTable(table);
      if (mapping) {
        mappings.push(mapping);
      } else {
        unmappedTables.push(table.name);
        warnings.push(`No Factum-IL mapping found for table: "${table.name}"`);
      }
    }

    if (snapshot.tables.length === 0) {
      warnings.push('Source contains no tables — nothing to map');
    }

    return { snapshot, mappings, unmappedTables, warnings };
  }

  private analyzeTable(table: TableInfo): TableMapping | null {
    const match = findBestMatch(table.name);
    if (!match) return null;

    const { entry, score } = match;
    const columnNames      = table.columns.map((c) => c.name.toLowerCase());

    // Boost confidence if column hints match
    const hintMatches = entry.columnHints.filter((hint) =>
      columnNames.some((col) => col.includes(hint.toLowerCase()) || hint.toLowerCase().includes(col)),
    ).length;

    const confidence = Math.min(1, score + hintMatches * 0.05);

    // Infer transforms
    const transforms: MappingTransform[] = [];
    const unmappedColumns: string[] = [];
    const conflicts: string[] = [];

    for (const col of table.columns) {
      const colLower = col.name.toLowerCase();

      // Date columns that don't look ISO
      if (/date|time|at$|_at$/.test(colLower) && col.type.toLowerCase().includes('text')) {
        transforms.push({ kind: 'cast', detail: `Cast "${col.name}" TEXT→DATETIME` });
      }

      // Hebrew column name normalization
      if (/[֐-׿]/.test(col.name)) {
        transforms.push({ kind: 'rename', detail: `Rename Hebrew column "${col.name}" to English equivalent` });
      }
    }

    // Check for columns not in standard Factum-IL schema
    const standardCols = new Set(entry.columnHints);
    for (const col of table.columns) {
      if (!standardCols.has(col.name.toLowerCase()) && !col.primaryKey) {
        unmappedColumns.push(col.name);
      }
    }

    if (confidence < 0.5) {
      conflicts.push(`Low confidence match (${Math.round(confidence * 100)}%) — manual review required`);
    }

    return {
      sourceTable:  table.name,
      targetTable:  entry.targetTable,
      confidence,
      matchedBy:    hintMatches > 0 ? 'name-similarity+column-pattern' : 'name-similarity',
      transforms,
      conflicts,
      unmappedColumns,
    };
  }
}
