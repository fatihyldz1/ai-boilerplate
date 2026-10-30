import type { TokenUsage } from "./contracts.ts";
import { BudgetError } from "./errors.ts";

export type TaskLimits = {
  timeoutMs: number;
  maxModelCalls: number;
  maxToolCalls: number;
  maxTokens: number;
};

export function createTaskBudget(limits: TaskLimits, parentSignal?: AbortSignal) {
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
      throw new BudgetError("Task limits must be positive 32-bit integers.");
    }
  }
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new BudgetError("AI task deadline exceeded.")),
    limits.timeoutMs,
  );
  timer.unref();
  const signal = parentSignal ? AbortSignal.any([parentSignal, deadline.signal]) : deadline.signal;
  let modelCalls = 0;
  let toolCalls = 0;
  let reservedTokens = 0;
  let closed = false;

  function check() {
    signal.throwIfAborted();
    if (closed) throw new BudgetError("AI task is already closed.");
  }

  return {
    signal,
    reserveModel(inputTokens: number, outputTokens: number) {
      check();
      if (![inputTokens, outputTokens].every((n) => Number.isSafeInteger(n) && n > 0)) {
        throw new BudgetError("Invalid model token reservation.");
      }
      const reserved = inputTokens + outputTokens;
      if (modelCalls >= limits.maxModelCalls || reservedTokens + reserved > limits.maxTokens) {
        throw new BudgetError("AI task model or token budget exhausted.");
      }
      modelCalls += 1;
      reservedTokens += reserved;
      let settled = false;
      return {
        settle(usage?: TokenUsage) {
          if (settled) throw new BudgetError("Model reservation was already settled.");
          settled = true;
          if (usage === undefined) return;
          if (!Number.isSafeInteger(usage.totalTokens) || usage.totalTokens < 0) {
            throw new BudgetError("Invalid task token usage.");
          }
          reservedTokens += usage.totalTokens - reserved;
          if (reservedTokens > limits.maxTokens)
            throw new BudgetError("AI task token budget exhausted.");
        },
      };
    },
    reserveTool() {
      check();
      if (toolCalls >= limits.maxToolCalls) throw new BudgetError("AI task tool budget exhausted.");
      toolCalls += 1;
    },
    check,
    close() {
      closed = true;
      clearTimeout(timer);
    },
  };
}

export async function withSignal<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  const aborted = Promise.withResolvers<never>();
  const onAbort = () => aborted.reject(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        signal.throwIfAborted();
        return work();
      }),
      aborted.promise,
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
