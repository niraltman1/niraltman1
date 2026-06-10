import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Repos } from './db.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error.js';
import { auditMiddleware } from './middleware/audit-logger.js';
import { authRouter } from './middleware/auth.js';
import { correlationId } from './middleware/correlation-id.js';
import { observabilityMiddleware } from '@factum-il/observability';
import { healthRouter }         from './routes/health.js';
import { activityRouter }       from './routes/activity.js';
import { missionControlRouter } from './routes/mission-control.js';
import { clientsRouter } from './routes/clients.js';
import { casesRouter } from './routes/cases.js';
import { documentsRouter } from './routes/documents.js';
import { searchRouter } from './routes/search.js';
import { queueRouter } from './routes/queue.js';
import { actionPlanRouter } from './routes/action-plan.js';
import { adminRouter } from './routes/admin.js';
import { legalAiRouter } from './routes/legal-ai.js';
import { aiStreamRouter } from './routes/ai-stream.js';
import { tasksRouter } from './routes/tasks.js';
import { legalEngineRouter } from './routes/legal-engine.js';
import { mediaRouter }       from './routes/media.js';
import { trafficRouter }     from './routes/traffic.js';
import { importerRouter }    from './routes/importer.js';
import { docxRouter }        from './routes/docx.js';
import { contactsRouter }    from './routes/contacts.js';
import { studiesRouter }     from './routes/studies.js';
import { evidenceRouter }    from './routes/evidence.js';
import { stensRouter }       from './routes/stens.js';
import { updatesRouter }     from './routes/updates.js';
import { canvasRouter }      from './routes/canvas.js';
import { gmailRouter }       from './routes/gmail.js';
import { mailRouter }        from './routes/mail.js';
import { vacuumRouter }      from './routes/vacuum.js';
import { eventsRouter }      from './routes/events.js';
import { precedentsRouter }  from './routes/precedents.js';
import { ledgerRouter }      from './routes/ledger.js';
import { insolvencyRouter }  from './routes/insolvency.js';
import { caseLawRouter }     from './routes/case-law.js';
import { citationsRouter }   from './routes/citations.js';
import { erasureRouter }     from './routes/erasure.js';
import { bugReportRouter }   from './routes/bug-report.js';
import { agentsRouter, agentsStreamRouter } from './routes/agents.js';
import { signaturesRouter }  from './routes/signatures.js';
import { diagnosticsRouter } from './routes/diagnostics.js';
import { recoveryRouter }    from './routes/recovery.js';
import { tabularRouter }     from './routes/tabular.js';
import { setupRouter }       from './routes/setup.js';
import { notificationsRouter } from './routes/notifications.js';
import { calendarRouter } from './routes/calendar.js';
import { entitiesRouter } from './routes/entities.js';
import { collectionsRouter } from './routes/collections.js';
import { communicationsRouter } from './routes/communications.js';
import { annotationsRouter } from './routes/annotations.js';
import { rulesRouter } from './routes/rules.js';
import { legalCorpusRouter } from './routes/legal-corpus.js';
import { verdictCorpusRouter } from './routes/verdict-corpus.js';
import { recordActivity }    from './utils/resource-controller.js';
import { RagHealingService } from './utils/rag-healing.js';
import { logWhisperHealthAtStartup } from './modules/transcription/whisper.js';

