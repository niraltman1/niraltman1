import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockRules: { data: unknown[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};

vi.mock('@/api/hooks.js', () => ({
  useRules: () => mockRules,
}));

import { RulesEnginePage } from '../RulesEnginePage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <RulesEnginePage />
    </MemoryRouter>,
  );
}

describe('RulesEnginePage', () => {
  it('renders page heading', () => {
    renderPage();
    expect(screen.getByText(/מנוע כללים/)).toBeTruthy();
  });

  it('shows empty state when no rules', () => {
    renderPage();
    expect(screen.getByText(/לא הוגדרו כללים/)).toBeTruthy();
  });

  it('shows legal-review disclaimer', () => {
    renderPage();
    expect(screen.getByText(/בדיקה של עו"ד/)).toBeTruthy();
  });

  it('shows loading state', () => {
    mockRules.isLoading = true;
    mockRules.data = [];
    renderPage();
    expect(screen.getByText(/טוען כללים/)).toBeTruthy();
    mockRules.isLoading = false;
  });

  it('shows rule count in header', () => {
    mockRules.data = [
      {
        id: 1, procedureType: 'civil', ruleName: 'הגשת כתב תביעה',
        deadlineDays: 30, deadlineBasis: 'מסירה', description: null, sourceReference: null,
      },
    ];
    renderPage();
    expect(screen.getByText(/1 כללים/)).toBeTruthy();
    mockRules.data = [];
  });
});
