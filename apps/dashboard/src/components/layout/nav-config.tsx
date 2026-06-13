import {
  GaugeIcon, HouseIcon,
  ScalesIcon, FolderIcon, UsersIcon, AddressBookIcon, CarIcon,
  FilesIcon, FileTextIcon, TrayIcon, CheckCircleIcon, BroomIcon, ImageIcon, VaultIcon, StackIcon,
  MagnifyingGlassIcon, BookOpenIcon, GavelIcon, NoteIcon,
  RobotIcon,
  CalendarIcon, WarningIcon, CheckSquareIcon, ChatCircleIcon, EnvelopeIcon, EnvelopeSimpleIcon,
  CurrencyCircleDollarIcon, PulseIcon, GraduationCapIcon,
  GearIcon, HardDriveIcon, ChartLineIcon, NotebookIcon, LockKeyIcon, CloudArrowUpIcon, ShieldWarningIcon,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

/**
 * Declarative navigation model — single source of truth for the sidebar
 * and Cmd+K palette. Implements the dashboard-first domain hierarchy:
 * 8 groups organised by business workflow rather than technical module.
 * Every `to` maps to a route already defined in `router/index.tsx`.
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
    id: 'home', label: 'לוח בקרה', Icon: HouseIcon, defaultOpen: true,
    items: [
      { to: '/dashboard', label: 'שולחן העבודה', Icon: GaugeIcon },
      { to: '/search',    label: 'חיפוש',          Icon: MagnifyingGlassIcon },
    ],
  },
  {
    id: 'cases', label: 'תיקים', Icon: ScalesIcon, defaultOpen: true,
    items: [
      { to: '/cases',   label: 'כל התיקים',    Icon: FolderIcon },
      { to: '/traffic', label: 'תיקי תנועה',   Icon: CarIcon },
    ],
  },
  {
    id: 'clients', label: 'לקוחות', Icon: UsersIcon, defaultOpen: false,
    items: [
      { to: '/clients',  label: 'כל הלקוחות',  Icon: UsersIcon },
      { to: '/contacts', label: 'אנשי קשר',     Icon: AddressBookIcon },
    ],
  },
  {
    id: 'documents', label: 'מסמכים', Icon: FilesIcon, defaultOpen: false,
    items: [
      { to: '/documents',    label: 'כל המסמכים',   Icon: FileTextIcon },
      { to: '/collections',  label: 'אוספים חכמים', Icon: StackIcon },
      { to: '/evidence',     label: 'כספת ראיות',   Icon: VaultIcon },
      { to: '/media',        label: 'מדיה וסריקות', Icon: ImageIcon },
      { to: '/queue',        label: 'תור קליטה',    Icon: TrayIcon },
      { to: '/action-queue',    label: 'תור אישורים',    Icon: CheckCircleIcon },
      { to: '/action-plan',     label: 'תוכנית פעולה',  Icon: BroomIcon },
      { to: '/insights-review', label: 'בדיקת תובנות AI', Icon: RobotIcon },
    ],
  },
  {
    id: 'research', label: 'מחקר משפטי', Icon: MagnifyingGlassIcon, defaultOpen: false,
    items: [
      { to: '/templates',        label: 'תבניות הליך',          Icon: StackIcon },
      { to: '/rules',            label: 'כללי סדרי דין',       Icon: ScalesIcon },
      { to: '/stens',            label: 'טפסים (Stens)',        Icon: NoteIcon },
      { to: '/precedents',       label: 'תקדימים',              Icon: GavelIcon },
      { to: '/library',          label: 'ספריית חקיקה ופסיקה', Icon: BookOpenIcon },
      { to: '/legal-corpus',     label: 'חוקים ישראליים',       Icon: BookOpenIcon },
      { to: '/entities',         label: 'ישויות',               Icon: AddressBookIcon },
      { to: '/insolvency',       label: 'הליכי חדלות',          Icon: ScalesIcon },
    ],
  },
  {
    id: 'ai', label: 'בינה מלאכותית', Icon: RobotIcon, defaultOpen: false,
    items: [
      { to: '/agents',   label: 'סוכני AI', Icon: RobotIcon },
      { to: '/drafting', label: 'טיוטות',   Icon: FileTextIcon },
    ],
  },
  {
    id: 'office', label: 'משרד', Icon: CalendarIcon, defaultOpen: false,
    items: [
      { to: '/calendar',       label: 'יומן',            Icon: CalendarIcon },
      { to: '/deadlines',      label: 'ראדאר מועדים',    Icon: WarningIcon },
      { to: '/tasks',          label: 'משימות',           Icon: CheckSquareIcon },
      { to: '/communications', label: 'מרכז תקשורת',     Icon: ChatCircleIcon },
      { to: '/mail',           label: 'מחולל מייל',       Icon: EnvelopeIcon },
      { to: '/gmail',          label: 'חיבור Gmail',      Icon: EnvelopeSimpleIcon },
      { to: '/ledger',         label: 'פנקס תשלומים',    Icon: CurrencyCircleDollarIcon },
      { to: '/activity',       label: 'פעילות',           Icon: PulseIcon },
      { to: '/studies',        label: 'מרכז אקדמי',       Icon: GraduationCapIcon },
    ],
  },
  {
    id: 'system', label: 'מערכת', Icon: GearIcon, defaultOpen: false,
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
 * so `/cases/123` resolves to the "cases" group and `/admin/journal` resolves
 * to "system" (not "/admin"). Returns null when nothing matches.
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
