// Public API for @factum-il/database-intelligence

export type {
  ColumnInfo,
  TableInfo,
  DatabaseSchemaSnapshot,
  MappingTransform,
  TableMapping,
  MigrationMappingReport,
  MigrationStep,
  MigrationExecutionPlan,
  DocumentFileInfo,
  DocumentMigrationReport,
  FolderNode,
  FileStructureMigrationReport,
} from './types.js';

export type { DictionaryEntry }   from './LegalDataDictionary.js';
export { LEGAL_DICTIONARY, findBestMatch } from './LegalDataDictionary.js';

export type { DataSourceConnector, ConnectionTestResult } from './connectors/DataSourceConnector.js';
export { SQLiteConnector }  from './connectors/SQLiteConnector.js';
export { CSVConnector }     from './connectors/CSVConnector.js';
export { ExcelConnector }   from './connectors/ExcelConnector.js';

export type { ScanInput }       from './DatabaseScanner.js';
export { DatabaseScanner }      from './DatabaseScanner.js';

export type { AnalysisResult }  from './SemanticSchemaAnalyzer.js';
export { SemanticSchemaAnalyzer } from './SemanticSchemaAnalyzer.js';

export { MappingRecommendationEngine } from './MappingRecommendationEngine.js';
export { ImportPlanner }               from './ImportPlanner.js';
export { DocumentInventoryAnalyzer }   from './DocumentInventoryAnalyzer.js';
export { FileStructureAnalyzer }       from './FileStructureAnalyzer.js';
