import { useEffect, useReducer, useRef } from "react";
import { streamAI } from "../data/ai-stream.ts";
import * as AIStream from "../model/ai-stream.ts";

export function useAIStream() {
  const [state, dispatch] = useReducer(AIStream.reduceAIStream, AIStream.initialAIState);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function run(prompt: string) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    dispatch({ type: "start" });
    try {
      for await (const event of streamAI(prompt, controller.signal)) {
        if (controller.signal.aborted) break;
        dispatch({ type: "event", event });
      }
    } catch (error) {
      if (!controller.signal.aborted)
        dispatch({
          type: "failed",
          message: error instanceof Error ? error.message : "AI request failed.",
        });
    } finally {
      active.current = null;
      dispatch({ type: "stopped" });
    }
  }

  function cancel() {
    active.current?.abort();
  }
  return { ...state, run, cancel };
}
