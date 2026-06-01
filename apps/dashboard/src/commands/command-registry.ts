import type { ComponentType } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { GavelIcon, UserPlusIcon, CheckSquareIcon } from '@phosphor-icons/react';
import type { IconWeight } from '@phosphor-icons/react';

/**
 * Command registry for the Cmd+K palette and the global Quick-Add ("n" / "+").
 * Implements §4.6.1 (global create) + §4.6.4 (palette runs commands, not only navigate).
 *
 * Each command reuses an existing create flow by navigating to its list page with
 * `?new=1`; the page opens its existing form when that param is present — no new
 * forms, no global modal-state refactor.
 */

export interface CommandContext {
  navigate: NavigateFunction;
}

export interface Command {
  id:       string;
  labelHe:  string;
  keywords: string[];
  Icon:     ComponentType<{ size?: number; className?: string; weight?: IconWeight }>;
  perform:  (ctx: CommandContext) => void;
}

export const COMMANDS: Command[] = [
  {
    id:       'create-case',
    labelHe:  'צור תיק חדש',
    keywords: ['תיק', 'תיק חדש', 'צור', 'חדש', 'new case', 'create case'],
    Icon:     GavelIcon,
    perform:  ({ navigate }) => navigate('/cases?new=1'),
  },
  {
    id:       'create-client',
    labelHe:  'צור לקוח חדש',
    keywords: ['לקוח', 'לקוח חדש', 'צור', 'חדש', 'new client', 'create client'],
    Icon:     UserPlusIcon,
    perform:  ({ navigate }) => navigate('/clients?new=1'),
  },
  {
    id:       'create-task',
    labelHe:  'צור משימה חדשה',
    keywords: ['משימה', 'משימה חדשה', 'צור', 'חדש', 'new task', 'create task'],
    Icon:     CheckSquareIcon,
    perform:  ({ navigate }) => navigate('/tasks?new=1'),
  },
];

/** Returns commands whose label or keywords match the query. Empty query → all. */
export function matchCommands(query: string): Command[] {
  let q = query.trim().toLowerCase();
  if (q.startsWith('>')) q = q.slice(1).trim(); // optional ">" command prefix
  if (q === '') return COMMANDS;
  return COMMANDS.filter(
    (c) =>
      c.labelHe.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.toLowerCase().includes(q)),
  );
}
