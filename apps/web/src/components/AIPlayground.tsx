import { useState } from "react";

export function AIPlayground(props: {
  answer: string;
  error: string | null;
  streaming: boolean;
  onRun: (prompt: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  return (
    <section className="card">
      <h2>AI playground</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void props.onRun(prompt);
        }}
      >
        <label htmlFor="prompt">Prompt</label>
        <textarea
          id="prompt"
          required
          maxLength={20_000}
          rows={6}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask something…"
        />
        <div className="button-row">
          <button className="button primary" disabled={props.streaming} type="submit">
            {props.streaming ? "Streaming…" : "Run AI"}
          </button>
          {props.streaming && (
            <button className="button subtle" type="button" onClick={props.onCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
      {props.error && (
        <p className="error" role="alert">
          {props.error}
        </p>
      )}
      <pre className="answer" aria-live="polite">
        {props.answer || "Your response will appear here."}
      </pre>
    </section>
  );
}
