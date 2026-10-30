import { runAgent, type AgentModel, type AgentEvent } from "@app/inference/agent";
import { agentModel } from "@app/inference/agent-model";
import * as Project from "./project.ts";
import {
  createProjectReadTool,
  PROJECT_AGENT_INSTRUCTIONS,
  projectAgentLimits,
} from "./project-agent-definition.ts";
export { PROJECT_AGENT_PROMPT_VERSION, projectAgentRelease } from "./project-agent-definition.ts";

export function projectReadTool(userId: string) {
  return createProjectReadTool(userId, Project.getProject);
}

export async function runProjectAgent(
  input: {
    prompt: string;
    userId: string;
    requestId?: string;
    signal?: AbortSignal;
    onEvent?: (event: AgentEvent) => void;
  },
  model: AgentModel = agentModel(input),
) {
  return await runAgent({
    prompt: input.prompt,
    instructions: PROJECT_AGENT_INSTRUCTIONS,
    tools: [projectReadTool(input.userId)],
    model,
    limits: projectAgentLimits(),
    signal: input.signal,
    onEvent: input.onEvent,
  });
}
