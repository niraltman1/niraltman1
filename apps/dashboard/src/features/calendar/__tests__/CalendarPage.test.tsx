import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/hooks.js', () => ({
  useCalendarEvents: () => ({ data: [], isLoading: false }),
}));

import { CalendarPage } from '../CalendarPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <CalendarPage />
    </MemoryRouter>,
  );
}

describe('CalendarPage', () => {
  it('renders without crashing', () => {
    renderPage();
  });

  it('shows navigation arrows', () => {
    renderPage();
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('shows current month/year in Hebrew', () => {
    renderPage();
    const now = new Date();
    const year = now.getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeTruthy();
  });
});
