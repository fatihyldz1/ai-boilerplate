import { env } from "@app/config/env";

export function createAIAdmission(
  options: {
    maxRequests?: number;
    maxConcurrent?: number;
    now?: () => number;
  } = {},
) {
  const maxRequests = options.maxRequests ?? env.AI_REQUESTS_PER_MINUTE;
  const maxConcurrent = options.maxConcurrent ?? env.AI_MAX_CONCURRENT_REQUESTS;
  const now = options.now ?? Date.now;
  const users = new Map<string, { expiresAt: number; count: number; active: boolean }>();
  let active = 0;

  // shortcut: admission is per process, use a shared limiter before adding API replicas.
  return function acquire(
    userId: string,
  ): { release: () => void } | { retryAfter: number; reason: string } {
    const time = now();
    for (const [id, entry] of users) {
      if (entry.expiresAt <= time && !entry.active) users.delete(id);
    }
    const entry = users.get(userId) ?? { expiresAt: time + 60_000, count: 0, active: false };
    if (entry.active || active >= maxConcurrent) return { retryAfter: 1, reason: "concurrency" };
    if (entry.count >= maxRequests) {
      return {
        retryAfter: Math.max(1, Math.ceil((entry.expiresAt - time) / 1000)),
        reason: "rate",
      };
    }
    if (users.size >= 10_000 && !users.has(userId)) return { retryAfter: 60, reason: "capacity" };
    entry.count += 1;
    entry.active = true;
    active += 1;
    users.set(userId, entry);
    let released = false;
    return {
      release() {
        if (released) return;
        released = true;
        entry.active = false;
        active -= 1;
        if (entry.expiresAt <= now()) users.delete(userId);
      },
    };
  };
}
