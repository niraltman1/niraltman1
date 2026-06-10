import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/hooks.js', () => ({
  useLegalSources: () => ({
    data: { stats: {}, sources: [] },
    isLoading: false,
  }),
  useLegalSource: () => ({ data: null, isLoading: false }),
  useLegalCorpusSearch: () => ({ data: [], isLoading: false }),
  useAddToShelf: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useDraftsUsingSection: () => ({ data: [] }),
}));

vi.mock('@/store/index.js', () => ({
  useUIStore: () => ({ selectedDraftId: null, selectDraft: vi.fn() }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

import { LegalCorpusPage } from '../LegalCorpusPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <LegalCorpusPage />
    </MemoryRouter>,
  );
}

describe('LegalCorpusPage', () => {
  it('renders without crashing', () => {
    renderPage();
  });

  it('shows corpus/library heading in Hebrew', () => {
    renderPage();
    const found =
      screen.queryAllByText(/קורפוס/).length > 0 ||
      screen.queryAllByText(/חקיקה/).length > 0 ||
      screen.queryAllByText(/חיפוש/).length > 0 ||
      screen.queryAllByText(/ספריית/).length > 0;
    expect(found).toBe(true);
  });
});
