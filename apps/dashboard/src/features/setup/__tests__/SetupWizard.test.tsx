import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock react-router-dom's useNavigate ─────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ─── Import subject under test ────────────────────────────────────────────────
import { SetupWizard } from '../SetupWizard.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const healthyStatus = {
  completed:    false,
  db:           { healthy: true },
  migrations:   { healthy: true, detail: 'current=55 expected>=37' },
  ollama:       { healthy: true, detail: 'http 200' },
  disk:         { healthy: true, detail: 'free=5000MB min=100MB' },
  orgDirectory: 'C:\\Legal\\Cases',
};

function stubFetch(data: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok:   true,
    json: async () => ({ success: true, data }),
  }));
}

function renderWizard() {
  return render(
    <MemoryRouter>
      <SetupWizard />
    </MemoryRouter>,
  );
}

describe('SetupWizard — Step 1 (Welcome)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubFetch(healthyStatus);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders welcome heading in Hebrew', async () => {
    renderWizard();
    // findByText waits until the element appears (status loaded)
    expect(await screen.findByText(/ברוך הבא/)).toBeDefined();
  });

  it('shows "בדיקת מערכת" call-to-action button', async () => {
    renderWizard();
    expect(await screen.findByText('בדיקת מערכת')).toBeDefined();
  });

  it('redirects to /dashboard when status.completed=true', async () => {
    stubFetch({ ...healthyStatus, completed: true });
    renderWizard();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });
});

describe('SetupWizard — Step 2 (System Check)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubFetch(healthyStatus);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function advanceToStep2() {
    renderWizard();
    // Wait until status loads so the wizard is fully initialized
    await screen.findByText(/ברוך הבא/);
    await act(async () => { screen.getByText('בדיקת מערכת').click(); });
    // Wait for system-check badges to appear (status rendered in step 2)
    await screen.findByText('מסד נתונים');
  }

  it('"המשך" button is enabled when db and migrations are healthy', async () => {
    await advanceToStep2();
    const continueBtn = screen.getAllByText('המשך')[0]!.closest('button') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(false);
  });

  it('"המשך" button is disabled when db.healthy=false', async () => {
    stubFetch({ ...healthyStatus, db: { healthy: false, detail: 'SQLITE_BUSY' } });

    renderWizard();
    await screen.findByText(/ברוך הבא/);
    await act(async () => { screen.getByText('בדיקת מערכת').click(); });
    await screen.findByText('מסד נתונים');

    // getAllByText finds the <span> inside the button; traverse up to the <button>
    const continueBtn = screen.getAllByText('המשך')[0]!.closest('button') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
  });

  it('Ollama failure shows warning but does not disable "המשך"', async () => {
    stubFetch({ ...healthyStatus, ollama: { healthy: false, detail: 'connection refused' } });

    renderWizard();
    await screen.findByText(/ברוך הבא/);
    await act(async () => { screen.getByText('בדיקת מערכת').click(); });
    await screen.findByText('אזהרה');

    const continueBtn = screen.getAllByText('המשך')[0]!.closest('button') as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(false);
  });
});

describe('SetupWizard — Step 3 (Org Directory)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubFetch(healthyStatus);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function advanceToStep3() {
    renderWizard();
    await screen.findByText(/ברוך הבא/);
    // Step 1 → 2
    await act(async () => { screen.getByText('בדיקת מערכת').click(); });
    await screen.findByText('מסד נתונים');
    // Step 2 → 3
    await act(async () => { screen.getAllByText('המשך')[0]!.click(); });
    await screen.findByText('תיקיית עבודה');
  }

  it('shows org directory heading', async () => {
    await advanceToStep3();
    expect(screen.getByText('תיקיית עבודה')).toBeDefined();
  });

  it('"עדכן" button calls POST /api/setup/org-dir', async () => {
    // Route fetch by URL so status calls always return healthyStatus
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok:   true,
        json: async () =>
          String(url).includes('org-dir')
            ? { success: true, data: { ok: true, orgDirectory: 'C:\\Legal\\Cases' } }
            : { success: true, data: healthyStatus },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await advanceToStep3();
    await act(async () => { screen.getByText('עדכן').click(); });

    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, ...unknown[]][];
      const saveCall = calls.find((c) => c[0]?.includes?.('org-dir'));
      expect(saveCall).toBeDefined();
    });
  });
});

describe('SetupWizard — Step 5 (Done)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubFetch(healthyStatus);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function advanceToStep5() {
    renderWizard();
    await screen.findByText(/ברוך הבא/);

    // Step 1 → 2
    await act(async () => { screen.getByText('בדיקת מערכת').click(); });
    await screen.findByText('מסד נתונים');

    // Step 2 → 3
    await act(async () => { screen.getAllByText('המשך')[0]!.click(); });
    await screen.findByText('תיקיית עבודה');

    // Step 3 → 4
    await act(async () => { screen.getAllByText('המשך')[0]!.click(); });
    await screen.findByText('מנוע AI');

    // Step 4 → 5
    await act(async () => { screen.getAllByText('המשך')[0]!.click(); });
    await screen.findByText('פתח את Factum-IL');
  }

  it('"פתח את Factum-IL" calls POST /api/setup/complete then navigates to /dashboard', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok:   true,
        json: async () =>
          String(url).includes('complete')
            ? {}
            : { success: true, data: healthyStatus },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await advanceToStep5();
    await act(async () => { screen.getByText('פתח את Factum-IL').click(); });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });
});

// ─── Pure function behaviour via component interaction ────────────────────────

describe('SetupWizard API helpers (pure function tests)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls /api/setup/status on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok:   true,
      json: async () => ({ success: true, data: healthyStatus }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderWizard();
    await screen.findByText(/ברוך הבא/);

    const calls = (fetchMock.mock.calls as [string, ...unknown[]][]);
    expect(calls.some((c) => c[0]?.includes?.('/api/setup/status'))).toBe(true);
    unmount();
  });

  it('fetchSetupStatus: fetch failure leaves wizard in step 1 without crashing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { unmount } = renderWizard();
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());

    // Wizard must not crash — step 1 still visible
    expect(screen.getByText(/ברוך הבא/)).toBeDefined();
    unmount();
  });
});
