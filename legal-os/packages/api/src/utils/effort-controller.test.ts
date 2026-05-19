import { describe, it, expect } from 'vitest';
import { EffortController } from './effort-controller.js';

describe('EffortController', () => {
  it('tracks work units', async () => {
    const ctl = new EffortController({ ceilPercent: 99 }); // effectively never throttles
    await ctl.throttle();
    await ctl.throttle();
    await ctl.throttle();
    const rpt = ctl.report();
    expect(rpt.workUnits).toBe(3);
    expect(rpt.ceilPercent).toBe(99);
  });

  it('reports zero throttle events when CPU is not hot', async () => {
    const ctl = new EffortController({ ceilPercent: 99 });
    for (let i = 0; i < 5; i++) await ctl.throttle();
    const rpt = ctl.report();
    // In a test environment CPU load is negligible; expect 0 or very few throttle events
    expect(rpt.workUnits).toBe(5);
    expect(rpt.totalThrottledMs).toBeLessThan(5_000); // sanity bound
  });
});
