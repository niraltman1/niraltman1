/**
 * node:test suite for EffortController.
 * Run with: node --import tsx/esm --test src/utils/effort-controller.node-test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EffortController } from './effort-controller.js';

describe('EffortController', () => {
  it('tracks work units', async () => {
    const ctl = new EffortController({ ceilPercent: 99 });
    await ctl.throttle();
    await ctl.throttle();
    await ctl.throttle();
    const rpt = ctl.report();
    assert.equal(rpt.workUnits, 3);
    assert.equal(rpt.ceilPercent, 99);
  });

  it('total throttled time is sane when CPU is not hot', async () => {
    const ctl = new EffortController({ ceilPercent: 99 });
    for (let i = 0; i < 5; i++) await ctl.throttle();
    const rpt = ctl.report();
    assert.equal(rpt.workUnits, 5);
    assert.ok(rpt.totalThrottledMs < 5_000, `Expected < 5000ms, got ${rpt.totalThrottledMs}`);
  });
});
