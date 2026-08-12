import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authClient } from "../lib/auth.ts";

export function Protected({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data: session, isPending } = authClient.useSession();
  if (isPending)
    return (
      <main className="shell centered">
        <p>Loading…</p>
      </main>
    );
  if (!session?.user)
    return <Navigate to={`/auth?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}
