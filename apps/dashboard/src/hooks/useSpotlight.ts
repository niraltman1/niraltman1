import { useEffect, useCallback } from 'react';
import { useUIStore } from '@/store/index.js';

/** True when focus is in a field where a bare keypress must not be hijacked. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Registers the global keyboard shortcuts that open Spotlight:
 *  - ⌘K / Ctrl+K — full search + command palette.
 *  - "n" / "+"   — global Quick-Add (§4.6.1); opens the palette with create
 *                  commands surfaced. Suppressed while typing in a field.
 * Must be mounted once at the root of the app.
 */
export function useSpotlightShortcut(): void {
  const openSpotlight = useUIStore((s) => s.openSpotlight);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSpotlight();
        return;
      }
      // Quick-Add: bare "n" or "+" (no modifiers), only outside input fields.
      if (
        (e.key === 'n' || e.key === '+') &&
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault();
        openSpotlight();
      }
    },
    [openSpotlight],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
