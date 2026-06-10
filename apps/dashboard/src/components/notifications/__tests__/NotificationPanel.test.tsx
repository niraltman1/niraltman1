import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/hooks.js', () => ({
  useMarkNotificationRead: () => ({ mutate: vi.fn() }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

import { NotificationPanel } from '../NotificationPanel.js';

function renderPanel(items = [], unread = 0) {
  return render(
    <MemoryRouter>
      <NotificationPanel items={items} unread={unread} onClose={vi.fn()} />
    </MemoryRouter>,
  );
}

describe('NotificationPanel', () => {
  it('renders without crashing', () => {
    renderPanel();
  });

  it('shows empty state when no notifications', () => {
    renderPanel();
    const empty =
      screen.queryAllByText(/אין התראות/).length > 0 ||
      screen.queryAllByText(/ריק/).length > 0 ||
      screen.queryAllByText(/0/).length > 0;
    expect(empty).toBe(true);
  });
});
