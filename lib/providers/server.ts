export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function callProvider(
  url: string | undefined,
  apiKey: string | undefined,
  payload: unknown,
  providerName: string,
) {
  if (!url || !apiKey) {
    throw new ProviderError(`${providerName} is not configured on the server.`, 503);
  }

  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    throw new ProviderError(`${providerName} endpoint must be a valid URL.`, 503);
  }

  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost") {
    throw new ProviderError(`${providerName} endpoint must use HTTPS.`, 503);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ProviderError(`${providerName} could not be reached. Please retry.`, 502);
  }

  if (!response.ok) {
    throw new ProviderError(`${providerName} returned an error (${response.status}).`, 502);
  }

  try {
    return await response.json() as unknown;
  } catch {
    throw new ProviderError(`${providerName} returned an invalid response.`, 502);
  }
}

export function providerErrorResponse(error: unknown) {
  if (error instanceof ProviderError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  return Response.json({ error: "The request could not be completed." }, { status: 500 });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}