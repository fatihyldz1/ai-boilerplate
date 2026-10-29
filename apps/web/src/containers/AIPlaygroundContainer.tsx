import { AIPlayground } from "../components/AIPlayground.tsx";
import { useAIStream } from "../hooks/useAIStream.ts";

export function AIPlaygroundContainer() {
  const ai = useAIStream();
  return (
    <AIPlayground
      answer={ai.text}
      error={ai.error}
      streaming={ai.streaming}
      onRun={ai.run}
      onCancel={ai.cancel}
    />
  );
}
