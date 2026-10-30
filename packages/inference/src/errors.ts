export class InferenceError extends Error {
  override name = "InferenceError";
}

export class BudgetError extends InferenceError {
  override name = "BudgetError";
}
