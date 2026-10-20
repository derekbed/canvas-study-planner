export async function requestJson<T>(
  url: string,
  fallback: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      result && typeof result === "object" && "error" in result
        ? result.error
        : null;
    throw new Error(typeof message === "string" ? message : fallback);
  }
  if (result === null) throw new Error(fallback);
  return result as T;
}

export function jsonBody(value: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  };
}
