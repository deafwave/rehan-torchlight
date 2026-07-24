/**
 * Cloudflare Worker entry point for the static Vite application.
 * Sites supplies the ASSETS fetcher for the files staged beside this worker.
 */
const worker = {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;

    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    if (!acceptsHtml) return response;

    const fallback = new URL("/index.html", request.url);
    return env.ASSETS.fetch(new Request(fallback, request));
  },
};

export default worker;
