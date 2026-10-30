import type { TokenUsage } from "./contracts.ts";

export type EvaluationOutput = { text: string; usage?: TokenUsage };
export type EvaluationScenario<Input> = {
  id: string;
  version: string;
  input: Input;
  score: (output: EvaluationOutput) => boolean | Promise<boolean>;
};

export async function runEvaluation<Input>(
  scenarios: EvaluationScenario<Input>[],
  execute: (input: Input) => Promise<EvaluationOutput>,
  versions: { app: string; prompt: string; model: string; provider: string; scorer: string },
) {
  const cases = [];
  for (const scenario of scenarios) {
    const startedAt = performance.now();
    let stage: "execution" | "scoring" = "execution";
    let output: EvaluationOutput | undefined;
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
      });
    } catch {
      cases.push({
        id: scenario.id,
        version: scenario.version,
        status: "error" as const,
        stage,
        durationMs: performance.now() - startedAt,
        usage: output?.usage,
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
