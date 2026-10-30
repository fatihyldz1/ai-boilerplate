import type { TokenUsage } from "./contracts.ts";
import type { AgentEvent } from "./agent-events.ts";

export type EvaluationOutput = { text: string; usage?: TokenUsage; events?: AgentEvent[] };
export class EvaluationExecutionError extends Error {
  readonly events: AgentEvent[];

  constructor(events: AgentEvent[]) {
    super("Evaluation execution failed.");
    this.events = events;
  }
}
export type EvaluationScenario<Input, Output extends EvaluationOutput = EvaluationOutput> = {
  id: string;
  version: string;
  input: Input;
  score: (output: Output) => boolean | Promise<boolean>;
};

export async function runEvaluation<Input, Output extends EvaluationOutput>(
  scenarios: EvaluationScenario<Input, Output>[],
  execute: (input: Input) => Promise<Output>,
  versions: { app: string; prompt: string; model: string; provider: string; scorer: string },
) {
  const cases = [];
  for (const scenario of scenarios) {
    const startedAt = performance.now();
    let stage: "execution" | "scoring" = "execution";
    let output: Output | undefined;
    try {
      output = await execute(scenario.input);
      stage = "scoring";
      const passed = await scenario.score(output);
      if (typeof passed !== "boolean") throw new Error("Scorer must return a boolean.");
      cases.push({
        id: scenario.id,
        version: scenario.version,
        status: passed ? ("passed" as const) : ("failed" as const),
        durationMs: performance.now() - startedAt,
        usage: output.usage,
        events: output.events,
      });
    } catch (error) {
      cases.push({
        id: scenario.id,
        version: scenario.version,
        status: "error" as const,
        stage,
        durationMs: performance.now() - startedAt,
        usage: output?.usage,
        events: error instanceof EvaluationExecutionError ? error.events : output?.events,
      });
    }
  }
  return {
    versions,
    total: cases.length,
    passed: cases.filter((item) => item.status === "passed").length,
    cases,
  };
}
