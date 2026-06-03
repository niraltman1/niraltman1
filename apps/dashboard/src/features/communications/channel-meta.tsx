import { TelegramLogoIcon, WhatsappLogoIcon, EnvelopeIcon, PhoneIcon } from '@phosphor-icons/react';
import type { IconWeight } from '@phosphor-icons/react';
import type { CommChannel, ConversationStatus } from '@/api/hooks.js';

type IconCmp = React.ComponentType<{ size?: number; className?: string; weight?: IconWeight }>;

interface ChannelMeta { label: string; Icon: IconCmp; accent: string }

export const CHANNEL_META: Record<CommChannel, ChannelMeta> = {
  telegram: { label: 'טלגרם',   Icon: TelegramLogoIcon, accent: 'text-sky-400'    },
  whatsapp: { label: 'וואטסאפ', Icon: WhatsappLogoIcon, accent: 'text-emerald-400' },
  email:    { label: 'אימייל',  Icon: EnvelopeIcon,     accent: 'text-amber-400'  },
  phone:    { label: 'טלפון',   Icon: PhoneIcon,        accent: 'text-parchment/60' },
};

export const STATUS_META: Record<ConversationStatus, { label: string; cls: string }> = {
  open:   { label: 'פתוח',  cls: 'badge badge-blue'    },
  triage: { label: 'טריאז׳', cls: 'badge badge-gold'    },
  closed: { label: 'סגור',  cls: 'badge badge-neutral' },
};

/** Hebrew-locale short timestamp for message bubbles. */
export function commTime(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
