import { utcNow, generateUUID } from '../utils/index.js';
import { logger } from '../logging/index.js';

export interface CrashBundle {
  readonly bundleId:     string;
  readonly generatedAt:  string;
  readonly queueState:   Record<string, number>;
  readonly recentErrors: string[];
  readonly systemInfo:   Record<string, string>;
}

type DiagnosticProvider = () => Record<string, unknown>;

/**
 * Collects crash diagnostics from registered providers.
 * Each provider supplies a snapshot of its subsystem state.
 */
export class DiagnosticsService {
  private readonly providers = new Map<string, DiagnosticProvider>();

  /** Registers a named diagnostic provider. */
  register(name: string, provider: DiagnosticProvider): void {
    this.providers.set(name, provider);
  }

  /**
   * Gathers a crash bundle by calling all registered providers.
   * Failures in individual providers are caught and noted in the bundle.
   */
  gather(): CrashBundle & Record<string, unknown> {
    const bundleId    = generateUUID();
    const generatedAt = utcNow();
    const bundle: Record<string, unknown> = { bundleId, generatedAt };

    for (const [name, provider] of this.providers) {
      try {
        bundle[name] = provider();
      } catch (err) {
        bundle[name] = { error: String(err) };
        logger.warn(`DiagnosticsService: provider "${name}" failed: ${String(err)}`, {
          category: 'system', agentSource: 'GovernanceController',
        });
      }
    }

    logger.info(`Crash bundle generated: ${bundleId}`, {
      category: 'system', agentSource: 'GovernanceController',
    });

    return bundle as CrashBundle & Record<string, unknown>;
  }
}

/** Application-level singleton diagnostics service. */
export const diagnostics = new DiagnosticsService();
