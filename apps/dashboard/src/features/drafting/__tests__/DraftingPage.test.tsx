import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/hooks.js', () => ({
  useDrafts: () => ({ data: [], isLoading: false }),
  useCreateDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useForkDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useCases: () => ({ data: { items: [], total: 0 } }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

import { DraftingPage } from '../DraftingPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <DraftingPage />
    </MemoryRouter>,
  );
}

describe('DraftingPage', () => {
  it('renders without crashing', () => {
    renderPage();
  });

  it('shows page heading in Hebrew', () => {
    renderPage();
    const found =
      screen.queryAllByText(/טיוטות/).length > 0 ||
      screen.queryAllByText(/ניסוחים/).length > 0;
    expect(found).toBe(true);
  });

  it('shows empty state or new-draft button when no drafts', () => {
    renderPage();
    const found =
      screen.queryAllByText(/אין טיוטות/).length > 0 ||
      screen.queryAllByText(/טרם נוצרו/).length > 0 ||
      screen.queryAllByText(/טיוטה חדשה/).length > 0 ||
      screen.queryAllByText(/חדשה/).length > 0;
    expect(found).toBe(true);
  });
});
