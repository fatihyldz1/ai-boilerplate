import { AIPlaygroundContainer } from "../containers/AIPlaygroundContainer.tsx";
import { ProjectsContainer } from "../containers/ProjectsContainer.tsx";
import { authClient } from "../lib/auth.ts";

export function App() {
  const { data: session } = authClient.useSession();
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
        <ProjectsContainer />
        <AIPlaygroundContainer />
      </div>
    </main>
  );
}
