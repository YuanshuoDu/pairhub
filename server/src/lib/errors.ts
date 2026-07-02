/**
 * Domain error types.
 *
 * Throw these from route handlers / services; the global error handler
 * translates them into RFC 7807 responses. `code` is the stable machine
 * identifier clients should switch on (see docs/server/api-style.md).
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Preserve V8 stack traces through Error subclasses.
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(details?: Record<string, unknown>) {
    super(400, 'VALIDATION_ERROR', '请求参数校验失败', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '请先登录') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '没有权限') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string) {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

/**
 * 410 Gone — used when the resource was once available but has been
 * permanently removed. In Pairhub we use this for the social-login
 * case where a user soft-deleted their account and then tries to log
 * back in: "this account existed but is gone now, talk to support".
 *
 * Distinct from `NotFoundError` (404) on purpose — the client UI needs
 * to surface a different message ("账号已注销" vs "账号不存在") so
 * the user understands the path forward.
 */
export class GoneError extends AppError {
  constructor(code: string, message: string) {
    super(410, code, message);
  }
}

export class BusinessRuleError extends AppError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(422, code, message, details);
  }
}
