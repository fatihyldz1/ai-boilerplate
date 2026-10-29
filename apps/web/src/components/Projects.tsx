import { useState } from "react";

export function Projects(props: {
  projects: readonly { id: string; name: string }[];
  busy: boolean;
  loading: boolean;
  error: string | null;
  onCreate: (name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  return (
    <section className="card">
      <h2>Projects</h2>
      <form
        className="inline-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (name.trim() && (await props.onCreate(name))) setName("");
        }}
      >
        <input
          aria-label="Project name"
          placeholder="New project"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button className="button primary" disabled={props.busy} type="submit">
          Add
        </button>
      </form>
      {props.loading && <p className="muted">Loading projects…</p>}
      {props.error && (
        <p className="error" role="alert">
          {props.error}
        </p>
      )}
      <ul className="project-list">
        {props.projects.map((project) => (
          <li key={project.id}>
            {editing?.id === project.id ? (
              <form
                className="project-edit-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (editing.name.trim() && (await props.onRename(editing.id, editing.name)))
                    setEditing(null);
                }}
              >
                <input
                  aria-label={`Rename ${project.name}`}
                  maxLength={120}
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                />
                <button className="link-button" disabled={props.busy} type="submit">
                  Save
                </button>
                <button className="link-button" type="button" onClick={() => setEditing(null)}>
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
                    disabled={props.busy}
                    onClick={() => setEditing({ id: project.id, name: project.name })}
                  >
                    Rename
                  </button>
                  <button
                    className="link-button danger"
                    type="button"
                    disabled={props.busy}
                    onClick={() => {
                      void props.onDelete(project.id);
                    }}
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
  );
}
