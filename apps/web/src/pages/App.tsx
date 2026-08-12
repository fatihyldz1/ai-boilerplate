import { type FormEvent, useState } from "react";
import { authClient } from "../lib/auth.ts";
import { trpc } from "../lib/trpc.ts";

export function App() {
  const { data: session } = authClient.useSession();
  const projects = trpc.projects.list.useQuery();
  const utils = trpc.useUtils();
  const createProject = trpc.projects.create.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const [projectName, setProjectName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectName.trim()) return;
    await createProject.mutateAsync({ name: projectName });
    setProjectName("");
  }

  async function runAI(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnswer("");
    setError(null);
    setStreaming(true);
    try {
      const response = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "AI request failed.");
      if (!response.body) throw new Error("AI response did not contain a stream.");
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += chunk.value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as { type: string; delta?: string; message?: string };
          if (event.type === "text-delta") setAnswer((current) => current + (event.delta ?? ""));
          if (event.type === "error") throw new Error(event.message ?? "AI request failed.");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI request failed.");
    } finally {
      setStreaming(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="eyebrow">AI APP STARTER</div>
          <h1>Your app</h1>
        </div>
        <button className="button subtle" type="button" onClick={() => authClient.signOut()}>
          Sign out
        </button>
      </header>
      <p className="muted">Signed in as {session?.user.email}</p>
      <div className="app-grid">
        <section className="card">
          <h2>Projects</h2>
          <form className="inline-form" onSubmit={addProject}>
            <input
              aria-label="Project name"
              placeholder="New project"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
            <button className="button primary" disabled={createProject.isPending} type="submit">
              Add
            </button>
          </form>
          <ul className="project-list">
            {projects.data?.map((project) => (
              <li key={project.id}>
                <span>{project.name}</span>
                <button
                  className="link-button danger"
                  type="button"
                  onClick={() => deleteProject.mutate({ id: project.id })}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>AI playground</h2>
          <form onSubmit={runAI}>
            <label htmlFor="prompt">Prompt</label>
            <textarea
              id="prompt"
              required
              rows={6}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask something…"
            />
            <button className="button primary" disabled={streaming} type="submit">
              {streaming ? "Streaming…" : "Run AI"}
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <pre className="answer">{answer || "Your response will appear here."}</pre>
        </section>
      </div>
    </main>
  );
}
