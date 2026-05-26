import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface SpotlightState {
  open: boolean;
  query: string;
}

interface UIState {
  sidebarCollapsed: boolean;
  spotlight: SpotlightState;
  selectedDocumentId: number | null;
  selectedClientId: number | null;
  selectedCaseId: number | null;
}

interface UIActions {
  toggleSidebar: () => void;
  openSpotlight: () => void;
  closeSpotlight: () => void;
  setSpotlightQuery: (query: string) => void;
  selectDocument: (id: number | null) => void;
  selectClient: (id: number | null) => void;
  selectCase: (id: number | null) => void;
}

export const useUIStore = create<UIState & UIActions>()(
  devtools(
    (set) => ({
      sidebarCollapsed:  false,
      spotlight:         { open: false, query: '' },
      selectedDocumentId: null,
      selectedClientId:   null,
      selectedCaseId:     null,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }), false, 'toggleSidebar'),

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
    { name: 'factum-il-ui' },
  ),
);
