export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'bad_request', message, details);
export const notFound = (message: string) => new HttpError(404, 'not_found', message);
export const unavailable = (message: string, details?: unknown) =>
  new HttpError(503, 'unavailable', message, details);
