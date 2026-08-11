const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type FieldError = { field: string; message: string };

export type ApiErrorBody = {
  error?: string;
  message?: string;
  fields?: FieldError[];
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; body: ApiErrorBody };

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch {
    return {
      ok: false,
      status: 0,
      body: { error: "network_error", message: "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่" },
    };
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { ok: false, status: response.status, body: body as ApiErrorBody };
  }

  return { ok: true, data: body as T };
}
