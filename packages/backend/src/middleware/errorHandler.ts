import type { Request, Response, NextFunction } from 'express'
import { AppError, ValidationError } from '../services/errors.js'

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      code: err.code,
      error: err.message,
      ...(err.details && { details: err.details }),
    })
    return
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.code,
      error: err.message,
    })
    return
  }

  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
}