export function createApp(
  repos: Repos,
  dbPath?: string,
  healingService?: RagHealingService,
): express.Express {
  const app = express();

  const svc = healingService ?? new RagHealingService(
    repos.db,
    process.env['OLLAMA_BASE_URL'] ?? 'http://127.0.0.1:11434',
  );
  // Non-blocking startup check — repairs FTS5 if corrupt and begins Ollama probe loop if needed
  void svc.runHealingCycle();

  // Non-blocking startup check — logs whether local Whisper transcription is reachable
  // (fails gracefully: transcription requests still 503 cleanly if it isn't, per CLAUDE.md)
  void logWhisperHealthAtStartup();

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", 'http://localhost:11434'],
        imgSrc:     ["'self'", 'data:'],
        styleSrc:   ["'self'", "'unsafe-inline'"],
      },
    },
    hsts:       false,
    frameguard: { action: 'deny' },
  }));

  // Restrict CORS to localhost origins only (5174 is Vite dev fallback — excluded in production)
  app.use(cors({
    origin: [
      'http://localhost:5173',
      ...(process.env['NODE_ENV'] !== 'production' ? ['http://localhost:5174'] : []),
      'http://localhost:3001',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3001',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  // Request size limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Global rate limiter: 300 req/min
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
  // Strict limiter on auth endpoints: 20 req/min
  app.use('/api/auth/', rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false }));
  // Export endpoints: 30 req/min
  app.use('/api/docx/', rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false }));
  // Agent endpoints: strict limit prevents event-loop saturation from concurrent Ollama calls
  app.use('/api/agents/', rateLimit({ windowMs: 60_000, max: 3, standardHeaders: true, legacyHeaders: false }));

  app.use(correlationId);
  app.use(observabilityMiddleware());
  app.use(requestLogger);
  app.use(auditMiddleware(repos));

  app.use('/api/health',          healthRouter(repos, dbPath ?? '', healingService));
  app.use('/api/activity',        activityRouter(repos));
  app.use('/api/mission-control', missionControlRouter(repos));

  app.use('/api/clients',     clientsRouter(repos));
  app.use('/api/cases',       casesRouter(repos));
  app.use('/api/documents',   documentsRouter(repos));
  app.use('/api/search',      searchRouter(repos));
  app.use('/api/queue',       queueRouter(repos));
  app.use('/api/action-plan', actionPlanRouter(repos));
  app.use('/api/admin',       adminRouter(repos, healingService));
  app.use('/api/legal-ai',    legalAiRouter(repos));
  app.use('/api/ai',          aiStreamRouter(repos));
  app.use('/api/tasks',        tasksRouter(repos));
  app.use('/api/legal-engine', legalEngineRouter(repos));
  app.use('/api/media',        mediaRouter(repos));
  app.use('/api/traffic',      trafficRouter(repos));
  app.use('/api/importer',     importerRouter(repos));
  app.use('/api/docx',         docxRouter(repos));
  app.use('/api/contacts',     contactsRouter(repos));
  app.use('/api/studies',      studiesRouter(repos));
  app.use('/api/evidence',     evidenceRouter(repos));
  app.use('/api/stens',        stensRouter(repos));
  app.use('/api/updates',      updatesRouter(repos));
  app.use('/api/canvas',       canvasRouter(repos));
  app.use('/api/gmail',        gmailRouter(repos));
  app.use('/api/mail',         mailRouter(repos));
  app.use('/api/vacuum',       vacuumRouter(repos));
  app.use('/api/events',       eventsRouter());
  app.use('/api/precedents',   precedentsRouter(repos));
  app.use('/api/ledger',       ledgerRouter(repos));
  app.use('/api/insolvency',   insolvencyRouter(repos));
  app.use('/api/case-law',     caseLawRouter(repos));
  app.use('/api/verdict-corpus', verdictCorpusRouter(repos));
  app.use('/api/citations',    citationsRouter(repos));
  app.use('/api/auth',         authRouter(repos));
  app.use('/api/erasure',      erasureRouter(repos));
  app.use('/api/bug-report',   bugReportRouter(repos));
  app.use('/api/agents',       agentsRouter(repos));
  app.use('/api/agents',       agentsStreamRouter(repos));
  app.use('/api/signatures',   signaturesRouter(repos));
  app.use('/api/diagnostics',  diagnosticsRouter(repos));
  app.use('/api/recovery',     recoveryRouter(repos));
  app.use('/api/tabular',      tabularRouter(repos));
  app.use('/api/setup',        setupRouter(repos, dbPath ?? ''));
  app.use('/api/notifications', notificationsRouter(repos));
  app.use('/api/calendar',      calendarRouter(repos));
  app.use('/api/entities',      entitiesRouter(repos));
  app.use('/api/collections',   collectionsRouter(repos));
  app.use('/api/communications', communicationsRouter(repos));
  app.use('/api/annotations',   annotationsRouter(repos));
  app.use('/api/rules',         rulesRouter(repos));
  app.use('/api/legal-corpus',  legalCorpusRouter(repos));

  // Track activity for Day/Night resource controller
  app.use((_req, _res, next) => { recordActivity(); next(); });

  app.use((_req, res) => res.status(404).json({ error: 'Not Found', code: 'NOT_FOUND' }));
  app.use(errorHandler);

  return app;
}
