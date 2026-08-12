import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth.ts";

export function Auth() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isPending && session?.user) return <Navigate to="/app" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result =
      mode === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ name, email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Authentication failed.");
      return;
    }
    navigate("/app");
  }

  return (
    <main className="shell centered">
      <section className="card auth-card">
        <div className="eyebrow">AI APP STARTER</div>
        <h1>{mode === "sign-in" ? "Welcome back" : "Create an account"}</h1>
        <form onSubmit={submit}>
          {mode === "sign-up" && (
            <label>
              Name
              <input required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          )}
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy} type="submit">
            {busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Sign up"}
          </button>
        </form>
        <button
          className="link-button"
          type="button"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </section>
    </main>
  );
}
