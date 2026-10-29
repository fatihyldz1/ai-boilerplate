export class HttpInputError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpInputError(415, "Use application/json.");
  }
  const length = request.headers.get("content-length");
  if (length !== null && Number(length) > maxBytes) {
    throw new HttpInputError(413, "Request body is too large.");
  }
  if (!request.body) throw new HttpInputError(400, "A JSON body is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new HttpInputError(413, "Request body is too large.");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error instanceof HttpInputError) throw error;
    throw new HttpInputError(400, "Invalid JSON body.");
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
