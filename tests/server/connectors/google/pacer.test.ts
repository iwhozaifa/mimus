import { QuotaPacer } from '@/src/server/connectors/google/pacer';
import { describe, expect, it, vi } from 'vitest';

function fakeClock() {
  let now = 0;
  const sleep = vi.fn<(ms: number) => Promise<void>>(async (ms) => {
    now += ms;
  });
  return { now: () => now, sleep, advance: (ms: number) => (now += ms) };
}

describe('QuotaPacer', () => {
  it('spaces calls evenly so units spent never outrun the per-minute budget', async () => {
    const clock = fakeClock();
    // 3,000 units/min -> 50 units/sec -> a 40-unit call every 800ms.
    const pacer = new QuotaPacer({ unitsPerMinute: 3000, ...clock });

    await pacer.take(40);
    await pacer.take(40);
    await pacer.take(40);

    expect(clock.sleep.mock.calls.map(([ms]) => ms)).toEqual([800, 800]);
  });

  it('does not wait when enough time has already passed between calls', async () => {
    const clock = fakeClock();
    const pacer = new QuotaPacer({ unitsPerMinute: 3000, ...clock });

    await pacer.take(40);
    clock.advance(5000);
    await pacer.take(40);

    expect(clock.sleep).not.toHaveBeenCalled();
  });

  it('halves its rate after a rate-limit hit, never below the floor', async () => {
    const clock = fakeClock();
    const pacer = new QuotaPacer({ unitsPerMinute: 3000, minUnitsPerMinute: 1000, ...clock });

    pacer.slowDown();
    expect(pacer.unitsPerMinute).toBe(1500);
    pacer.slowDown();
    pacer.slowDown();
    expect(pacer.unitsPerMinute).toBe(1000);
  });

  it('recovers gradually toward the configured budget after sustained success', async () => {
    const clock = fakeClock();
    const pacer = new QuotaPacer({
      unitsPerMinute: 3000,
      minUnitsPerMinute: 500,
      recoverAfter: 2,
      ...clock,
    });

    pacer.slowDown(); // 1500
    await pacer.take(10);
    await pacer.take(10); // 2 successes -> +10% of budget
    expect(pacer.unitsPerMinute).toBe(1800);

    for (let i = 0; i < 40; i++) await pacer.take(10);
    expect(pacer.unitsPerMinute).toBe(3000);
  });
});
