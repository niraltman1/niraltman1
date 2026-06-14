import { CircleNotchIcon, PuzzlePieceIcon } from '@phosphor-icons/react';
import { usePlugins } from '@/api/hooks.js';

export function PluginsPanel() {
  const { data, isLoading } = usePlugins();
  const plugins = data?.plugins ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-parchment/40 text-sm py-4 justify-center">
        <CircleNotchIcon size={14} className="animate-spin" />
        טוען תוספים…
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <div className="text-parchment/40 text-sm text-center py-6">
        אין תוספים טעונים
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {plugins.map((name) => (
        <li key={name}
            className="flex items-center gap-2 px-3 py-2 rounded border border-parchment/5
                       bg-navy-900/20 text-parchment/80 text-sm">
          <PuzzlePieceIcon size={14} className="text-gold shrink-0" weight="duotone" />
          <span className="font-mono">{name}</span>
        </li>
      ))}
    </ul>
  );
}
