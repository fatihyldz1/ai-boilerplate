import { AgentError, BudgetError, type BudgetReason } from "./errors.ts";

export type AgentReason =
  | BudgetReason
  | AgentError["reasonCode"]
  | "completed"
  | "step_completed"
  | "cancelled"
  | "execution_error";

export type AgentEvent =
  | {
      event_type: "agent_step_finished";
      step_id: number;
      step_type: "model" | "tool";
      tool_name?: string;
      duration_ms: number;
      outcome: "complete" | "error";
      reason_code: AgentReason;
    }
  | {
      event_type: "agent_finished";
      duration_ms: number;
      outcome: "complete" | "error";
      reason_code: AgentReason;
    };

export function agentFailureReason(error: unknown, signal?: AbortSignal): AgentReason {
  if (error instanceof BudgetError || error instanceof AgentError) return error.reasonCode;
  if (signal?.aborted) {
    if (signal.reason instanceof BudgetError) return signal.reason.reasonCode;
    if (signal.reason instanceof DOMException && signal.reason.name === "TimeoutError")
      return "deadline_exceeded";
    return "cancelled";
  }
  return "execution_error";
}
