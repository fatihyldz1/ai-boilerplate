export function withRequestLogging(handler: (request: Request) => Promise<Response>) {
  return async function loggedHandler(request: Request) {
    const startedAt = Date.now();
    const response = await handler(request);
    console.log(
      `${request.method} ${new URL(request.url).pathname} ${response.status} ${Date.now() - startedAt}ms`,
    );
    return response;
  };
}
