import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { Router as RemixRouter } from '@remix-run/router';
import { AppShell }    from '@/components/layout/AppShell.js';
import { NotFoundPage } from '@/components/common/NotFoundPage.js';

// ── Lazy-load helper ─────────────────────────────────────────────────────────
// React.lazy requires a module with a `default` export; our pages use named
// exports. This wrapper converts a named export to the required shape without
// `any` casts by constraining T to the inferred module type.
function lz<T extends Record<string, ComponentType>>(
  importer: () => Promise<T>,
  name: keyof T & string,
): LazyExoticComponent<ComponentType> {
  return lazy(() => importer().then((m) => ({ default: m[name] as ComponentType })));
}

// ── Page components (lazy-loaded per route) ──────────────────────────────────
const SetupWizard    = lz(() => import('@/features/setup/SetupWizard.js'),            'SetupWizard');
const DashboardPage  = lz(() => import('@/features/dashboard/DashboardPage.js'),      'DashboardPage');
const DocumentsPage  = lz(() => import('@/features/documents/DocumentsPage.js'),      'DocumentsPage');
const DocumentDetail = lz(() => import('@/features/documents/DocumentDetail.js'),     'DocumentDetail');
const DocumentReader = lz(() => import('@/features/documents/DocumentReader.js'),     'DocumentReader');
const SmartCollectionsPage = lz(() => import('@/features/documents/SmartCollectionsPage.js'), 'SmartCollectionsPage');
const ActionQueue    = lz(() => import('@/features/documents/ActionQueue.js'),        'ActionQueue');
const ClientsPage    = lz(() => import('@/features/clients/ClientsPage.js'),          'ClientsPage');
const ClientCard     = lz(() => import('@/features/clients/ClientCard.js'),           'ClientCard');
const CasesPage      = lz(() => import('@/features/cases/CasesPage.js'),              'CasesPage');
const CaseDetail     = lz(() => import('@/features/cases/CaseDetail.js'),             'CaseDetail');
const HearingPrepPage = lz(() => import('@/features/cases/HearingPrepPage.js'),       'HearingPrepPage');
const MatterWorkbench = lz(() => import('@/features/cases/MatterWorkbench.js'),       'MatterWorkbench');
const EntitiesPage   = lz(() => import('@/features/entities/EntitiesPage.js'),        'EntitiesPage');
const EntityDetailPage = lz(() => import('@/features/entities/EntityDetailPage.js'),  'EntityDetailPage');
const RulesEnginePage = lz(() => import('@/features/legal/RulesEnginePage.js'),       'RulesEnginePage');
const ActionPlanPage = lz(() => import('@/features/action-plan/ActionPlanPage.js'),   'ActionPlanPage');
const SearchPage     = lz(() => import('@/features/search/SearchPage.js'),            'SearchPage');
const QueueMonitor   = lz(() => import('@/features/queue/QueueMonitor.js'),           'QueueMonitor');
const CalendarPage   = lz(() => import('@/features/calendar/CalendarPage.js'),        'CalendarPage');
const DeadlineMonitorPage = lz(() => import('@/features/calendar/DeadlineMonitorPage.js'), 'DeadlineMonitorPage');
const DiagnosticsPage    = lz(() => import('@/features/admin/DiagnosticsPage.js'),    'DiagnosticsPage');
const MissionControlPage = lz(() => import('@/features/admin/MissionControlPage.js'), 'MissionControlPage');
const BackupSettingsPage = lz(() => import('@/features/admin/BackupSettingsPage.js'), 'BackupSettingsPage');
const RecoveryPage       = lz(() => import('@/features/admin/RecoveryPage.js'),       'RecoveryPage');
const JournalPage        = lz(() => import('@/features/admin/JournalPage.js'),        'JournalPage');
const RBACManagePage     = lz(() => import('@/features/admin/RBACManagePage.js'),     'RBACManagePage');
const ActivityFeedPage   = lz(() => import('@/features/activity/ActivityFeedPage.js'), 'ActivityFeedPage');
const TasksPage          = lz(() => import('@/features/tasks/TasksPage.js'),          'TasksPage');
const TemplatesPage      = lz(() => import('@/features/legal-engine/TemplatesPage.js'), 'TemplatesPage');
const MediaRegistryPage  = lz(() => import('@/features/media/MediaRegistryPage.js'),  'MediaRegistryPage');
const TrafficAlertsPage  = lz(() => import('@/features/traffic/TrafficAlertsPage.js'), 'TrafficAlertsPage');
const StudiesPage        = lz(() => import('@/features/studies/StudiesPage.js'),      'StudiesPage');
const EvidenceLockerPage = lz(() => import('@/features/evidence/EvidenceLockerPage.js'), 'EvidenceLockerPage');
const StensLibraryPage   = lz(() => import('@/features/stens/StensLibraryPage.js'),   'StensLibraryPage');
const CanvasPage         = lz(() => import('@/features/canvas/CanvasPage.js'),        'CanvasPage');
const CommunicationsInboxPage = lz(() => import('@/features/communications/CommunicationsInboxPage.js'), 'CommunicationsInboxPage');
const GmailBridgePage    = lz(() => import('@/features/gmail/GmailBridgePage.js'),    'GmailBridgePage');
const MailWorkspacePage  = lz(() => import('@/features/mail/MailWorkspacePage.js'),   'MailWorkspacePage');
const AgentsWorkspacePage = lz(() => import('@/features/agents/AgentsWorkspacePage.js'), 'AgentsWorkspacePage');
const ContactsPage       = lz(() => import('@/features/contacts/ContactsPage.js'),    'ContactsPage');
const PrecedentsPage     = lz(() => import('@/features/precedents/PrecedentsPage.js'), 'PrecedentsPage');
const JudgmentLibraryPage = lz(() => import('@/features/judgment-library/JudgmentLibraryPage.js'), 'JudgmentLibraryPage');
const LedgerPage         = lz(() => import('@/features/ledger/LedgerPage.js'),        'LedgerPage');
const LegalCorpusPage    = lz(() => import('@/features/legal/LegalCorpusPage.js'),    'LegalCorpusPage');
const LegalLibraryPage   = lz(() => import('@/features/legal/LegalLibraryPage.js'),   'LegalLibraryPage');
const DraftingPage       = lz(() => import('@/features/drafting/DraftingPage.js'),    'DraftingPage');
const DraftEditorPage    = lz(() => import('@/features/drafting/DraftEditorPage.js'), 'DraftEditorPage');
const InsolvencyPage     = lz(() => import('@/features/insolvency/InsolvencyPage.js'), 'InsolvencyPage');
const InsightReviewPage  = lz(() => import('@/features/documents/InsightReviewPage.js'), 'InsightReviewPage');
const CitationsPage      = lz(() => import('@/features/citations/CitationsPage.js'),    'CitationsPage');
const DashboardHomePage  = lz(() => import('@/features/workspace/DashboardHomePage.js'), 'DashboardHomePage');
const SupportPage        = lz(() => import('@/features/support/SupportPage.js'),        'SupportPage');
const DataMigrationPage  = lz(() => import('@/features/data-migration/DataMigrationPage.js'), 'DataMigrationPage');
const UpdatesCenterPage  = lz(() => import('@/features/admin/updates/UpdatesCenterPage.js'), 'UpdatesCenterPage');

