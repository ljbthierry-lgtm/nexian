/** Application errors: fail loudly with a typed code; the global handler renders them. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (msg: string, code = "bad_request") => new AppError(400, code, msg);
export const unauthorized = (msg = "Authentication required") =>
  new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "Not allowed for your role") => new AppError(403, "forbidden", msg);
export const notFound = (msg = "Not found") => new AppError(404, "not_found", msg);
export const conflict = (msg: string) => new AppError(409, "conflict", msg);
