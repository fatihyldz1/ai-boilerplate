import { createServer } from "node:http";
import { Readable } from "node:stream";
import { env } from "@app/config/env";
import { streamText } from "@app/inference";
import { appRouter, auth, createContext } from "@app/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { withRequestLogging } from "./logging.ts";

async function handleAIStream(request: Request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { prompt?: unknown } | null;
  const prompt = body?.prompt;
  if (typeof prompt !== "string" || prompt.trim().length === 0 || prompt.length > 20_000) {
    return Response.json(
      { error: "prompt must be a non-empty string under 20,000 characters." },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of streamText({ prompt, abortSignal: request.signal })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "AI request failed." })}\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Cache-Control": "no-cache", "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

export async function handleRequest(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === "/health") return new Response("OK");
  if (url.pathname.startsWith("/api/auth")) return await auth.handler(request);
  if (url.pathname === "/api/ai/stream") return await handleAIStream(request);
  if (url.pathname.startsWith("/api")) {
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
  const server = createServer(async (incoming, outgoing) => {
    const origin = `http://${incoming.headers.host ?? `localhost:${port}`}`;
    const headers = Object.entries(incoming.headers).flatMap(([key, value]) =>
      value === undefined
        ? []
        : [[key, Array.isArray(value) ? value.join(", ") : value] as [string, string]],
    );
    const request = new Request(new URL(incoming.url ?? "/", origin), {
      method: incoming.method,
      headers,
      body:
        incoming.method && ["GET", "HEAD"].includes(incoming.method)
          ? undefined
          : (Readable.toWeb(incoming) as unknown as BodyInit),
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await withRequestLogging(handleRequest)(request);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    if (!response.body) return outgoing.end();
    const reader = response.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      outgoing.write(chunk.value);
    }
    outgoing.end();
  });
  server.listen(port, () => console.log(`API listening on http://localhost:${port}`));
}
