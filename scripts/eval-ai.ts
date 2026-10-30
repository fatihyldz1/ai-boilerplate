import { env } from "@app/config/env";
import { providerConfigId, streamText, TEXT_PROMPT_VERSION } from "@app/inference";
import { runEvaluation } from "@app/inference/evaluation";
import { textScenarios } from "../packages/inference/evals/scenarios.ts";
import type { TokenUsage } from "@app/inference/contracts";

if (process.argv.slice(2).join(" ") !== "--live") {
  console.error(
    "Live evaluation makes two paid model requests. Run npm run eval:ai -- --live to opt in.",
  );
  process.exitCode = 1;
} else {
  const report = await runEvaluation(
    textScenarios,
    async (prompt) => {
      let text: string | undefined;
      let usage: TokenUsage | undefined;
      for await (const event of streamText({
        prompt,
        abortSignal: AbortSignal.timeout(env.AI_TIMEOUT_MS),
      })) {
        if (event.type === "complete") text = event.text;
        if (event.type === "usage") usage = event.usage;
        if (event.type === "error") throw new Error("Inference failed.");
      }
      if (text === undefined) throw new Error("Inference ended before completion.");
      return { text, usage };
    },
    {
      app: env.APP_VERSION,
      prompt: TEXT_PROMPT_VERSION,
      model: env.OPENAI_MODEL,
      provider: providerConfigId(),
      scorer: "text-scorers-v1",
    },
  );
  console.log(JSON.stringify(report, null, 2));
  if (report.passed !== report.total) process.exitCode = 1;
}