// ── Router ───────────────────────────────────────────────────────────────────

export const router: RemixRouter = createBrowserRouter([
  // Setup wizard lives outside AppShell — wrapped in its own Suspense
  {
    path: 'setup',
    element: (
      <Suspense fallback={null}>
        <SetupWizard />
      </Suspense>
    ),
  },
  {
    path:    '/',
    element: <AppShell />,
    children: [
      { index: true,               element: <Navigate to="/workspace" replace /> },
      { path: 'workspace',         element: <DashboardHomePage /> },
      { path: 'dashboard',         element: <DashboardPage />   },
      { path: 'documents',         element: <DocumentsPage />   },
      { path: 'documents/:id',     element: <DocumentDetail />  },
      { path: 'documents/:id/read', element: <DocumentReader /> },
      { path: 'clients',           element: <ClientsPage />     },
      { path: 'clients/:id',       element: <ClientCard />      },
      { path: 'cases',             element: <CasesPage />       },
      { path: 'cases/:id',         element: <CaseDetail />      },
      { path: 'cases/:id/hearing-prep', element: <HearingPrepPage /> },
      { path: 'cases/:id/workbench',    element: <MatterWorkbench /> },
      { path: 'action-plan',       element: <ActionPlanPage />  },
      { path: 'search',            element: <SearchPage />      },
      { path: 'queue',             element: <QueueMonitor />    },
      { path: 'action-queue',      element: <ActionQueue />     },
      { path: 'collections',       element: <SmartCollectionsPage /> },
      { path: 'tasks',             element: <TasksPage />       },
      { path: 'calendar',          element: <CalendarPage />    },
      { path: 'deadlines',         element: <DeadlineMonitorPage /> },
      { path: 'templates',         element: <TemplatesPage />        },
      { path: 'rules',             element: <RulesEnginePage />      },
      { path: 'media',             element: <MediaRegistryPage />    },
      { path: 'traffic',           element: <TrafficAlertsPage />   },
      { path: 'studies',           element: <StudiesPage />          },
      { path: 'evidence',          element: <EvidenceLockerPage />   },
      { path: 'stens',             element: <StensLibraryPage />     },
      { path: 'communications',    element: <CommunicationsInboxPage /> },
      { path: 'gmail',             element: <GmailBridgePage />      },
      { path: 'mail',              element: <MailWorkspacePage />    },
      { path: 'agents',             element: <AgentsWorkspacePage />  },
      { path: 'contacts',          element: <ContactsPage />         },
      { path: 'precedents',        element: <PrecedentsPage />       },
      { path: 'library',            element: <LegalLibraryPage />     },
      { path: 'judgment-library',  element: <JudgmentLibraryPage />  },
      { path: 'ledger',            element: <LedgerPage />           },
      { path: 'legal-corpus',      element: <LegalCorpusPage />      },
      { path: 'drafting',          element: <DraftingPage />         },
      { path: 'drafting/:id',      element: <DraftEditorPage />      },
      { path: 'insolvency',        element: <InsolvencyPage />       },
      { path: 'insights-review',   element: <InsightReviewPage />    },
      { path: 'citations',         element: <CitationsPage />        },
      { path: 'support',           element: <SupportPage />          },
      { path: 'data-migration',    element: <DataMigrationPage />    },
      { path: 'entities',          element: <EntitiesPage />         },
      { path: 'entities/:type/:name', element: <EntityDetailPage />  },
      { path: 'canvas/:id',        element: <CanvasPage />           },
      { path: 'activity',               element: <ActivityFeedPage />   },
      { path: 'admin',                  element: <DiagnosticsPage />    },
      { path: 'admin/mission-control',  element: <MissionControlPage /> },
      { path: 'admin/backup-settings',  element: <BackupSettingsPage /> },
      { path: 'admin/recovery',         element: <RecoveryPage />       },
      { path: 'admin/journal',          element: <JournalPage />        },
      { path: 'admin/rbac',             element: <RBACManagePage />     },
      { path: 'admin/updates',          element: <UpdatesCenterPage />  },
      { path: '*',                      element: <NotFoundPage />       },
    ],
  },
]);
