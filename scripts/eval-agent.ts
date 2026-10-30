import { env } from "@app/config/env";
import { runEvaluation } from "@app/inference/evaluation";
import { providerConfigId } from "@app/inference";
import { PROJECT_AGENT_PROMPT_VERSION } from "../packages/trpc/src/domain/project-agent-definition.ts";
import {
  evaluateProjectAgent,
  projectAgentScenarios,
  projectAgentDatasetDigest,
  PROJECT_AGENT_SCORER_VERSION,
} from "../packages/trpc/evals/project-agent.ts";

async function main() {
  const args = process.argv.slice(2);
  const usage =
    "Use --live [--repeat 1..20]. Live evaluation makes up to 18 paid model calls per repeat.";
  let repeats = 1;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (seen.has(arg) || !["--live", "--repeat"].includes(arg)) throw new Error(usage);
    seen.add(arg);
    if (arg === "--repeat") {
      const value = args[++i];
      if (!value || !/^(?:[1-9]|1[0-9]|20)$/.test(value)) throw new Error(usage);
      repeats = Number(value);
    }
  }
  if (!seen.has("--live")) throw new Error(usage);
  const scenarios = Array.from({ length: repeats }, (_, index) =>
    projectAgentScenarios.map((scenario) => ({
      ...scenario,
      id: `${scenario.id}:repeat-${index + 1}`,
    })),
  ).flat();
  const report = await runEvaluation(scenarios, (input) => evaluateProjectAgent(input), {
    app: env.APP_VERSION,
    prompt: PROJECT_AGENT_PROMPT_VERSION,
    model: env.OPENAI_MODEL,
    provider: providerConfigId(),
    scorer: PROJECT_AGENT_SCORER_VERSION,
  });
  console.log(
    JSON.stringify(
      {
        dataset: {
          digest: projectAgentDatasetDigest,
          scorer_version: PROJECT_AGENT_SCORER_VERSION,
          repeats,
        },
        ...report,
      },
      null,
      2,
    ),
  );
  if (report.passed !== report.total) process.exitCode = 1;
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Agent evaluation failed.");
  process.exitCode = 1;
});
