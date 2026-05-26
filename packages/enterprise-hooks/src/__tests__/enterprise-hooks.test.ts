import { describe, it, expect } from 'vitest';
import { createBetaCapabilityRegistry, getEnterpriseRegistry } from '../BetaCapabilityRegistry.js';

describe('BetaCapabilityRegistry', () => {
  it('all capabilities are disabled in beta tier', () => {
    const reg = createBetaCapabilityRegistry();
    expect(reg.multiUser.isEnabled()).toBe(false);
    expect(reg.centralizedStorage.isEnabled()).toBe(false);
    expect(reg.adminConsole.isEnabled()).toBe(false);
    expect(reg.enterpriseBackup.isEnabled()).toBe(false);
  });

  it('getCurrentUser returns null in beta tier', () => {
    const reg = createBetaCapabilityRegistry();
    expect(reg.multiUser.getCurrentUser()).toBeNull();
  });

  it('can() always returns false in beta tier', () => {
    const reg = createBetaCapabilityRegistry();
    const fakeUser = { userId: 'u1', displayName: 'Test', role: 'attorney' as const, firmId: 'f1' };
    expect(reg.multiUser.can(fakeUser, 'read', 'case-1')).toBe(false);
  });

  it('adminConsole.getConsoleUrl returns null in beta tier', () => {
    const reg = createBetaCapabilityRegistry();
    expect(reg.adminConsole.getConsoleUrl()).toBeNull();
  });

  it('enterpriseBackup.getConfig returns null in beta tier', () => {
    const reg = createBetaCapabilityRegistry();
    expect(reg.enterpriseBackup.getConfig()).toBeNull();
  });

  it('firm profile is beta tier', () => {
    const reg = createBetaCapabilityRegistry();
    expect(reg.firm?.licenseType).toBe('beta');
    expect(reg.firm?.maxUsers).toBe(1);
    expect(reg.firm?.features).toHaveLength(0);
  });

  it('singleton registry is stable', () => {
    const r1 = getEnterpriseRegistry();
    const r2 = getEnterpriseRegistry();
    expect(r1).toBe(r2);
  });
});
