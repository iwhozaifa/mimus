import { sleep as defaultSleep } from '@/src/lib/sleep';

// Client-side throttle for Gmail's per-user quota (6,000 units/min for
// projects created on/after 2026-05-01; messages.get = 20, threads.get =
// 40). Spends units at a steady rate instead of bursting and then sitting
// in withGoogleRateLimitRetry's backoff -- live testing hit the limit at
// well under the documented budget, which suggests Google enforces it over
// windows shorter than a minute, so even spacing matters, not just totals.
//
// Additive-increase/multiplicative-decrease: slowDown() halves the rate
// after a rate-limit hit, and each `recoverAfter` consecutive successful
// takes add back 10% of the configured budget.

export interface QuotaPacerOptions {
  unitsPerMinute: number;
  minUnitsPerMinute?: number;
  recoverAfter?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export class QuotaPacer {
  private readonly maxUnitsPerMinute: number;
  private readonly minUnitsPerMinute: number;
  private readonly recoverAfter: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private rate: number;
  private nextAllowedAt = 0;
  private successesSinceChange = 0;

  constructor({
    unitsPerMinute,
    minUnitsPerMinute = Math.max(1, Math.floor(unitsPerMinute / 8)),
    recoverAfter = 20,
    now = Date.now,
    sleep = defaultSleep,
  }: QuotaPacerOptions) {
    this.maxUnitsPerMinute = unitsPerMinute;
    this.minUnitsPerMinute = minUnitsPerMinute;
    this.recoverAfter = recoverAfter;
    this.now = now;
    this.sleep = sleep;
    this.rate = unitsPerMinute;
  }

  get unitsPerMinute(): number {
    return this.rate;
  }

  // Waits until `units` can be spent without exceeding the current rate,
  // then reserves them.
  async take(units: number): Promise<void> {
    const wait = this.nextAllowedAt - this.now();
    if (wait > 0) await this.sleep(wait);
    this.nextAllowedAt = Math.max(this.now(), this.nextAllowedAt) + (units * 60_000) / this.rate;

    this.successesSinceChange++;
    if (this.successesSinceChange >= this.recoverAfter && this.rate < this.maxUnitsPerMinute) {
      this.rate = Math.min(this.maxUnitsPerMinute, this.rate + this.maxUnitsPerMinute * 0.1);
      this.successesSinceChange = 0;
    }
  }

  slowDown(): void {
    this.rate = Math.max(this.minUnitsPerMinute, Math.floor(this.rate / 2));
    this.successesSinceChange = 0;
  }
}
