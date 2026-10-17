import { z } from 'zod';
import { AppError } from '@/lib/errors';

/** Standard API envelope: { success: true, data } or { success: false, error }. */
export function ok(data: unknown, init?: ResponseInit): Response {
  return Response.json({ success: true, data }, init);
}

export function fail(
  code: string,
  message: string,
  status: number,
  details?: Record<string, string>,
  headers?: HeadersInit,
): Response {
  return Response.json(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    { status, ...(headers ? { headers } : {}) },
  );
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof AppError)
    return fail(error.code, error.message, error.status, error.details, error.headers);
  if (error instanceof z.ZodError) {
    const details: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join('.') || 'body';
      details[key] ??= issue.message;
    }
    return fail('VALIDATION_ERROR', 'Some fields are invalid.', 422, details);
  }
  console.error('Unhandled API error', error);
  return fail('INTERNAL_ERROR', 'Something went wrong. Please try again.', 500);
}

/** Wraps a route handler so thrown AppErrors / ZodErrors become clean JSON responses. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError('INVALID_JSON', 'Request body must be valid JSON.', 400);
  }
  return schema.parse(body);
}
