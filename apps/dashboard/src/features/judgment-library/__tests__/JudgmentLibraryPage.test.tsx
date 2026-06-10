import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/hooks.js', () => ({
  useJudgmentLibrary: () => ({ data: [], isLoading: false }),
  useJudgmentFullText: () => ({ data: null, isLoading: false }),
  useDeleteJudgment: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { JudgmentLibraryPage } from '../JudgmentLibraryPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <JudgmentLibraryPage />
    </MemoryRouter>,
  );
}

describe('JudgmentLibraryPage', () => {
  it('renders without crashing', () => {
    renderPage();
  });

  it('shows library heading', () => {
    renderPage();
    const heading =
      screen.queryByText(/ספריית פסקי דין/) ??
      screen.queryByText(/פסקי דין/) ??
      screen.queryByText(/גאוון/);
    expect(heading).toBeTruthy();
  });

  it('shows empty state when no judgments', () => {
    renderPage();
    const empty =
      screen.queryByText(/לא נמצאו/) ??
      screen.queryByText(/אין פסקי/) ??
      screen.queryByText(/ריק/);
    expect(empty).toBeTruthy();
  });
});
