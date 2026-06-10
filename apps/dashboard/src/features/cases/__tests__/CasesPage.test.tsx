import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/hooks.js', () => ({
  useCases: () => ({ data: { items: [], total: 0 }, isLoading: false }),
  useClients: () => ({ data: { items: [] } }),
  useCreateCase: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

import { CasesPage } from '../CasesPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <CasesPage />
    </MemoryRouter>,
  );
}

describe('CasesPage', () => {
  it('renders without crashing', () => {
    renderPage();
  });

  it('shows cases heading in Hebrew', () => {
    renderPage();
    const found =
      screen.queryAllByText(/תיקים/).length > 0 ||
      screen.queryAllByText(/תיק/).length > 0;
    expect(found).toBe(true);
  });
});
