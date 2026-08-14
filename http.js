// Fetch wrapper: auto JSON, throws HttpError on !ok, timeout, query params.

class HttpError extends Error {
  constructor(response, data) {
    super(`HTTP ${response.status} ${response.statusText || ""} — ${response.url}`);
    this.name = "HttpError";
    this.status = response.status;
    this.url = response.url;
    this.data = data; // parsed response body
    this.response = response;
  }
}

const isPlainBody = (v) =>
  v instanceof FormData ||
  v instanceof URLSearchParams ||
  v instanceof Blob ||
  v instanceof ArrayBuffer;

function buildUrl(url, params, baseURL) {
  const full = /^https?:\/\//i.test(url) ? url : baseURL.replace(/\/$/, "") + url;
  if (!params) return full;

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    Array.isArray(value)
      ? value.forEach((v) => qs.append(key, v))
      : qs.append(key, value);
  }
  const query = qs.toString();
  if (!query) return full;
  return full + (full.includes("?") ? "&" : "?") + query;
}

async function parseBody(response) {
  if (response.status === 204 || response.headers.get("content-length") === "0") return null;

  const type = response.headers.get("content-type") || "";
  if (type.includes("json")) return response.json();
  if (type.startsWith("text/") || type.includes("xml")) return response.text();
  return response.blob();
}

function createClient(config = {}) {
  const baseURL = config.baseURL || "";
  const defaultTimeout = config.timeout ?? 15000;
  const defaultHeaders = { Accept: "application/json, text/plain, */*", ...config.headers };

  async function request(url, options = {}) {
    const { params, data, timeout = defaultTimeout, headers, signal, ...rest } = options;
    const finalHeaders = { ...defaultHeaders, ...headers };

    let body;
    if (data !== undefined && data !== null) {
      if (isPlainBody(data)) {
        body = data; // browser sets Content-Type
      } else {
        body = JSON.stringify(data);
        finalHeaders["Content-Type"] ??= "application/json";
      }
    }

    // caller signal + timeout, whichever fires first
    const signals = [signal, timeout ? AbortSignal.timeout(timeout) : null].filter(Boolean);

    let response;
    try {
      response = await fetch(buildUrl(url, params, baseURL), {
        ...rest,
        headers: finalHeaders,
        body,
        signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
      });
    } catch (err) {
      if (err.name === "TimeoutError") throw new Error(`Request timed out after ${timeout}ms: ${url}`);
      throw err;
    }

    const payload = await parseBody(response);
    if (!response.ok) throw new HttpError(response, payload);
    return payload;
  }

  return {
    request,
    get: (url, options) => request(url, { ...options, method: "GET" }),
    post: (url, data, options) => request(url, { ...options, method: "POST", data }),
    put: (url, data, options) => request(url, { ...options, method: "PUT", data }),
    patch: (url, data, options) => request(url, { ...options, method: "PATCH", data }),
    delete: (url, options) => request(url, { ...options, method: "DELETE" }),
    create: createClient, // http.create({ baseURL: '/cart' })
  };
}

// The only place that knows an HttpError carries the server's message in `data`.
export function errorMessage(err, fallback) {
  return err.data?.description || err.message || fallback;
}

export const http = createClient();
export { HttpError, createClient };
