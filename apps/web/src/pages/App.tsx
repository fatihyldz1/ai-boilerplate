import { type FormEvent, useRef, useState } from "react";
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
  const renameProject = trpc.projects.rename.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const [projectName, setProjectName] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    try {
      const response = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: abortController.signal,
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
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "AI request failed.");
    } finally {
      abortControllerRef.current = null;
      setStreaming(false);
    }
  }

  function cancelAI() {
    abortControllerRef.current?.abort();
  }

  async function saveProjectName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProjectId || !editingProjectName.trim()) return;
    await renameProject.mutateAsync({ id: editingProjectId, name: editingProjectName });
    setEditingProjectId(null);
    setEditingProjectName("");
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
                {editingProjectId === project.id ? (
                  <form className="project-edit-form" onSubmit={saveProjectName}>
                    <input
                      aria-label={`Rename ${project.name}`}
                      value={editingProjectName}
                      onChange={(event) => setEditingProjectName(event.target.value)}
                    />
                    <button
                      className="link-button"
                      disabled={renameProject.isPending}
                      type="submit"
                    >
                      Save
                    </button>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => setEditingProjectId(null)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span>{project.name}</span>
                    <span className="project-actions">
                      <button
                        className="link-button"
                        type="button"
                        onClick={() => {
                          setEditingProjectId(project.id);
                          setEditingProjectName(project.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className="link-button danger"
                        type="button"
                        onClick={() => deleteProject.mutate({ id: project.id })}
                      >
                        Delete
                      </button>
                    </span>
                  </>
                )}
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
            <div className="button-row">
              <button className="button primary" disabled={streaming} type="submit">
                {streaming ? "Streaming…" : "Run AI"}
              </button>
              {streaming && (
                <button className="button subtle" type="button" onClick={cancelAI}>
                  Cancel
                </button>
              )}
            </div>
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
