import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { DEFAULT_EXPANDED } from '@/components/layout/nav-config.js';

interface SpotlightState {
  open: boolean;
  query: string;
}

interface UIState {
  sidebarCollapsed: boolean;
  expandedGroups: Record<string, boolean>;
  spotlight: SpotlightState;
  selectedDocumentId: number | null;
  selectedClientId: number | null;
  selectedCaseId: number | null;
}

interface UIActions {
  toggleSidebar: () => void;
  toggleNavGroup: (id: string) => void;
  setNavGroupOpen: (id: string, open: boolean) => void;
  openSpotlight: () => void;
  closeSpotlight: () => void;
  setSpotlightQuery: (query: string) => void;
  selectDocument: (id: number | null) => void;
  selectClient: (id: number | null) => void;
  selectCase: (id: number | null) => void;
}

export const useUIStore = create<UIState & UIActions>()(
  devtools(
    persist(
      (set) => ({
        sidebarCollapsed:  false,
        expandedGroups:    { ...DEFAULT_EXPANDED },
        spotlight:         { open: false, query: '' },
        selectedDocumentId: null,
        selectedClientId:   null,
        selectedCaseId:     null,

        toggleSidebar: () =>
          set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }), false, 'toggleSidebar'),

        toggleNavGroup: (id) =>
          set(
            (s) => ({ expandedGroups: { ...s.expandedGroups, [id]: !s.expandedGroups[id] } }),
            false,
            'toggleNavGroup',
          ),

        setNavGroupOpen: (id, open) =>
          set(
            (s) => (s.expandedGroups[id] === open
              ? s
              : { expandedGroups: { ...s.expandedGroups, [id]: open } }),
            false,
            'setNavGroupOpen',
          ),

        openSpotlight: () =>
          set((s) => ({ spotlight: { ...s.spotlight, open: true } }), false, 'openSpotlight'),

        closeSpotlight: () =>
          set({ spotlight: { open: false, query: '' } }, false, 'closeSpotlight'),

        setSpotlightQuery: (query) =>
          set((s) => ({ spotlight: { ...s.spotlight, query } }), false, 'setSpotlightQuery'),

        selectDocument: (id) =>
          set({ selectedDocumentId: id }, false, 'selectDocument'),

        selectClient: (id) =>
          set({ selectedClientId: id }, false, 'selectClient'),

        selectCase: (id) =>
          set({ selectedCaseId: id }, false, 'selectCase'),
      }),
      {
        name: 'factum-il-ui',
        // Persist only layout prefs — never transient spotlight/selection state.
        partialize: (s) => ({
          sidebarCollapsed: s.sidebarCollapsed,
          expandedGroups:   s.expandedGroups,
        }),
        // Merge persisted layout over freshly-seeded defaults so newly-added
        // groups always get a default, while user choices win for known groups.
        merge: (persisted, current) => {
          const p = (persisted ?? {}) as Partial<UIState>;
          return {
            ...current,
            ...p,
            expandedGroups: { ...DEFAULT_EXPANDED, ...(p.expandedGroups ?? {}) },
          };
        },
      },
    ),
    { name: 'factum-il-ui' },
  ),
);
