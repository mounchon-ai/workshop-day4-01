import type { ZodType } from "zod";

export type FieldError = { field: string; message: string };

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errors: FieldError[] };

export function parseBody<T>(schema: ZodType<T>, body: unknown): ParseResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: FieldError[] = result.error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "_root",
    message: issue.message,
  }));
  return { success: false, errors };
}
