import {
  SquaresFourIcon, GaugeIcon, CheckSquareIcon, PulseIcon, CalendarIcon, WarningIcon,
  BriefcaseIcon, FolderIcon, UsersIcon, AddressBookIcon, CarIcon,
  FilesIcon, FileTextIcon, TrayIcon, CheckCircleIcon, BroomIcon, ImageIcon, VaultIcon,
  ScalesIcon, StackIcon, NoteIcon, GavelIcon,
  RobotIcon,
  ChatCircleIcon, EnvelopeIcon, EnvelopeSimpleIcon,
  GraduationCapIcon,
  GearIcon, HardDriveIcon, ChartLineIcon, NotebookIcon, LockKeyIcon,
  CloudArrowUpIcon, ShieldWarningIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

/**
 * Declarative navigation model — the single source of truth for the sidebar
 * (and reusable later by the Cmd+K palette). Implements §4.7.6 of the UX roadmap:
 * an 8-group hierarchy that surfaces every existing route. Every `to` maps to a
 * route already defined in `router/index.tsx`; this adds no routes.
 */

export interface NavItem {
  to:    string;
  label: string;
  Icon:  Icon;
}

export interface NavGroup {
  id:          string;
  label:       string;
  Icon:        Icon;
  defaultOpen: boolean;
  items:       NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'work', label: 'עבודה שוטפת', Icon: SquaresFourIcon, defaultOpen: true,
    items: [
      { to: '/dashboard', label: 'לוח בקרה', Icon: GaugeIcon },
      { to: '/calendar',  label: 'יומן',     Icon: CalendarIcon },
      { to: '/deadlines', label: 'ראדאר מועדים', Icon: WarningIcon },
      { to: '/tasks',     label: 'משימות',   Icon: CheckSquareIcon },
      { to: '/activity',  label: 'פעילות',   Icon: PulseIcon },
    ],
  },
  {
    id: 'matters', label: 'תיקים ולקוחות', Icon: BriefcaseIcon, defaultOpen: true,
    items: [
      { to: '/cases',    label: 'תיקים',     Icon: FolderIcon },
      { to: '/clients',  label: 'לקוחות',    Icon: UsersIcon },
      { to: '/contacts', label: 'אנשי קשר',  Icon: AddressBookIcon },
      { to: '/traffic',  label: 'תיקי תנועה', Icon: CarIcon },
    ],
  },
  {
    id: 'documents', label: 'מסמכים וראיות', Icon: FilesIcon, defaultOpen: true,
    items: [
      { to: '/documents',    label: 'כל המסמכים',  Icon: FileTextIcon },
      { to: '/collections',  label: 'אוספים חכמים', Icon: StackIcon },
      { to: '/queue',        label: 'תור קליטה',   Icon: TrayIcon },
      { to: '/action-queue', label: 'תור אישורים', Icon: CheckCircleIcon },
      { to: '/action-plan',  label: 'תוכנית פעולה', Icon: BroomIcon },
      { to: '/media',        label: 'מדיה וסריקות', Icon: ImageIcon },
      { to: '/evidence',     label: 'כספת ראיות',  Icon: VaultIcon },
    ],
  },
  {
    id: 'legal', label: 'מנוע משפטי', Icon: ScalesIcon, defaultOpen: false,
    items: [
      { to: '/templates',  label: 'תבניות הליך',   Icon: StackIcon },
      { to: '/rules',      label: 'כללי סדרי דין',  Icon: GavelIcon },
      { to: '/stens',      label: 'טפסים (Stens)', Icon: NoteIcon },
      { to: '/precedents',        label: 'תקדימים',          Icon: GavelIcon },
      { to: '/judgment-library', label: 'ספריית פסקי דין',  Icon: GavelIcon },
      { to: '/entities',   label: 'ישויות',         Icon: AddressBookIcon },
    ],
  },
  {
    id: 'ai', label: 'בינה וסוכנים', Icon: RobotIcon, defaultOpen: false,
    items: [
      { to: '/agents', label: 'סוכני AI', Icon: RobotIcon },
    ],
  },
  {
    id: 'comms', label: 'תקשורת', Icon: ChatCircleIcon, defaultOpen: false,
    items: [
      { to: '/communications', label: 'מרכז תקשורת', Icon: ChatCircleIcon },
      { to: '/mail',  label: 'מחולל מייל', Icon: EnvelopeIcon },
      { to: '/gmail', label: 'חיבור Gmail', Icon: EnvelopeSimpleIcon },
    ],
  },
  {
    id: 'studies', label: 'לימודים', Icon: GraduationCapIcon, defaultOpen: false,
    items: [
      { to: '/studies', label: 'מרכז אקדמי', Icon: GraduationCapIcon },
    ],
  },
  {
    id: 'admin', label: 'מערכת (מנהל)', Icon: GearIcon, defaultOpen: false,
    items: [
      { to: '/admin',                 label: 'אבחון מערכת',  Icon: HardDriveIcon },
      { to: '/admin/mission-control', label: 'מרכז בקרה',    Icon: ChartLineIcon },
      { to: '/admin/journal',         label: 'יומן ביקורת',  Icon: NotebookIcon },
      { to: '/admin/rbac',            label: 'הרשאות',       Icon: LockKeyIcon },
      { to: '/admin/backup-settings', label: 'הגדרות גיבוי', Icon: CloudArrowUpIcon },
      { to: '/admin/recovery',        label: 'מצב שחזור',    Icon: ShieldWarningIcon },
    ],
  },
];

/** Default expand/collapse map seeded from each group's `defaultOpen`. */
export const DEFAULT_EXPANDED: Record<string, boolean> = Object.fromEntries(
  NAV_GROUPS.map((g) => [g.id, g.defaultOpen]),
);

/** Flat list of every nav item — useful for active-route matching and the palette. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Returns the group id that owns the given pathname via longest-prefix match,
 * so `/cases/123` resolves to the "matters" group and `/admin/journal` resolves
 * to "admin" (not "/admin"). Returns null when nothing matches.
 */
export function groupIdForPath(pathname: string): string | null {
  let bestId: string | null = null;
  let bestLen = -1;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const matches = pathname === item.to || pathname.startsWith(item.to + '/');
      if (matches && item.to.length > bestLen) {
        bestLen = item.to.length;
        bestId  = group.id;
      }
    }
  }
  return bestId;
}
