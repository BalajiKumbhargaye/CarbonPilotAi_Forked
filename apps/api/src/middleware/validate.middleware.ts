import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { sendError } from '../utils/response';

export function validate(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError || (error instanceof Error && error.name === 'ZodError')) {
        const validationError = error as ZodError;
        const details = validationError.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        sendError(res, 400, 'VALIDATION_ERROR', 'Validation failed', details);
        return;
      }
      next(error);
    }
  };
}
