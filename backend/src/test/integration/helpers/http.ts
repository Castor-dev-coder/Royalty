export interface HttpResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  token?: string;
}

export async function request<T = unknown>(
  baseUrl: string,
  path: string,
  options: HttpRequestOptions = {}
): Promise<HttpResponse<T>> {
  const { method = 'GET', body, headers = {}, token } = options;

  const finalHeaders: Record<string, string> = { ...headers };
  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (token) {
    finalHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsedBody: T;
  try {
    parsedBody = JSON.parse(text) as T;
  } catch {
    parsedBody = text as unknown as T;
  }

  return {
    status: response.status,
    body: parsedBody,
    headers: response.headers,
  };
}
