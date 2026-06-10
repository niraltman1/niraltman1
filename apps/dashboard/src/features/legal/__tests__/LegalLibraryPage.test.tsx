import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/hooks.js', () => ({
  useLegalSources: () => ({ data: { stats: {}, sources: [] }, isLoading: false }),
  useLegalSource: () => ({ data: null, isLoading: false }),
  useLegalCorpusSearch: () => ({ data: [], isLoading: false }),
  useAddToShelf: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useDraftsUsingSection: () => ({ data: [] }),
  useJudgmentLibrary: () => ({ data: [], isLoading: false }),
  useJudgmentFullText: () => ({ data: null, isLoading: false }),
  useDeleteJudgment: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/store/index.js', () => ({
  useUIStore: () => ({ selectedDraftId: null, selectDraft: vi.fn() }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

import { LegalLibraryPage } from '../LegalLibraryPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <LegalLibraryPage />
    </MemoryRouter>,
  );
}

describe('LegalLibraryPage', () => {
  it('renders without crashing', () => {
    renderPage();
  });

  it('shows both tab buttons', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /חקיקה/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /פסיקה/ })).toBeTruthy();
  });

  it('shows legislation content by default', () => {
    renderPage();
    expect(screen.queryAllByText(/מאגר חקיקה|חיפוש בחקיקה/).length).toBeGreaterThan(0);
  });

  it('switches to verdicts tab when clicked', () => {
    renderPage();
    const tab = screen.getByRole('button', { name: /פסיקה/ });
    fireEvent.click(tab);
    expect(screen.queryAllByText(/ספריית פסקי דין|פסקי דין/).length).toBeGreaterThan(0);
  });
});
