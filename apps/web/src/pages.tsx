import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Landing } from "./pages/Landing.tsx";
import { Protected } from "./pages/Protected.tsx";

const App = lazy(() => import("./pages/App.tsx").then((module) => ({ default: module.App })));
const Auth = lazy(() => import("./pages/Auth.tsx").then((module) => ({ default: module.Auth })));

export function Pages() {
  return (
    <Suspense
      fallback={
        <p className="muted" role="status">
          Loading…
        </p>
      }
    >
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route
          path="/app"
          element={
            <Protected>
              <App />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
