import { once } from "node:events";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { log, requestContext } from "./logging.ts";

export function startHttpServer(
  handler: (request: Request) => Promise<Response> | Response,
  port: number,
  host = "127.0.0.1",
) {
  const server = createServer(async (incoming, outgoing) => {
    const abortController = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let request: Request | undefined;
    const startedAt = performance.now();
    function cancel() {
      if (outgoing.writableFinished) return;
      abortController.abort();
      void reader?.cancel().catch(() => {});
    }
    incoming.once("aborted", cancel);
    outgoing.once("close", cancel);
    try {
      const headers = new Headers();
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
        headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
      }
      request = new Request(
        new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? "localhost"}`),
        {
          method: incoming.method,
          headers,
          body:
            incoming.method && ["GET", "HEAD"].includes(incoming.method)
              ? undefined
              : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>),
          signal: abortController.signal,
          duplex: "half",
        } as RequestInit & { duplex: "half" },
      );
      const response = await handler(request);
      if (outgoing.destroyed) {
        await response.body?.cancel();
        return;
      }
      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") outgoing.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) outgoing.setHeader("set-cookie", cookies);
      if (request.method === "HEAD" || !response.body) {
        await response.body?.cancel();
        outgoing.end();
      } else {
        reader = response.body.getReader();
        while (!outgoing.destroyed) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (!outgoing.write(chunk.value))
            await once(outgoing, "drain", { signal: abortController.signal });
        }
        if (!outgoing.destroyed) outgoing.end();
      }
      if (!outgoing.writableFinished && !outgoing.destroyed)
        await once(outgoing, "finish", { signal: abortController.signal });
      log("http_finished", {
        ...(request && requestContext(request)),
        duration_ms: performance.now() - startedAt,
        outcome: outgoing.writableFinished ? "complete" : "cancelled",
      });
    } catch (error) {
      if (!abortController.signal.aborted) {
        log(
          "http_transport_error",
          {
            ...(request && requestContext(request)),
            error_type: error instanceof Error ? error.name : "UnknownError",
          },
          "error",
        );
        if (outgoing.headersSent) outgoing.destroy();
        else {
          outgoing.writeHead(500, { "Content-Type": "application/json" });
          outgoing.end(JSON.stringify({ error: "Internal server error." }));
        }
      }
    } finally {
      if (reader) {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      incoming.off("aborted", cancel);
      outgoing.off("close", cancel);
    }
  });
  server.listen(port, host);
  return server;
}
