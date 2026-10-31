/**
 * Error monitoring (M7): one structured JSON line per server error on stderr (ship to any log
 * collector), plus an optional webhook (ERROR_WEBHOOK_URL, e.g. Slack/Discord/Sentry relay).
 * Request headers are never forwarded — they may contain session cookies.
 */
export async function reportError(err: unknown, where: { path?: string; method?: string; routeType?: string; digest?: string }) {
  const e = err instanceof Error ? err : new Error(String(err));
  const entry = {
    level: "error",
    time: new Date().toISOString(),
    message: e.message,
    name: e.name,
    stack: e.stack?.split("\n").slice(0, 8).join("\n"),
    ...where,
  };
  console.error(JSON.stringify(entry));
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `KopiPass error: ${entry.message} (${where.method ?? ""} ${where.path ?? ""})`, ...entry }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* never let monitoring break the request */
  }
}
