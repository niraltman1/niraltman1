import { useEffect, useCallback } from 'react';
import { useUIStore } from '@/store/index.js';

/**
 * Registers the global ⌘K / Ctrl+K keyboard shortcut to open Spotlight search.
 * Must be mounted once at the root of the app.
 */
export function useSpotlightShortcut(): void {
  const openSpotlight = useUIStore((s) => s.openSpotlight);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
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
