import { createBrowserRouter, Navigate } from 'react-router-dom';
import type { Router as RemixRouter } from '@remix-run/router';
import { AppShell }        from '@/components/layout/AppShell.js';
import { DashboardPage }   from '@/features/documents/DashboardPage.js';
import { DocumentsPage }   from '@/features/documents/DocumentsPage.js';
import { DocumentDetail }  from '@/features/documents/DocumentDetail.js';
import { ClientsPage }     from '@/features/clients/ClientsPage.js';
import { ClientCard }      from '@/features/clients/ClientCard.js';
import { CasesPage }       from '@/features/cases/CasesPage.js';
import { CaseDetail }      from '@/features/cases/CaseDetail.js';
import { ActionPlanPage }  from '@/features/action-plan/ActionPlanPage.js';
import { SearchPage }      from '@/features/search/SearchPage.js';
import { QueueMonitor }    from '@/features/queue/QueueMonitor.js';
import { ActionQueue }     from '@/features/documents/ActionQueue.js';
import { DiagnosticsPage }    from '@/features/admin/DiagnosticsPage.js';
import { MissionControlPage } from '@/features/admin/MissionControlPage.js';
import { BackupSettingsPage } from '@/features/admin/BackupSettingsPage.js';
import { RecoveryPage }       from '@/features/admin/RecoveryPage.js';
import { ActivityFeedPage }   from '@/features/activity/ActivityFeedPage.js';
import { TasksPage }       from '@/features/tasks/TasksPage.js';
import { TemplatesPage }      from '@/features/legal-engine/TemplatesPage.js';
import { MediaRegistryPage }  from '@/features/media/MediaRegistryPage.js';
import { TrafficAlertsPage }  from '@/features/traffic/TrafficAlertsPage.js';
import { StudiesPage }        from '@/features/studies/StudiesPage.js';
import { EvidenceLockerPage } from '@/features/evidence/EvidenceLockerPage.js';
import { StensLibraryPage }   from '@/features/stens/StensLibraryPage.js';
import { CanvasPage }         from '@/features/canvas/CanvasPage.js';
import { GmailBridgePage }    from '@/features/gmail/GmailBridgePage.js';
import { MailWorkspacePage }  from '@/features/mail/MailWorkspacePage.js';
import { AgentsWorkspacePage } from '@/features/agents/AgentsWorkspacePage.js';
import { ContactsPage }       from '@/features/contacts/ContactsPage.js';
import { PrecedentsPage }     from '@/features/precedents/PrecedentsPage.js';
import { NotFoundPage }       from '@/components/common/NotFoundPage.js';

export const router: RemixRouter = createBrowserRouter([
  {
    path:    '/',
    element: <AppShell />,
    children: [
      { index: true,               element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',         element: <DashboardPage />   },
      { path: 'documents',         element: <DocumentsPage />   },
      { path: 'documents/:id',     element: <DocumentDetail />  },
      { path: 'clients',           element: <ClientsPage />     },
      { path: 'clients/:id',       element: <ClientCard />      },
      { path: 'cases',             element: <CasesPage />       },
      { path: 'cases/:id',         element: <CaseDetail />      },
      { path: 'action-plan',       element: <ActionPlanPage />  },
      { path: 'search',            element: <SearchPage />      },
      { path: 'queue',             element: <QueueMonitor />    },
      { path: 'action-queue',      element: <ActionQueue />     },
      { path: 'tasks',             element: <TasksPage />       },
      { path: 'templates',         element: <TemplatesPage />        },
      { path: 'media',             element: <MediaRegistryPage />    },
      { path: 'traffic',           element: <TrafficAlertsPage />   },
      { path: 'studies',           element: <StudiesPage />          },
      { path: 'evidence',          element: <EvidenceLockerPage />   },
      { path: 'stens',             element: <StensLibraryPage />     },
      { path: 'gmail',             element: <GmailBridgePage />      },
      { path: 'mail',              element: <MailWorkspacePage />    },
      { path: 'agents',             element: <AgentsWorkspacePage />  },
      { path: 'contacts',          element: <ContactsPage />         },
      { path: 'precedents',        element: <PrecedentsPage />       },
      { path: 'canvas/:id',        element: <CanvasPage />           },
      { path: 'activity',               element: <ActivityFeedPage />   },
      { path: 'admin',                  element: <DiagnosticsPage />    },
      { path: 'admin/mission-control',  element: <MissionControlPage /> },
      { path: 'admin/backup-settings',  element: <BackupSettingsPage /> },
      { path: 'admin/recovery',         element: <RecoveryPage />       },
      { path: '*',                      element: <NotFoundPage />       },
    ],
  },
]);
