import type { AIStreamEvent, TokenUsage } from "@app/inference/contracts";

export type AIState = {
  text: string;
  streaming: boolean;
  error: string | null;
  usage: TokenUsage | null;
};
export const initialAIState: AIState = { text: "", streaming: false, error: null, usage: null };

type Action =
  | { type: "start" }
  | { type: "stopped" }
  | { type: "failed"; message: string }
  | { type: "event"; event: AIStreamEvent };

export function reduceAIStream(state: AIState, action: Action): AIState {
  if (action.type === "start") return { ...initialAIState, streaming: true };
  if (action.type === "stopped") return { ...state, streaming: false };
  if (action.type === "failed") return { ...state, streaming: false, error: action.message };
  const event = action.event;
  switch (event.type) {
    case "text-delta":
      return { ...state, text: state.text + event.delta };
    case "usage":
      return { ...state, usage: event.usage };
    case "complete":
      return { ...state, text: event.text, streaming: false };
    case "error":
      return { ...state, error: event.message, streaming: false };
  }
}
