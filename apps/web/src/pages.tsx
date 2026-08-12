import { Navigate, Route, Routes } from "react-router-dom";
import { App } from "./pages/App.tsx";
import { Auth } from "./pages/Auth.tsx";
import { Landing } from "./pages/Landing.tsx";
import { Protected } from "./pages/Protected.tsx";

export function Pages() {
  return (
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
  );
}
