// Tiny in-process TTL cache. Per-instance only (resets on cold start), but it
// makes repeat enrichment of the same address instant within a warm instance —
// the "fast fetches" requirement. Swap for Redis/Upstash when we go multi-instance.

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private store = new Map<string, Entry<V>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < nowMs()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: nowMs() + this.ttlMs });
  }
}

// Date.now() is fine in app runtime code (the restriction is only for workflow scripts).
function nowMs(): number {
  return Date.now();
}
