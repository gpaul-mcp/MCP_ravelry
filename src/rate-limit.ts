/**
 * Fixed-window request counter per client key. Small and in-memory: enough to
 * keep one self-hosted instance from burning through the Ravelry API quota.
 */
export class RateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #windows = new Map<string, { start: number; count: number }>();

  constructor(limit: number, windowMs = 60_000) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  /** Records a request; returns how many seconds to wait, or 0 if allowed. */
  hit(key: string, now = Date.now()): number {
    if (this.#limit === 0) return 0;

    let window = this.#windows.get(key);
    if (!window || now - window.start >= this.#windowMs) {
      if (this.#windows.size > 10_000) this.#prune(now);
      window = { start: now, count: 0 };
      this.#windows.set(key, window);
    }

    window.count++;
    if (window.count <= this.#limit) return 0;
    return Math.ceil((window.start + this.#windowMs - now) / 1000);
  }

  #prune(now: number): void {
    for (const [key, window] of this.#windows) {
      if (now - window.start >= this.#windowMs) this.#windows.delete(key);
    }
  }
}
