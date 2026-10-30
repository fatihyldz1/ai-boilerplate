export class InferenceError extends Error {
  override name = "InferenceError";
}

export class BudgetError extends InferenceError {
  override name = "BudgetError";
  readonly reasonCode: BudgetReason;

  constructor(message: string, reasonCode: BudgetReason = "invalid_budget") {
    super(message);
    this.reasonCode = reasonCode;
  }
}

export type BudgetReason =
  | "invalid_budget"
  | "model_calls_exhausted"
  | "tool_calls_exhausted"
  | "token_budget_exhausted"
  | "context_overflow"
  | "deadline_exceeded";

export class AgentError extends InferenceError {
  override name = "AgentError";
  readonly reasonCode: "unavailable_tool" | "invalid_tool_arguments" | "duplicate_tools";

  constructor(message: string, reasonCode: AgentError["reasonCode"]) {
    super(message);
    this.reasonCode = reasonCode;
  }
}
