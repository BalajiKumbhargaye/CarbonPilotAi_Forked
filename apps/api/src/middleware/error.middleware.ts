import { Request, Response, NextFunction } from 'express';
import { AppError, sendError } from '../utils/response';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): Response {
  if (err instanceof AppError) {
    logger.warn(`Handled operational error: ${err.message}`, {
      path: req.path,
      method: req.method,
      code: err.code,
      statusCode: err.statusCode,
    });
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }

  logger.error(`Unhandled unexpected error: ${err.message}`, {
    path: req.path,
    method: req.method,
    stack: err.stack,
  });

  return sendError(
    res,
    500,
    'INTERNAL_SERVER_ERROR',
    process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message
  );
}
