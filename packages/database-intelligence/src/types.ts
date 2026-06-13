// Core types for the Database Intelligence Platform (Phase 3B — preview only)

export interface ColumnInfo {
  name:         string;
  type:         string;
  nullable:     boolean;
  primaryKey:   boolean;
  defaultValue: string | null;
}

export interface TableInfo {
  name:       string;
  rowCount:   number;
  columns:    ColumnInfo[];
  sampleRows: Record<string, unknown>[];
}

export interface DatabaseSchemaSnapshot {
  sourceType:  'sqlite' | 'csv' | 'excel' | 'unknown';
  sourcePath:  string;
  scannedAt:   string;
  tables:      TableInfo[];
  totalRows:   number;
  fileSizeBytes: number;
}

export interface MappingTransform {
  kind:       'rename' | 'cast' | 'split' | 'merge' | 'normalize';
  detail:     string;
}

export interface TableMapping {
  sourceTable:       string;
  targetTable:       string;
  confidence:        number;         // 0..1
  matchedBy:         string;         // e.g. "name-similarity", "column-pattern"
  transforms:        MappingTransform[];
  conflicts:         string[];
  unmappedColumns:   string[];
}

export interface MigrationMappingReport {
  generatedAt:    string;
  sourceSnapshot: DatabaseSchemaSnapshot;
  mappings:       TableMapping[];
  unmappedTables: string[];
  warnings:       string[];
}

export interface MigrationStep {
  order:       number;
  sourceTable: string;
  targetTable: string;
  dependencies: string[];
  rollbackPoint: boolean;
  estimatedSec:  number;
  transforms:    MappingTransform[];
}

export interface MigrationExecutionPlan {
  generatedAt:  string;
  steps:        MigrationStep[];
  totalEstSec:  number;
  warnings:     string[];
}

export interface DocumentFileInfo {
  path:       string;
  extension:  string;
  sizeBytes:  number;
  isSupported: boolean;
}

export interface DocumentMigrationReport {
  generatedAt:     string;
  rootPath:        string;
  totalFiles:      number;
  supportedFiles:  number;
  unsupportedFiles: number;
  duplicates:      number;
  byExtension:     Record<string, number>;
  estimatedHours:  number;
  warnings:        string[];
}

export interface FolderNode {
  name:       string;
  path:       string;
  fileCount:  number;
  children:   FolderNode[];
}

export interface FileStructureMigrationReport {
  generatedAt:    string;
  rootPath:       string;
  totalFolders:   number;
  maxDepth:       number;
  tree:           FolderNode;
  namingIssues:   string[];
  migrationNotes: string[];
}
