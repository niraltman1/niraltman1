import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/hooks.js', () => ({
  useCommUnknownInbox: () => ({ data: [], isLoading: false }),
}));

vi.mock('../CommunicationsPanel.js', () => ({
  CommunicationsPanel: () => <div>תקשורת</div>,
}));

import { CommunicationsInboxPage } from '../CommunicationsInboxPage.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <CommunicationsInboxPage />
    </MemoryRouter>,
  );
}

describe('CommunicationsInboxPage', () => {
  it('renders without crashing', () => {
    renderPage();
  });

  it('shows inbox-related Hebrew text', () => {
    renderPage();
    const found =
      screen.queryAllByText(/תיבת/).length > 0 ||
      screen.queryAllByText(/הודעות/).length > 0 ||
      screen.queryAllByText(/תקשורת/).length > 0 ||
      screen.queryAllByText(/אלמונים/).length > 0;
    expect(found).toBe(true);
  });
});
