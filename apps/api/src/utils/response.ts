import { Response } from 'express';
import { ApiSuccessResponse, ApiErrorResponse, ApiErrorDetail } from '@carbonpilot/shared';

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: ApiSuccessResponse<T>['meta']
): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta,
  };
  return res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: ApiErrorDetail[]
): Response {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
  return res.status(statusCode).json(body);
}

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: ApiErrorDetail[];

  constructor(message: string, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details?: ApiErrorDetail[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
