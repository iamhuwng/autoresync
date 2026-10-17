const MODEL = "gemini-2.5-flash";
const GOOGLE_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_REQUEST_BYTES = 180_000;

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request) => {
  const relayToken = Deno.env.get("RELAY_TOKEN");
  if (!relayToken) {
    return json({ error: "relay_unavailable" }, 503);
  }
  if (request.headers.get("Authorization") !== `Bearer ${relayToken}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const path = new URL(request.url).pathname;
  if (path === "/health" && request.method === "GET") {
    return json({ ready: true }, 200);
  }
  if (path !== "/generateContent") return json({ error: "not_found" }, 404);
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const geminiKey = request.headers.get("X-Provider-Key");
  if (!geminiKey || geminiKey.length > 256) {
    return json({ error: "invalid_request" }, 400);
  }
  if (Number(request.headers.get("Content-Length")) > MAX_REQUEST_BYTES) {
    return json({ error: "request_too_large" }, 413);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
    return json({ error: "request_too_large" }, 413);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (
    !payload || typeof payload !== "object" ||
    !Array.isArray((payload as { contents?: unknown }).contents)
  ) {
    return json({ error: "invalid_request" }, 400);
  }

  try {
    const upstream = await fetch(GOOGLE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: raw,
      signal: AbortSignal.timeout(120_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return json({ error: "provider_unavailable" }, 503);
  }
});
