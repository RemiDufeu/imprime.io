export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code?: string) {
    super(message, 404, code)
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    code?: string,
    public readonly details?: string[]
  ) {
    super(message, 400, code)
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code?: string) {
    super(message, 409, code)
  }
}
