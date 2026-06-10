import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/hooks.js', () => ({
  usePrecedents: () => ({ data: [], isLoading: false }),
  useDeletePrecedent: () => ({ mutate: vi.fn(), isPending: false }),
  useJudgmentLibrary: () => ({ data: [] }),
}));

import { PrecedentsPage } from '../PrecedentsPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <PrecedentsPage />
    </MemoryRouter>,
  );
}

describe('PrecedentsPage', () => {
  it('renders without crashing', () => {
    renderPage();
  });

  it('shows page heading in Hebrew', () => {
    renderPage();
    const found =
      screen.queryAllByText(/תקדימים/).length > 0 ||
      screen.queryAllByText(/פסקי דין/).length > 0;
    expect(found).toBe(true);
  });
});
