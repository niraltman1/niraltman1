// Public API for @factum-il/update-core

export type {
  UpdateChannel,
  VersionManifest,
  RollbackMetadata,
  UpdateState,
  UpdateValidationResult,
} from './types.js';

export { VersionManifestParser } from './VersionManifest.js';
export { UpdateChannelManager }  from './UpdateChannel.js';
export { UpdateValidator }       from './UpdateValidator.js';
export { UpdateStateStore }      from './UpdateStateStore.js';
export { UpdateDownloader }      from './UpdateDownloader.js';
export type { DownloadProgress } from './UpdateDownloader.js';
