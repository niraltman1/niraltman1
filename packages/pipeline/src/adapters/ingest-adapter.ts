export interface IngestAdapterConfig {
  watchFolders:    string[];
  apiBase:         string;
  pollIntervalMs?: number;
}

export interface IngestAdapter {
  watch(config: IngestAdapterConfig): void;
  stop(): void;
}
