import { Request, Response, NextFunction } from 'express';
import { authService } from './service';
import { sendError, sendSuccess } from '../../utils/response';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.register(req.body);
      return sendSuccess(res, result, 201);
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.login(req.body);
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not logged in' } });
      }
      const result = await authService.getMe(req.user.userId);
      return sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(_req: Request, res: Response, _next: NextFunction) {
    return sendError(res, 501, 'PASSWORD_RESET_UNAVAILABLE', 'Password reset is not available in this demo.');
  }

  async resetPassword(_req: Request, res: Response, _next: NextFunction) {
    return sendError(res, 501, 'PASSWORD_RESET_UNAVAILABLE', 'Password reset is not available in this demo.');
  }
}

export const authController = new AuthController();
