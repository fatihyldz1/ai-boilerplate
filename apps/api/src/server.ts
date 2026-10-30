import { env } from "@app/config/env";
import { streamText } from "@app/inference";
import { appRouter, auth, createContext, PROJECT_AGENT_PROMPT_VERSION } from "@app/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createAIStreamHandler } from "./ai-stream.ts";
import { startHttpServer } from "./http-server.ts";
import { log, withRequestLogging } from "./logging.ts";
import { createAIAdmission } from "./admission.ts";
import { streamProjectAgent } from "./project-agent.ts";

const acquireAI = createAIAdmission();
const handleAIStream = createAIStreamHandler(
  (headers) => auth.api.getSession({ headers }),
  streamText,
  acquireAI,
);
const handleProjectAgent = createAIStreamHandler(
  (headers) => auth.api.getSession({ headers }),
  streamProjectAgent,
  acquireAI,
  PROJECT_AGENT_PROMPT_VERSION,
);

export async function handleRequest(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/health") return new Response("OK");
  if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/"))
    return await auth.handler(request);
  if (url.pathname === "/api/ai/stream") return await handleAIStream(request);
  if (url.pathname === "/api/ai/projects") return await handleProjectAgent(request);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return await fetchRequestHandler({
      endpoint: "/api",
      req: request,
      router: appRouter,
      createContext,
    });
  }
  return new Response("Not found", { status: 404 });
}

export function startApi(port: number = env.PORT) {
  const server = startHttpServer(withRequestLogging(handleRequest), port, env.HOST);
  server.once("listening", () => log("http_server_started"));
  return server;
}
