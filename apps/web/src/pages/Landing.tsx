import { Link } from "react-router-dom";

export function Landing() {
  return (
    <main className="shell landing">
      <div className="eyebrow">AI APP STARTER</div>
      <h1>Start with a working full-stack AI app.</h1>
      <p className="lede">
        React, Node, PostgreSQL, authentication, typed API routes, and streaming inference in one
        small repository.
      </p>
      <Link className="button primary" to="/auth">
        Open the starter
      </Link>
    </main>
  );
}
