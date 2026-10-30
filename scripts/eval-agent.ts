import { env } from "@app/config/env";
import { runEvaluation } from "@app/inference/evaluation";
import { createEvaluationEvidence, requireReleaseIdentity } from "@app/inference/release";
import { projectAgentRelease } from "../packages/trpc/src/domain/project-agent-definition.ts";
import {
  evaluateProjectAgent,
  projectAgentScenarios,
  projectAgentDatasetDigest,
  PROJECT_AGENT_SCORER_VERSION,
} from "../packages/trpc/evals/project-agent.ts";

async function main() {
  const args = process.argv.slice(2);
  const usage =
    "Use --manifest (no calls), or --live [--repeat 1..20] [--release]. Live evaluation makes up to 18 paid model calls per repeat.";
  if (args.length === 1 && args[0] === "--manifest") {
    console.log(JSON.stringify(projectAgentRelease(), null, 2));
    return;
  }
  let repeats = 1;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (seen.has(arg) || !["--live", "--repeat", "--release"].includes(arg)) throw new Error(usage);
    seen.add(arg);
    if (arg === "--repeat") {
      const value = args[++i];
      if (!value || !/^(?:[1-9]|1[0-9]|20)$/.test(value)) throw new Error(usage);
      repeats = Number(value);
    }
  }
  if (!seen.has("--live")) throw new Error(usage);
  const release = projectAgentRelease();
  if (seen.has("--release")) requireReleaseIdentity(release);
  const scenarios = Array.from({ length: repeats }, (_, index) =>
    projectAgentScenarios.map((scenario) => ({
      ...scenario,
      id: `${scenario.id}:repeat-${index + 1}`,
    })),
  ).flat();
  const report = await runEvaluation(scenarios, (input) => evaluateProjectAgent(input), {
    app: env.APP_VERSION,
    prompt: release.prompt_version,
    model: release.model,
    provider: release.provider_config_id,
    scorer: PROJECT_AGENT_SCORER_VERSION,
  });
  const evidence = createEvaluationEvidence(
    release,
    {
      digest: projectAgentDatasetDigest,
      scorer_version: PROJECT_AGENT_SCORER_VERSION,
      repeats,
    },
    report,
  );
  console.log(JSON.stringify(evidence, null, 2));
  if (report.passed !== report.total) process.exitCode = 1;
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Agent evaluation failed.");
  process.exitCode = 1;
});
