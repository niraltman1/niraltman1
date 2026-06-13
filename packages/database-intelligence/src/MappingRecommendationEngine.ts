/**
 * MappingRecommendationEngine — turns AnalysisResult into a MigrationMappingReport.
 */

import type { AnalysisResult } from './SemanticSchemaAnalyzer.js';
import type { MigrationMappingReport } from './types.js';

export class MappingRecommendationEngine {
  generateReport(analysis: AnalysisResult): MigrationMappingReport {
    const warnings = [...analysis.warnings];

    // Duplicate target table warnings
    const targetCounts = new Map<string, number>();
    for (const m of analysis.mappings) {
      targetCounts.set(m.targetTable, (targetCounts.get(m.targetTable) ?? 0) + 1);
    }
    for (const [target, count] of targetCounts.entries()) {
      if (count > 1) {
        warnings.push(`Multiple source tables map to "${target}" — data merge required`);
      }
    }

    // Low confidence warnings
    for (const m of analysis.mappings) {
      if (m.confidence < 0.6) {
        warnings.push(`"${m.sourceTable}" → "${m.targetTable}" confidence ${Math.round(m.confidence * 100)}% — recommend manual review`);
      }
    }

    return {
      generatedAt:    new Date().toISOString(),
      sourceSnapshot: analysis.snapshot,
      mappings:       analysis.mappings,
      unmappedTables: analysis.unmappedTables,
      warnings,
    };
  }
}
