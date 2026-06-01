import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar.js';
import { useUIStore } from '@/store/index.js';
import { DEFAULT_EXPANDED, NAV_GROUPS } from '../nav-config.js';

function renderSidebar(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar — grouped navigation (§4.7.6)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState({ sidebarCollapsed: false, expandedGroups: { ...DEFAULT_EXPANDED } });
  });

  it('renders all 8 group headers', () => {
    renderSidebar();
    expect(NAV_GROUPS).toHaveLength(8);
    for (const g of NAV_GROUPS) {
      expect(screen.getByText(g.label)).toBeTruthy();
    }
  });

  it('shows items of default-open groups and hides collapsed ones', () => {
    renderSidebar();
    expect(screen.getByText('לוח בקרה')).toBeTruthy();       // work group (open)
    expect(screen.queryByText('יומן ביקורת')).toBeNull();    // admin group (collapsed)
  });

  it('auto-expands the group owning a collapsed-by-default deep route', () => {
    renderSidebar('/admin/journal');
    expect(screen.getByText('יומן ביקורת')).toBeTruthy();
  });

  it('auto-expands via longest-prefix match for nested detail routes', () => {
    renderSidebar('/precedents');                            // legal group (collapsed)
    expect(screen.getByText('תקדימים')).toBeTruthy();
  });

  it('moves "report a bug" into the admin group', () => {
    renderSidebar('/admin');
    expect(screen.getByText('דווח על באג')).toBeTruthy();
  });
});
