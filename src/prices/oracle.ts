import { median } from '../money.js';
import { unavailable } from '../errors.js';
import type { Logger } from '../logger.js';
import { PAIRS, type Pair, type PriceSource } from './sources.js';

interface Reading {
  price: bigint;
  at: number;
}

export interface Price {
  pair: Pair;
  price: bigint;
  /** Oldest reading that went into the price. */
  observedAt: number;
  sources: { name: string; price: bigint; at: number }[];
}

export interface OracleOptions {
  maxAgeMs: number;
  maxSpreadBps: number;
  now?: () => number;
  logger?: Logger;
}

/**
 * Keeps the latest reading from each source and prices a pair as the median
 * of the fresh ones. It never invents a price: with no fresh reading, or
 * fresh readings that disagree by more than `maxSpreadBps`, it refuses.
 */
export class PriceOracle {
  private readings = new Map<string, Reading>();
  private timer?: NodeJS.Timeout;
  private readonly now: () => number;

  constructor(
    private readonly sources: PriceSource[],
    private readonly opts: OracleOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  /** Fetches every source once. Failures are logged and leave old readings to age out. */
  async refresh(): Promise<void> {
    await Promise.all(
      this.sources.map(async (source) => {
        try {
          const at = this.now();
          for (const obs of await source.fetch()) {
            this.readings.set(`${source.name}|${obs.pair}`, { price: obs.price, at });
          }
        } catch (err) {
          this.opts.logger?.warn({ source: source.name, err: (err as Error).message }, 'price source failed');
        }
      }),
    );
  }

  start(intervalMs: number): Promise<void> {
    this.timer = setInterval(() => void this.refresh(), intervalMs);
    this.timer.unref();
    return this.refresh();
  }

  stop() {
    clearInterval(this.timer);
  }

  get(pair: Pair): Price {
    const cutoff = this.now() - this.opts.maxAgeMs;
    const fresh = this.sources
      .map((s) => ({ name: s.name, r: this.readings.get(`${s.name}|${pair}`) }))
      .filter((x): x is { name: string; r: Reading } => !!x.r && x.r.at >= cutoff)
      .map(({ name, r }) => ({ name, price: r.price, at: r.at }));

    if (fresh.length === 0) {
      throw unavailable(`no fresh price for ${pair}`, { pair, maxAgeMs: this.opts.maxAgeMs });
    }
    const prices = fresh.map((f) => f.price);
    const mid = median(prices);
    const lo = prices.reduce((a, b) => (b < a ? b : a));
    const hi = prices.reduce((a, b) => (b > a ? b : a));
    const spreadBps = ((hi - lo) * 10_000n) / mid;
    if (spreadBps > BigInt(this.opts.maxSpreadBps)) {
      throw unavailable(`price sources disagree on ${pair}`, { pair, spreadBps: Number(spreadBps) });
    }
    return { pair, price: mid, observedAt: Math.min(...fresh.map((f) => f.at)), sources: fresh };
  }

  /** Every pair that can currently be priced; unpriceable pairs are listed with the reason. */
  snapshot() {
    return PAIRS.map((pair) => {
      try {
        return { ok: true as const, ...this.get(pair) };
      } catch (err) {
        return { ok: false as const, pair, error: (err as Error).message };
      }
    });
  }
}
