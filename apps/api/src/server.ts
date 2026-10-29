import { env } from "@app/config/env";
import { streamText } from "@app/inference";
import { appRouter, auth, createContext } from "@app/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createAIStreamHandler } from "./ai-stream.ts";
import { startHttpServer } from "./http-server.ts";
import { log, withRequestLogging } from "./logging.ts";

const handleAIStream = createAIStreamHandler(
  (headers) => auth.api.getSession({ headers }),
  streamText,
);

export async function handleRequest(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/health") return new Response("OK");
  if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/"))
    return await auth.handler(request);
  if (url.pathname === "/api/ai/stream") return await handleAIStream(request);
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
